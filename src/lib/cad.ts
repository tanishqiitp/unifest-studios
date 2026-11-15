import type { Project } from '../types'
import type { Selection } from '../store'
import { screenStats } from './calc'

// Every placed thing as an axis-aligned box in venue metres, so one set of CAD views
// (front, top, side, 3D) can show and move decks, truss, lights, screens, decor and set pieces.
// x: across the venue, y: depth from the back (towards the audience), z: height.
export interface Box3 {
  x0: number
  x1: number
  y0: number
  y1: number
  z0: number
  z1: number
}
export type CadKind = Exclude<NonNullable<Selection>['kind'], 'ground' | 'hoist' | 'table' | 'comment'>
export interface CadItem {
  kind: CadKind
  id: string
  label: string
  box: Box3
  color: string
  locked?: boolean // mirrors follow their source
  resize?: boolean // false: move only
}

// Which kinds each workspace edits; the rest are shown for reference.
export const CAD_EDITS: Record<string, CadKind[]> = {
  stage: ['deck'],
  truss: ['truss', 'fixture'],
  led: ['screen'],
  decor: ['decor'],
  set: ['set'],
}

export function cadItems(p: Project): CadItem[] {
  const out: CadItem[] = []
  for (const d of p.decks) out.push({ kind: 'deck', id: d.id, label: 'Deck', color: d.color ?? '#3a3a3a', box: { x0: d.x, x1: d.x + d.w, y0: d.y, y1: d.y + d.l, z0: 0, z1: d.h } })
  for (const t of p.truss) {
    const s = t.type === 'box40' ? 0.4 : 0.3
    out.push({
      kind: 'truss',
      id: t.id,
      label: 'Truss',
      color: t.finish === 'black' ? '#2a2a2a' : t.finish === 'white' ? '#eeeeee' : '#9a9a9a',
      resize: false,
      box: { x0: Math.min(t.x1, t.x2) - s / 2, x1: Math.max(t.x1, t.x2) + s / 2, y0: Math.min(t.y1, t.y2) - s / 2, y1: Math.max(t.y1, t.y2) + s / 2, z0: t.height - s / 2, z1: t.height + s / 2 },
    })
  }
  for (const f of p.fixtures) out.push({ kind: 'fixture', id: f.id, label: f.kind, color: f.color ?? '#d8d8d8', resize: false, box: { x0: f.x - 0.2, x1: f.x + 0.2, y0: f.y - 0.2, y1: f.y + 0.2, z0: f.z - 0.45, z1: f.z } })
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    out.push({ kind: 'screen', id: s.id, label: s.name, color: '#1d2b4a', resize: false, locked: !!s.mirrorOf, box: { x0: s.x, x1: s.x + st.w, y0: s.y - 0.1, y1: s.y + 0.1, z0: s.z, z1: s.z + st.h } })
  }
  for (const d of p.decor ?? []) out.push({ kind: 'decor', id: d.id, label: d.sponsor || d.label, color: d.color, box: { x0: d.x - d.w / 2, x1: d.x + d.w / 2, y0: d.y - d.d / 2, y1: d.y + d.d / 2, z0: d.z, z1: d.z + d.h } })
  for (const s of p.set ?? []) out.push({ kind: 'set', id: s.id, label: s.label, color: s.color, locked: !!s.mirrorOf, box: { x0: s.x - s.w / 2, x1: s.x + s.w / 2, y0: s.y - s.d / 2, y1: s.y + s.d / 2, z0: s.z, z1: s.z + s.h } })
  return out
}

const r2 = (n: number) => +n.toFixed(2)

// Write a moved or resized box back onto the item (inside mutate).
export function applyBox(p: Project, kind: CadKind, id: string, before: Box3, b: Box3) {
  const dx = b.x0 - before.x0
  const dy = b.y0 - before.y0
  const dz = b.z0 - before.z0
  if (kind === 'deck') {
    const d = p.decks.find((x) => x.id === id)
    if (d) Object.assign(d, { x: r2(b.x0), y: r2(b.y0), w: r2(Math.max(0.5, b.x1 - b.x0)), l: r2(Math.max(0.5, b.y1 - b.y0)), h: r2(Math.max(0.1, b.z1)) })
  } else if (kind === 'truss') {
    const t = p.truss.find((x) => x.id === id)
    if (t) Object.assign(t, { x1: r2(t.x1 + dx), x2: r2(t.x2 + dx), y1: r2(t.y1 + dy), y2: r2(t.y2 + dy), height: r2(Math.max(0.5, t.height + dz)) })
  } else if (kind === 'fixture') {
    const f = p.fixtures.find((x) => x.id === id)
    if (f) Object.assign(f, { x: r2(f.x + dx), y: r2(f.y + dy), z: r2(Math.max(0.3, f.z + dz)) })
  } else if (kind === 'screen') {
    const s = p.screens.find((x) => x.id === id)
    if (s) Object.assign(s, { x: r2(s.x + dx), y: r2(s.y + dy), z: r2(Math.max(0, s.z + dz)) })
  } else if (kind === 'decor') {
    const d = (p.decor ?? []).find((x) => x.id === id)
    if (d) Object.assign(d, { x: r2((b.x0 + b.x1) / 2), y: r2((b.y0 + b.y1) / 2), z: r2(Math.max(0, b.z0)), w: r2(Math.max(0.1, b.x1 - b.x0)), d: r2(Math.max(0.05, b.y1 - b.y0)), h: r2(Math.max(0.1, b.z1 - b.z0)) })
  } else if (kind === 'set') {
    const s = (p.set ?? []).find((x) => x.id === id)
    if (s) Object.assign(s, { x: r2((b.x0 + b.x1) / 2), y: r2((b.y0 + b.y1) / 2), z: r2(Math.max(0, b.z0)), w: r2(Math.max(0.1, b.x1 - b.x0)), d: r2(Math.max(0.05, b.y1 - b.y0)), h: r2(Math.max(0.1, b.z1 - b.z0)) })
  }
}

// Flat views in canvas coordinates: front (x, -z), top (x, y), side (y, -z).
export type FlatView = 'front' | 'top' | 'side'
export function toRect(b: Box3, v: FlatView) {
  if (v === 'front') return { x: b.x0, y: -b.z1, w: b.x1 - b.x0, h: b.z1 - b.z0 }
  if (v === 'top') return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
  return { x: b.y0, y: -b.z1, w: b.y1 - b.y0, h: b.z1 - b.z0 }
}
export function fromRect(b: Box3, v: FlatView, r: { x: number; y: number; w: number; h: number }): Box3 {
  if (v === 'front') return { ...b, x0: r.x, x1: r.x + r.w, z0: -r.y - r.h, z1: -r.y }
  if (v === 'top') return { ...b, x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h }
  return { ...b, y0: r.x, y1: r.x + r.w, z0: -r.y - r.h, z1: -r.y }
}
