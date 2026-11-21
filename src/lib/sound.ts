// Sound planning: a generic loudspeaker library, automatic system sizing and a coverage estimate.
//
// The coverage model is a planning estimate for open-air and large rooms, not an acoustic simulation:
//  - point sources lose 6 dB per doubling of distance; line arrays lose 3 dB per doubling up to their
//    near-field limit (about 3 × the hang height) and 6 dB after it;
//  - each source is limited by its coverage angles (−6 dB at the edge, more outside, never below −25 dB);
//  - air absorbs about 1 dB per 100 m; all sources add up by energy;
//  - the system runs 10 dB below its maximum, so programme peaks have headroom.
//  - like a real engineer, the mains are set so the mixing desk gets the target level; fills and delays
//    are set to top up their own zones. The spare level (headroom) is reported, and a shortfall warned.
// Reflections, wind, temperature and the crowd are ignored. Expect ±3–6 dB; confirm with the PA maker's tool.
import { nanoid } from 'nanoid'
import type { Project, SoundPlan, SoundRole, SoundSource } from '../types'
import { screenStats, stageBounds } from './calc'

export type SpeakerId = 'la12' | 'la10' | 'top15' | 'top12' | 'sub18' | 'fill8' | 'mon12'
export interface Speaker {
  id: SpeakerId
  name: string
  kind: 'array' | 'point' | 'sub' | 'monitor'
  spl: number // max SPL at 1 m, one box (dB)
  h: number // horizontal coverage, degrees
  v: number // vertical coverage, degrees (point sources); per-box splay for arrays
  kg: number // per box
  drawW: number // typical continuous electrical draw per box incl. amplifier share, music programme
  boxH: number // box height, metres
  rate: number // INR per box per day
}
export const SPEAKERS: Record<SpeakerId, Speaker> = {
  la12: { id: 'la12', name: '12″ line array box', kind: 'array', spl: 140, h: 100, v: 10, kg: 60, drawW: 800, boxH: 0.36, rate: 4500 },
  la10: { id: 'la10', name: '10″ line array box', kind: 'array', spl: 136, h: 110, v: 12, kg: 40, drawW: 500, boxH: 0.3, rate: 3500 },
  top15: { id: 'top15', name: '15″ point-source speaker', kind: 'point', spl: 133, h: 70, v: 50, kg: 35, drawW: 400, boxH: 0.75, rate: 2000 },
  top12: { id: 'top12', name: '12″ point-source speaker', kind: 'point', spl: 131, h: 90, v: 60, kg: 25, drawW: 300, boxH: 0.6, rate: 1500 },
  sub18: { id: 'sub18', name: '18″ subwoofer', kind: 'sub', spl: 136, h: 360, v: 180, kg: 85, drawW: 900, boxH: 0.6, rate: 3500 },
  fill8: { id: 'fill8', name: '8″ front-fill speaker', kind: 'point', spl: 124, h: 100, v: 60, kg: 12, drawW: 150, boxH: 0.35, rate: 800 },
  mon12: { id: 'mon12', name: '12″ stage monitor (wedge)', kind: 'monitor', spl: 130, h: 60, v: 60, kg: 22, drawW: 250, boxH: 0.4, rate: 1000 },
}

export type SoundEvent = 'speech' | 'wedding' | 'band' | 'dj'
export const EVENTS: Record<SoundEvent, { name: string; target: number; tip: string }> = {
  speech: { name: 'Talk, ceremony, keynote', target: 85, tip: 'Clear speech: about 85 dB at the mixing desk.' },
  wedding: { name: 'Wedding, sangeet, reception', target: 92, tip: 'Music and speeches: about 92 dB at the mixing desk.' },
  band: { name: 'Live band, concert', target: 98, tip: 'Live concert: about 98 dB at the mixing desk.' },
  dj: { name: 'DJ, EDM, college fest', target: 102, tip: 'Dance music: about 102 dB at the mixing desk.' },
}
export const ROLE_NAMES: Record<SoundRole, string> = { main: 'Main', sub: 'Subwoofer', fill: 'Front fill', delay: 'Delay', monitor: 'Monitor', side: 'Side fill' }

