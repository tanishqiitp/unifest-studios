// One-click fixes for common problems, and keeping screens and truss in step with the stage.
// Every change goes through the store's mutate(), so each one is a single, undoable step.
import type { Project, Screen } from '../types'
import { autoRig, screenSize, stageBounds } from './calc'
import { findPanel } from './panels'

export interface Fix {
  label: string
  apply: (p: Project) => void
}

const r2 = (n: number) => Math.round(n * 100) / 100
const width = (s: Screen, p: Project) => screenSize(s, findPanel(s.panelId, p.customPanels)).w

// ---------------------------------------------------------------- simple fixes

/** Move (and if needed shrink) a rectangle so it lies inside the venue. */
export function fitRectInside(r: { x: number; y: number; w: number; h: number }, W: number, L: number) {
  r.w = Math.min(r.w, W)
  r.h = Math.min(r.h, L)
  r.x = r2(Math.min(Math.max(0, r.x), W - r.w))
  r.y = r2(Math.min(Math.max(0, r.y), L - r.h))
}

export const fixGroundInside = (id: string): Fix => ({
  label: 'Move inside venue',
  apply: (p) => {
    const g = p.ground.find((x) => x.id === id)
    if (g) fitRectInside(g, p.venue.w, p.venue.l)
  },
})

export const fixTableInside = (id: string): Fix => ({
  label: 'Move inside venue',
  apply: (p) => {
    const t = p.tables.find((x) => x.id === id)
    if (!t) return
    const r = Math.max(t.w, t.l) / 2
    t.x = r2(Math.min(Math.max(r, t.x), p.venue.w - r))
    t.y = r2(Math.min(Math.max(r, t.y), p.venue.l - r))
  },
})

export const fixAutoRig: Fix = { label: 'Auto-rig hoists', apply: (p) => void (p.hoists = autoRig(p)) }

export const fixScreenToStageFloor = (id: string): Fix => ({
  label: 'Raise to stage floor',
  apply: (p) => {
    const s = p.screens.find((x) => x.id === id)
    const sb = stageBounds(p)
    if (s && sb) s.z = r2(sb.h)
  },
})

export const fixScreenGroundStack = (id: string): Fix => ({
  label: 'Make it ground-stacked',
  apply: (p) => {
    const s = p.screens.find((x) => x.id === id)
    if (!s) return
    s.mount = 'ground'
    s.z = r2(Math.max(s.z, stageBounds(p)?.h ?? 0))
  },
})

export const fixExtendTruss = (screenId: string, trussId: string): Fix => ({
  label: 'Extend the truss',
  apply: (p) => {
    const s = p.screens.find((x) => x.id === screenId)
    const t = p.truss.find((x) => x.id === trussId)
    if (!s || !t) return
    const lo = Math.min(Math.min(t.x1, t.x2), s.x - 0.5)
    const hi = Math.max(Math.max(t.x1, t.x2), s.x + width(s, p) + 0.5)
    if (t.x1 <= t.x2) [t.x1, t.x2] = [r2(lo), r2(hi)]
    else [t.x1, t.x2] = [r2(hi), r2(lo)]
  },
})

// ---------------------------------------------------------------- keep things in step with the stage

export interface StageFit {
  changes: string[] // what would change, in plain words
  apply: (p: Project) => void
}

const isHorizontal = (t: Project['truss'][number]) => Math.abs(t.y1 - t.y2) < 0.1

/**
 * When the stage changes, the main LED should stay centred on it, trusses over it should stay at least as wide
 * as it, and side screens should not end up overlapping it. Returns null when everything already fits.
 * Never shrinks a truss or touches screens that are not above or beside the stage.
 */