/** Best guess of the kind of event from the project's event type. */
export function guessEvent(p: Project): SoundEvent {
  const t = `${p.eventType} ${p.name}`.toLowerCase()
  if (/edm|dj|fest|party|club|rave/.test(t)) return 'dj'
  if (/concert|band|music|live|gig/.test(t)) return 'band'
  if (/wedding|sangeet|reception|haldi|mehndi|shaadi/.test(t)) return 'wedding'
  if (/keynote|corporate|talk|conference|seminar|launch|comedy|ceremony/.test(t)) return 'speech'
  return 'band'
}

export const emptyPlan = (p: Project): SoundPlan => ({ sources: [], event: guessEvent(p) })
export const targetOf = (plan: SoundPlan) => plan.target ?? EVENTS[plan.event].target

const r2 = (n: number) => Math.round(n * 100) / 100
const lg = Math.log10

// ---------------------------------------------------------------- the coverage model

/** Programme level (dB) of one source at a listener (x, y, ear height), before adding sources together. */
export function levelFrom(s: SoundSource, x: number, y: number, ear = 1.6): number {
  const sp = SPEAKERS[s.kind as SpeakerId] ?? SPEAKERS.top12
  const n = Math.max(1, s.boxes)
  const cz = s.flown ? s.z - (n * sp.boxH) / 2 : s.z + (sp.kind === 'array' ? (n * sp.boxH) / 2 : sp.boxH * Math.min(n, 2) * 0.5 + 1.2)
  const dx = x - s.x
  const dy = y - s.y
  const dz = ear - cz
  const d = Math.max(1, Math.hypot(dx, dy, dz))
  let L: number
  if (sp.kind === 'array') {
    // Boxes add coherently in the far field. A curved hang spreads its boxes over its throw (about 5 m of
    // audience per box), holding −3 dB per doubling over that range and −6 dB beyond it.
    const dt = Math.max(6, n * 5)
    const ff = sp.spl + 20 * lg(n) - 20 * lg(Math.max(d, dt))
    L = d < dt ? ff + 10 * lg(dt / d) : ff
  } else {
    // Stacked or clustered boxes: +3 dB per doubling (they don't all aim at the same spot).
    L = sp.spl + 10 * lg(n) - 20 * lg(d)
  }
  // Horizontal coverage: aim 0° = straight towards the audience (+y), positive = towards stage-left (+x).
  if (sp.kind !== 'sub') {
    const az = (Math.atan2(dx, dy) * 180) / Math.PI
    const off = Math.abs((((az - s.aim) % 360) + 540) % 360 - 180)
    const half = sp.h / 2
    L -= Math.min(25, off <= half ? 6 * (off / half) ** 2 : 6 + (off - half) * 0.35)
  }
  L -= d * 0.01 // air absorption
  return L - 10 + (s.gain ?? 0) // programme level: 10 dB of headroom below maximum, then the zone's setting
}

const add = (levels: number[]) => 10 * lg(levels.reduce((a, l) => a + 10 ** (l / 10), 0) || 1e-12)

/** Level at a point from every source of a kind (mains, fills, delays; or subwoofers only). */
export function levelAt(plan: SoundPlan, x: number, y: number, which: 'tops' | 'subs' = 'tops') {
  const src = plan.sources.filter((s) => (which === 'subs' ? s.role === 'sub' : s.role !== 'sub' && s.role !== 'monitor'))
  if (!src.length) return -Infinity
  return add(src.map((s) => levelFrom(s, x, y)))
}

/**
 * Set the system like an engineer would: the mains (and subs) so the mixing desk gets the target, the
 * front fills to just under it in the first rows, and each delay so its zone is topped up to the target.
 * Never louder than the speakers allow. Returns the plan with a gain (dB, ≤ 0) on every source, and the
 * mains' spare headroom (negative = the target can't be reached).
 */
export function drive(p: Project, plan: SoundPlan): { plan: SoundPlan; headroom: number } {
  const target = targetOf(plan)
  const src = plan.sources.map((s) => ({ ...s, gain: 0 }))
  const zero: SoundPlan = { ...plan, sources: src }
  const sb = stageBounds(p)
  const areas = audienceAreas(p)
  const front = stageFront(p) ?? Math.min(...areas.map((a) => a.y))
  const back = Math.max(...areas.map((a) => a.y + a.h))
  const cx = sb ? sb.x + sb.w / 2 : p.venue.w / 2
  const foh = p.ground.find((g) => g.kind === 'foh')
  const ref = foh ? { x: foh.x + foh.w / 2, y: foh.y + foh.h / 2 } : { x: cx, y: front + (back - front) * 0.55 }
  const only = (roles: SoundRole[]) => ({ ...zero, sources: src.filter((s) => roles.includes(s.role)) })
  // Mains: the desk gets the target.
  const mainsAt = levelAt(only(['main', 'side']), ref.x, ref.y)
  const gMain = isFinite(mainsAt) ? target - mainsAt : 0
  for (const s of src) if (s.role === 'main' || s.role === 'side' || s.role === 'sub') s.gain = Math.min(0, gMain)
  // Front fills: the first rows, a little under the target (the mains still reach them).
  const fills = src.filter((s) => s.role === 'fill')
  if (fills.length) {
    const firstRow = Math.min(...areas.map((a) => a.y)) + 1.5
    const lf = levelAt(only(['fill']), cx, firstRow)
    for (const s of fills) s.gain = Math.min(0, target - 4 - lf)
  }
  // Delays: each tops up the zone just behind it to the target.
  for (const s of src.filter((x) => x.role === 'delay')) {
    const y = Math.min(back - 1, s.y + 10)
    const lm = levelAt(only(['main', 'side']), s.x, y)
    const need = lm >= target ? target - 12 : 10 * lg(10 ** (target / 10) - 10 ** (lm / 10))
    const ld = levelFrom({ ...s, gain: 0 }, s.x, y)
    s.gain = Math.min(0, need - ld)
  }
  return { plan: { ...plan, sources: src }, headroom: -gMain }
}

export interface Area {
  x: number
  y: number
  w: number
  h: number
}
/**
 * The front edge of the main stage (not a runway or thrust): the last line where the stage is still at
 * least 60% of its full width.
 */
export function stageFront(p: Project): number | null {
  const sb = stageBounds(p)
  if (!sb) return null
  const widthAt = (y: number) => p.decks.filter((d) => d.y <= y && y < d.y + d.l).reduce((a, d) => a + d.w, 0)
  let full = 0
  for (let y = sb.y; y < sb.y + sb.l; y += 0.25) full = Math.max(full, widthAt(y))
  let front = sb.y + sb.l
  for (let y = sb.y; y < sb.y + sb.l; y += 0.25) if (widthAt(y) >= full * 0.6) front = y + 0.25
  return front
}

/** Where the audience is: crowd, seating and VIP zones, or else the space in front of the stage. */
export function audienceAreas(p: Project): Area[] {
  const zones = p.ground.filter((g) => g.kind === 'crowd' || g.kind === 'seating' || g.kind === 'vip').map((g) => ({ x: g.x, y: g.y, w: g.w, h: g.h }))
  if (zones.length) return zones
  const sb = stageBounds(p)
  const y0 = sb ? sb.y + sb.l + 2 : p.venue.l * 0.25
  return [{ x: p.venue.w * 0.08, y: y0, w: p.venue.w * 0.84, h: Math.max(4, p.venue.l - y0 - 2) }]
}
const inside = (a: Area, x: number, y: number) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h