export function stageFit(p: Project): StageFit | null {
  const sb = stageBounds(p)
  if (!sb) return null
  const cx = sb.x + sb.w / 2
  const changes: string[] = []
  const mirrored = new Set(p.screens.map((s) => s.mirrorOf).filter(Boolean))
  // Main screens: not mirrored and not mirroring, with their centre over the stage's width (plus 2 m).
  const near = (s: Screen) => s.y >= sb.y - 3 && s.y <= sb.y + sb.l + 3
  // Main screens: not mirrored and not mirroring, over the stage (within its width + 2 m, and near it in depth,
  // so delay screens further down the venue are left alone).
  const main = p.screens.filter((s) => !s.mirrorOf && !mirrored.has(s.id) && near(s) && s.x + width(s, p) / 2 > sb.x - 2 && s.x + width(s, p) / 2 < sb.x + sb.w + 2)
  let shift = 0
  if (main.length) {
    const lo = Math.min(...main.map((s) => s.x))
    const hi = Math.max(...main.map((s) => s.x + width(s, p)))
    shift = r2(cx - (lo + hi) / 2)
    if (Math.abs(shift) > 0.2) changes.push(`Centre ${main.length === 1 ? main[0].name : `${main.length} main screens`} on the stage (${shift > 0 ? '+' : ''}${shift} m)`)
    else shift = 0
  }
  // Side screens (mirror pairs): if either screen of a pair now overlaps the stage, move the pair outwards
  // together (the mirror follows its source across the venue centre line).
  const intrusion = (s: Screen) => {
    const w = width(s, p)
    if (!near(s) || s.x >= sb.x + sb.w + 0.5 || s.x + w <= sb.x - 0.5) return 0
    return s.x + w / 2 < cx ? s.x + w - (sb.x - 0.5) : sb.x + sb.w + 0.5 - s.x
  }
  const sideMoves = p.screens
    .filter((s) => mirrored.has(s.id) && !s.mirrorOf)
    .map((s) => {
      const m = p.screens.find((x) => x.mirrorOf === s.id)
      const d = r2(Math.max(intrusion(s), m ? intrusion(m) : 0))
      if (d <= 0.05) return null
      // Same reference as the overlap test: away from the stage centre.
      const outward = s.x + width(s, p) / 2 < cx ? -1 : 1
      return { id: s.id, name: s.name, x: r2(s.x + outward * d) }
    })
    .filter((m): m is { id: string; name: string; x: number } => !!m)
  for (const m of sideMoves) changes.push(`Move ${m.name} (and its mirror) clear of the stage`)
  // Trusses that span the stage (at least 60% of its width): extend to the stage width + 0.5 m each side.
  // Short pieces (towers, DJ bars, pipes) are left alone, and nothing is ever shortened.
  const trussMoves = p.truss
    .filter((t) => isHorizontal(t) && Math.abs(t.x2 - t.x1) >= sb.w * 0.6 && t.y1 >= sb.y - 4 && t.y1 <= sb.y + sb.l + 4 && Math.max(t.x1, t.x2) > sb.x && Math.min(t.x1, t.x2) < sb.x + sb.w)
    .map((t) => {
      const lo = Math.min(t.x1, t.x2)
      const hi = Math.max(t.x1, t.x2)
      const nlo = Math.min(lo, r2(sb.x - 0.5))
      const nhi = Math.max(hi, r2(sb.x + sb.w + 0.5))
      return nlo < lo - 0.01 || nhi > hi + 0.01 ? { id: t.id, lo: nlo, hi: nhi } : null
    })
    .filter((m): m is { id: string; lo: number; hi: number } => !!m)
  if (trussMoves.length) changes.push(`Extend ${trussMoves.length === 1 ? 'a truss' : `${trussMoves.length} trusses`} to cover the stage width`)
  if (!changes.length) return null
  const mainIds = new Set(shift ? main.map((s) => s.id) : [])
  return {
    changes,
    apply: (q) => {
      for (const s of q.screens) if (mainIds.has(s.id)) s.x = r2(s.x + shift)
      for (const m of sideMoves) {
        const s = q.screens.find((x) => x.id === m.id)
        if (!s) continue
        s.x = m.x
        // Its mirror follows across the venue centre line (the store does this too; done here so the fix is
        // complete on its own).
        for (const mr of q.screens.filter((x) => x.mirrorOf === s.id)) mr.x = r2(q.venue.w - s.x - width(s, q))
      }
      for (const m of trussMoves) {
        const t = q.truss.find((x) => x.id === m.id)
        if (!t) continue
        if (t.x1 <= t.x2) [t.x1, t.x2] = [m.lo, m.hi]
        else [t.x1, t.x2] = [m.hi, m.lo]
      }
    },
  }
}

/** A short key for the stage's footprint, used to remember "Not now" until the stage changes again. */
export function stageKey(p: Project) {
  const sb = stageBounds(p)
  return sb ? `${r2(sb.x)}:${r2(sb.w)}:${r2(sb.y)}:${r2(sb.l)}` : ''
}