export interface Coverage {
  cols: number
  rows: number
  cell: number
  x0: number
  y0: number
  levels: Float32Array // NaN outside the audience
  stats: { min: number; max: number; avg: number; even: number; quiet: number; loud: number; foh: number | null; front: number | null; back: number | null; headroom: number }
}
/** Level over the audience on a grid (about 3,000–6,000 points), with summary numbers. */
export function coverage(p: Project, input: SoundPlan, which: 'tops' | 'subs' = 'tops'): Coverage {
  const { plan, headroom } = drive(p, input)
  const areas = audienceAreas(p)
  const cell = Math.max(0.5, Math.sqrt((p.venue.w * p.venue.l) / 5000))
  const cols = Math.ceil(p.venue.w / cell)
  const rows = Math.ceil(p.venue.l / cell)
  const levels = new Float32Array(cols * rows).fill(NaN)
  const target = targetOf(plan)
  let n = 0
  let sum = 0
  let min = Infinity
  let max = -Infinity
  let even = 0
  let quiet = 0
  let loud = 0
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = (i + 0.5) * cell
      const y = (j + 0.5) * cell
      if (!areas.some((a) => inside(a, x, y))) continue
      const L = levelAt(plan, x, y, which)
      if (!isFinite(L)) continue
      levels[j * cols + i] = L
      n++
      sum += L
      min = Math.min(min, L)
      max = Math.max(max, L)
      const d = L - target
      if (Math.abs(d) <= 3) even++
      else if (d < -6) quiet++
      else if (d > 6) loud++
    }
  const foh = p.ground.find((g) => g.kind === 'foh')
  const sb = stageBounds(p)
  const all = areas.reduce((a, b) => ({ y0: Math.min(a.y0, b.y), y1: Math.max(a.y1, b.y + b.h), x: a.x + (b.x + b.w / 2) / areas.length }), { y0: Infinity, y1: -Infinity, x: 0 })
  const cx = sb ? sb.x + sb.w / 2 : all.x
  return {
    cols,
    rows,
    cell,
    x0: 0,
    y0: 0,
    levels,
    stats: {
      min: n ? min : 0,
      max: n ? max : 0,
      avg: n ? sum / n : 0,
      even: n ? even / n : 0,
      quiet: n ? quiet / n : 0,
      loud: n ? loud / n : 0,
      foh: plan.sources.length ? (foh ? levelAt(plan, foh.x + foh.w / 2, foh.y + foh.h / 2, which) : null) : null,
      front: plan.sources.length && isFinite(all.y0) ? levelAt(plan, cx, all.y0 + 1, which) : null,
      back: plan.sources.length && isFinite(all.y1) ? levelAt(plan, cx, all.y1 - 1, which) : null,
      headroom,
    },
  }
}

/** Delay for a fill or delay source so its sound arrives just after the mains' (10 ms later, so the stage leads). */
export function delayFor(plan: SoundPlan, s: SoundSource): number {
  const mains = plan.sources.filter((m) => m.role === 'main')
  if (!mains.length || s.role === 'main' || s.role === 'sub' || s.role === 'monitor') return 0
  // Distance from the nearest main hang to this speaker, at the speed of sound (343 m/s).
  const d = Math.min(...mains.map((m) => Math.hypot(m.x - s.x, m.y - s.y, m.z - s.z)))
  return Math.round(((d / 343) * 1000 + 10) * 10) / 10
}

// ---------------------------------------------------------------- automatic design

export const newSource = (kind: SpeakerId, role: SoundRole, x: number, y: number, extra: Partial<SoundSource> = {}): SoundSource => ({
  id: nanoid(6),
  kind,
  role,
  x: r2(x),
  y: r2(y),
  z: 0,
  aim: 0,
  boxes: 1,
  flown: false,
  ...extra,
})

/**
 * A complete system for the venue, stage, audience and event: mains left and right (line arrays or
 * point-source stacks), subwoofers, front fills, delay towers where the mains run out, and monitors.
 */
export function autoDesign(p: Project, prev?: SoundPlan): SoundPlan {
  const event = prev?.event ?? guessEvent(p)
  const plan: SoundPlan = { ...(prev ?? {}), event, sources: [] }
  const target = targetOf(plan)
  const sb = stageBounds(p) ?? { x: p.venue.w / 2 - 6, y: 2, w: 12, l: 8, h: 1.2 }
  const areas = audienceAreas(p)
  const front = stageFront(p) ?? sb.y + sb.l
  const backY = Math.max(...areas.map((a) => a.y + a.h))
  const throwD = Math.max(8, backY - front)
  const audW = Math.max(...areas.map((a) => a.x + a.w)) - Math.min(...areas.map((a) => a.x))
  const people = Math.max(50, p.audience || 500)
  const cx = sb.x + sb.w / 2
  // LED screens beside the stage push the hangs out a little further.
  const screensX = p.screens.filter((s) => s.y + 1 >= sb.y - 2).flatMap((s) => [s.x, s.x + screenStats(s, p.customPanels).w])
  const outL = Math.min(sb.x, ...screensX.filter((x) => x < cx)) - 1.5
  const outR = Math.max(sb.x + sb.w, ...screensX.filter((x) => x > cx)) + 1.5

  // Mains: point sources for small, short rooms; line arrays beyond.
  const small = people <= 400 && throwD <= 22
  const kind: SpeakerId = small ? (throwD <= 14 ? 'top12' : 'top15') : throwD <= 35 && people <= 2500 ? 'la10' : 'la12'
  const sp = SPEAKERS[kind]
  const reach = Math.min(throwD, small ? throwD : 55) // past ~55 m, delay towers do the rest
  // Boxes so the far end of the mains' reach sits about 3 dB under the target.
  // Line arrays: about one box per 5 m of throw (even level front to back), more if the target needs it.
  let boxes = 1
  if (sp.kind === 'array') {
    boxes = Math.max(4, Math.min(16, 2 * Math.round(reach / 10)))
    while (boxes < 16 && levelFrom(newSource(kind, 'main', cx, front, { boxes, flown: true, z: Math.max(sb.h + 7, 8) }), cx, front + reach) < target + 3) boxes += 2
  } else boxes = people > 200 ? 2 : 1
  const hangZ = sp.kind === 'array' ? r2(Math.max(sb.h + 6 + boxes * sp.boxH * 0.5, 8)) : 0
  for (const [x, side] of [
    [outL, -1],
    [outR, 1],
  ] as const) {
    // Aim each side a little towards the middle of the crowd.
    const aim = r2(((Math.atan2(cx - x, throwD * 0.6) * 180) / Math.PI) * 0.7)
    plan.sources.push(newSource(kind, 'main', x, front - 0.5, { boxes, flown: sp.kind === 'array', z: hangZ, aim, label: side < 0 ? 'Main left' : 'Main right' }))
  }

  // Subwoofers: a row across the stage front for big shows, a stack under each main for small ones.
  const nSubs = Math.max(2, Math.min(16, 2 * Math.ceil(people / (event === 'dj' ? 400 : 700))))
  if (small || nSubs <= 4) {
    for (const [x, side] of [
      [outL, 'left'],
      [outR, 'right'],
    ] as const)
      plan.sources.push(newSource('sub18', 'sub', x, front + 0.6, { boxes: Math.max(1, nSubs / 2), label: `Subs ${side}` }))
  } else {
    const span = Math.min(sb.w, nSubs * 1.4)
    for (let i = 0; i < nSubs / 2; i++) {
      const x = cx - span / 2 + (span * (i + 0.5)) / (nSubs / 2)
      plan.sources.push(newSource('sub18', 'sub', x, front + 0.6, { boxes: 2, label: `Sub ${i + 1}` }))
    }
  }

  // Front fills along the stage lip, for the first rows under the hangs.
  if (sp.kind === 'array' && sb.w >= 8) {
    const n = Math.min(6, Math.max(2, Math.round(sb.w / 5)))
    for (let i = 0; i < n; i++) {
      const x = sb.x + (sb.w * (i + 0.5)) / n
      plan.sources.push(newSource('fill8', 'fill', x, front + 0.3, { z: Math.max(0, sb.h - 0.1), label: `Front fill ${i + 1}` }))
    }
  }

  // Out-fills: very wide crowds get a second hang on each side, angled outwards.
  const minX = Math.min(...areas.map((a) => a.x))
  if (!small && audW > 50) {
    for (const [x, side] of [
      [outL - 3, -1],
      [outR + 3, 1],
    ] as const)
      plan.sources.push(newSource('la10', 'main', x, front - 0.5, { boxes: 6, flown: true, z: r2(Math.max(sb.h + 6, 7.5)), aim: side * 50, label: side < 0 ? 'Out-fill left' : 'Out-fill right' }))
  }

  // Delay towers from where the mains (as they'll be set) have dropped 3 dB, across the whole width.
  if (!small && throwD > 40) {
    const set = drive(p, plan).plan
    let at = 0
    for (let d = 20; d <= throwD - 8; d += 2)
      if (levelAt(set, cx, front + d) < target - 3) {
        at = d
        break
      }
    if (at) {
      const depth = backY - (front + at)
      const kindD: SpeakerId = depth > 25 ? 'la10' : 'top15'
      const perRow = Math.max(2, Math.ceil(audW / 30))
      const rows = depth > 45 ? [at, at + depth * 0.5] : [at]
      rows.forEach((y, k) => {
        for (let i = 0; i < perRow; i++) {
          const x = minX + (audW * (i + 0.5)) / perRow
          plan.sources.push(
            newSource(kindD, 'delay', x, front + y, {
              boxes: kindD === 'la10' ? 6 : 2,
              flown: kindD === 'la10',
              z: kindD === 'la10' ? 7 : 3.5,
              aim: r2(((Math.atan2(cx - x, 60) * 180) / Math.PI) * 0.3),
              label: `Delay ${k + 1}.${i + 1}`,
            }),
          )
        }
      })
    }
  }

  // Monitors on stage, by the kind of show.
  const mons = event === 'band' ? 6 : event === 'wedding' ? 4 : 2
  for (let i = 0; i < mons; i++) {
    const x = sb.x + (sb.w * (i + 0.5)) / mons
    plan.sources.push(newSource('mon12', 'monitor', x, front - 1.2, { z: sb.h, aim: 180, label: `Monitor ${i + 1}` }))
  }
  if (event === 'dj') plan.sources.push(newSource('top15', 'side', cx + 3, sb.y + sb.l / 2, { z: sb.h, aim: -90, boxes: 2, label: 'DJ booth monitor' }))

  // Delay times for everything in front of or behind the mains.
  for (const s of plan.sources) if (s.role === 'delay' || s.role === 'fill') s.delay = delayFor(plan, s)
  return plan
}

// ---------------------------------------------------------------- equipment, weight, power, warnings

export interface SoundRow {
  item: string
  qty: number
  unit: string
  weightKg: number
  powerW: number
}
/** Everything the sound plan needs: boxes, frames and motors for flown hangs, towers, desk, stage box, cabling. */
export function soundRows(p: Project): SoundRow[] {
  const plan = p.sound
  if (!plan?.sources.length) return []
  const rows: SoundRow[] = []
  const put = (item: string, qty: number, unit: string, kg: number, w: number) => {
    const r = rows.find((x) => x.item === item)
    if (r) (r.qty += qty), (r.weightKg += kg), (r.powerW += w)
    else rows.push({ item, qty, unit, weightKg: kg, powerW: w })
  }
  for (const s of plan.sources) {
    const sp = SPEAKERS[s.kind as SpeakerId]
    if (!sp) continue
    put(sp.name, s.boxes, 'pcs', sp.kg * s.boxes, sp.drawW * s.boxes)
    if (s.flown) {
      put('Flying frame (per hang)', 1, 'pcs', 35, 0)
      put('Chain motor 1 t for PA (per hang)', 1, 'pcs', 45, 0)
    }
    if (s.role === 'delay') put('Delay tower (scaffold / truss)', 1, 'pcs', 400, 0)
  }
  const n = plan.sources.length
  put('Mixing console (FOH) with stage box', 1, 'set', 60, 600)
  put('Speaker and signal cabling (per source)', n, 'runs', n * 8, 0)
  const ins = plan.inputs?.length ?? 0
  if (ins) put('Microphone / DI channels', ins, 'ch', ins * 1.5, 0)
  return rows
}

export const soundWeight = (p: Project) => soundRows(p).reduce((a, r) => a + r.weightKg, 0)
export const soundPower = (p: Project) => soundRows(p).reduce((a, r) => a + r.powerW, 0)

/** Weight of each flown hang (boxes, frame), for the motor and the structure it hangs from. */
export const hangKg = (s: SoundSource) => (SPEAKERS[s.kind as SpeakerId]?.kg ?? 0) * s.boxes + (s.flown ? 35 : 0)

export function soundWarnings(p: Project, cov: Coverage): string[] {
  const plan = p.sound
  if (!plan?.sources.length) return []
  const out: string[] = []
  const t = targetOf(plan)
  const st = cov.stats
  if (!plan.sources.some((s) => s.role === 'main')) out.push('No main speakers yet: add a left and right main, or use Auto design.')
  if (st.headroom < 0) out.push(`The mains can't reach ${t} dB at the mixing desk: about ${Math.round(-st.headroom)} dB short. Use bigger speakers or more boxes.`)
  else if (st.headroom < 3) out.push(`Only ${Math.round(st.headroom)} dB of headroom at ${t} dB: the system will run flat out. Add boxes for safety.`)
  if (st.quiet > 0.08) out.push(`${Math.round(st.quiet * 100)}% of the audience is more than 6 dB too quiet. Add boxes, aim the mains further back, or add delay speakers there.`)
  if (st.loud > 0.08) out.push(`${Math.round(st.loud * 100)}% of the audience is more than 6 dB too loud, usually near the stage. Lift or aim the mains up, or use front fills instead.`)
  if (st.front !== null && st.front > 110) out.push(`About ${Math.round(st.front)} dB in the front rows: above the 110 dB safety guide. Move the barricade back or reduce the near-field level.`)
  if (st.back !== null && st.back < t - 8) out.push(`The back of the crowd gets about ${Math.round(st.back)} dB (target ${t}): too quiet. Delay speakers will fix it.`)
  for (const s of plan.sources)
    if ((s.role === 'delay' || s.role === 'fill') && Math.abs((s.delay ?? 0) - delayFor(plan, s)) > 5)
      out.push(`${s.label || ROLE_NAMES[s.role]}: delay is ${s.delay ?? 0} ms but should be about ${delayFor(plan, s)} ms for its position.`)
  for (const s of plan.sources) if (s.flown && hangKg(s) > 950) out.push(`${s.label || 'A hang'} weighs ${Math.round(hangKg(s))} kg: more than one 1 t motor. Use two motors or fewer boxes.`)
  return out
}

// ---------------------------------------------------------------- input list and monitor mixes

export const INPUT_PRESETS: Record<SoundEvent, [string, string, string?][]> = {
  speech: [
    ['Podium mic', 'Gooseneck condenser', 'Podium'],
    ['Handheld 1', 'Wireless handheld'],
    ['Handheld 2', 'Wireless handheld'],
    ['Lapel 1', 'Wireless lapel'],
    ['Lapel 2', 'Wireless lapel'],
    ['Laptop L', 'Stereo DI'],
    ['Laptop R', 'Stereo DI'],
    ['Video playback', 'Stereo DI'],
  ],
  wedding: [
    ['Anchor 1', 'Wireless handheld'],
    ['Anchor 2', 'Wireless handheld'],
    ['Vocal 1', 'SM58-type dynamic', 'Boom stand'],
    ['Vocal 2', 'SM58-type dynamic', 'Boom stand'],
    ['Dholak / tabla', 'Small condenser', 'Short boom'],
    ['Keyboard L', 'DI'],
    ['Keyboard R', 'DI'],
    ['Playback L', 'Stereo DI'],
    ['Playback R', 'Stereo DI'],
  ],
  band: [
    ['Kick', 'Kick drum mic', 'Short boom'],
    ['Snare', 'SM57-type dynamic', 'Clip'],
    ['Hi-hat', 'Small condenser', 'Boom stand'],
    ['Tom 1', 'Dynamic', 'Clip'],
    ['Tom 2', 'Dynamic', 'Clip'],
    ['Overhead L', 'Condenser', 'Tall boom'],
    ['Overhead R', 'Condenser', 'Tall boom'],
    ['Bass', 'DI'],
    ['Guitar 1', 'SM57-type dynamic', 'Short boom'],
    ['Guitar 2', 'SM57-type dynamic', 'Short boom'],
    ['Keys L', 'DI'],
    ['Keys R', 'DI'],
    ['Lead vocal', 'Wireless handheld'],
    ['Backing vocal 1', 'SM58-type dynamic', 'Boom stand'],
    ['Backing vocal 2', 'SM58-type dynamic', 'Boom stand'],
    ['Anchor', 'Wireless handheld'],
  ],
  dj: [
    ['DJ mixer L', 'Balanced line (XLR)'],
    ['DJ mixer R', 'Balanced line (XLR)'],
    ['DJ backup L', 'Balanced line (XLR)'],
    ['DJ backup R', 'Balanced line (XLR)'],
    ['MC mic', 'Wireless handheld'],
    ['Anchor', 'Wireless handheld'],
    ['Playback L', 'Stereo DI'],
    ['Playback R', 'Stereo DI'],
  ],
}
export const MIX_PRESETS: Record<SoundEvent, [string, string][]> = {
  speech: [['Podium', 'Podium mic (low), playback']],
  wedding: [
    ['Singers', 'Vocals, keyboard, dholak'],
    ['Musicians', 'Keyboard, dholak, a little vocal'],
  ],
  band: [
    ['Lead vocal', 'Vocal, keys, guitar'],
    ['Guitar', 'Guitar, vocal, kick'],
    ['Bass', 'Bass, kick, snare'],
    ['Drums', 'Kick, bass, vocal'],
    ['Keys', 'Keys, vocal'],
  ],
  dj: [['DJ booth', 'DJ mixer, MC mic']],
}
