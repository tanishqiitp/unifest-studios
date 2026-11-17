// Audience space estimate: one shared definition used by the HUD, ground plan, warnings, safety tab and PDFs.
//
// Definitions
//  - Audience zones: ground items of kind crowd (standing), vip (standing, more room) and seating (rows of chairs).
//  - Usable area: the part of a zone inside the venue, minus areas used by something else (stage decks,
//    FOH, towers, food, toilets, exits and other ground items) and minus areas already counted by another
//    audience zone (overlaps are counted once, at the lower density).
//  - Space estimate: usable area × planning density, plus planned table seats. It is a geometric planning
//    figure, NOT a licensed or permitted capacity, which only the venue or authority can confirm.
//  - Tables: their seats are counted exactly. A seating zone that contains tables counts only those seats;
//    a standing zone loses the floor the tables take up (table + chairs), so no area is counted twice.
import type { GroundItem, Project, Table } from '../types'

/** Planning densities in persons per m². */
export const DENSITY: Partial<Record<GroundItem['kind'], number>> = { crowd: 2, seating: 1 / 0.6, vip: 1 }
// Floor a table takes with its chairs around it (metres added on every side).
const CHAIR_RING = 0.6

type Pt = [number, number]
const rad = (d: number) => (d * Math.PI) / 180

// A rectangle (top-left x, y; turned about its centre) as a polygon.
export function rectPoly(x: number, y: number, w: number, h: number, rotation = 0): Pt[] {
  const cx = x + w / 2
  const cy = y + h / 2
  const c = Math.cos(rad(rotation))
  const s = Math.sin(rad(rotation))
  return (
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ] as Pt[]
  ).map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c])
}

export function polyArea(p: Pt[]) {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i]
    const [x2, y2] = p[(i + 1) % p.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

// Intersection of polygon `subject` with a convex polygon `clip` (Sutherland–Hodgman).
export function clipPoly(subject: Pt[], clip: Pt[]): Pt[] {
  let out = subject
  // Orientation of the clip polygon decides which side is "inside".
  const sign = Math.sign(clip.reduce((a, [x1, y1], i) => a + (x1 * clip[(i + 1) % clip.length][1] - clip[(i + 1) % clip.length][0] * y1), 0)) || 1
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % clip.length]
    const inside = (p: Pt) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-9
    const cut = (p: Pt, q: Pt): Pt => {
      const a1 = b[1] - a[1]
      const b1 = a[0] - b[0]
      const c1 = a1 * a[0] + b1 * a[1]
      const a2 = q[1] - p[1]
      const b2 = p[0] - q[0]
      const c2 = a2 * p[0] + b2 * p[1]
      const det = a1 * b2 - a2 * b1
      return det === 0 ? q : [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det]
    }
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q))
        out.push(q)
      } else if (inside(p)) out.push(cut(p, q))
    }
  }
  return out
}
const overlap = (a: Pt[], b: Pt[]) => (a.length && b.length ? polyArea(clipPoly(a, b)) : 0)

export interface ZoneEstimate {
  id: string
  kind: GroundItem['kind']
  label: string
  density: number
  area: number // m², as drawn
  outside: number // m² beyond the venue edge (not counted)
  shared: number // m² already counted by another audience zone
  blocked: number // m² taken by stage, FOH, facilities or tables
  usable: number // m²
  people: number
  tables: number // table seats inside this zone
}
export interface CapacityIssue {
  level: 'error' | 'warn'
  text: string
  id?: string // ground item to select
  invalid?: boolean // the layout cannot support a capacity conclusion until this is fixed
}
export type CapacityStatus = 'ok' | 'check' | 'unknown'
export interface AudienceEstimate {
  status: CapacityStatus
  estimate: number // persons: zone estimate + planned table seats
  zonePeople: number
  tableSeats: number
  usableArea: number
  zones: ZoneEstimate[]
  issues: CapacityIssue[]
  assumptions: string[]
}

const tableRect = (t: Table) => {
  const w = t.w + CHAIR_RING * 2
  const l = t.l + CHAIR_RING * 2
  return rectPoly(t.x - w / 2, t.y - l / 2, w, l, t.rotation)
}

export function audienceEstimate(p: Project): AudienceEstimate {
  const assumptions = [
    'Planning densities: standing 2 persons/m², VIP 1 person/m², seated rows 1 person per 0.6 m².',
    'Area outside the venue, under the stage, FOH, towers and facilities, and overlaps between zones is not counted.',
    'Table seats are counted exactly; a seating zone that holds tables counts only those seats.',
    'This is a geometric planning estimate, not a licensed or permitted capacity. Confirm with the venue and the licensing authority.',
  ]
  const issues: CapacityIssue[] = []
  const W = p.venue?.w
  const L = p.venue?.l
  const empty = (status: CapacityStatus): AudienceEstimate => ({ status, estimate: 0, zonePeople: 0, tableSeats: 0, usableArea: 0, zones: [], issues, assumptions })
  if (!(W > 0) || !(L > 0) || !Number.isFinite(W) || !Number.isFinite(L)) {
    issues.push({ level: 'error', text: 'The venue has no valid width and length, so audience space cannot be estimated.' })
    return empty('unknown')
  }
  const venue = rectPoly(0, 0, W, L)
  const zonesIn = p.ground.filter((g) => DENSITY[g.kind])
  const tables = p.tables ?? []
  const tableSeatsAll = tables.reduce((a, t) => a + (t.seats || 0), 0)
  if (!zonesIn.length && !tables.length) {
    issues.push({ level: 'warn', text: 'No audience area is drawn yet. Add a crowd, VIP or seating zone, or tables.' })
    return empty('unknown')
  }

  const blockers: { poly: Pt[]; label: string }[] = [
    ...p.ground.filter((g) => !DENSITY[g.kind] && g.kind !== 'label').map((g) => ({ poly: rectPoly(g.x, g.y, g.w, g.h, g.rotation), label: g.label || g.kind })),
    ...p.decks.map((d) => ({ poly: rectPoly(d.x, d.y, d.w, d.l), label: 'Stage' })),
  ]
  const tablePolys = tables.map((t) => ({ t, poly: tableRect(t) }))

  // Lower densities first, so a shared area is counted at the lower (safer) density.
  const order = [...zonesIn].sort((a, b) => (DENSITY[a.kind] ?? 0) - (DENSITY[b.kind] ?? 0))
  const done: { poly: Pt[]; label: string }[] = []
  const zones: ZoneEstimate[] = []
  for (const g of order) {
    const density = DENSITY[g.kind] ?? 0
    const label = g.label || g.kind
    const poly = rectPoly(g.x, g.y, g.w, g.h, g.rotation)
    const area = polyArea(poly)
    const inside = clipPoly(poly, venue)
    const inArea = polyArea(inside)
    const outside = Math.max(0, area - inArea)
    if (area <= 0) issues.push({ level: 'warn', text: `${label} has no size.`, id: g.id })
    else if (inArea < 0.01) issues.push({ level: 'error', text: `${label} is entirely outside the venue and is not counted.`, id: g.id, invalid: true })
    else if (outside > 0.5) issues.push({ level: 'warn', text: `${Math.round(outside)} m² of ${label} lies outside the venue and is not counted.`, id: g.id, invalid: true })

    let shared = 0
    for (const d of done) {
      const o = overlap(inside, d.poly)
      if (o > 0.5) issues.push({ level: 'warn', text: `${label} overlaps ${d.label}; the shared ${Math.round(o)} m² is counted once.`, id: g.id })
      shared += o
    }
    let blocked = 0
    // Stage, FOH and facilities inside a zone are expected; their floor is simply not counted.
    for (const b of blockers) blocked += overlap(inside, b.poly)
    const inZone = tablePolys.filter(({ poly }) => overlap(poly, inside) > 0.5 * polyArea(poly))
    const seatsHere = inZone.reduce((a, { t }) => a + (t.seats || 0), 0)
    // Seating zones with tables are seated at those tables; standing zones lose the table floor.
    const tableFloor = inZone.reduce((a, { poly }) => a + overlap(poly, inside), 0)
    const usable = g.kind === 'seating' && inZone.length ? 0 : Math.max(0, inArea - shared - blocked - tableFloor)
    if (g.kind === 'seating' && inZone.length) issues.push({ level: 'warn', text: `${label} holds tables, so only their ${seatsHere} seats are counted for it.`, id: g.id })
    zones.push({ id: g.id, kind: g.kind, label, density, area, outside, shared, blocked: blocked + tableFloor, usable, people: Math.floor(usable * density), tables: seatsHere })
    if (inArea > 0) done.push({ poly: inside, label })
  }

  const zonePeople = zones.reduce((a, z) => a + z.people, 0)
  const usableArea = zones.reduce((a, z) => a + z.usable, 0)
  const estimate = zonePeople + tableSeatsAll
  // Geometry problems (outside the venue, overlaps) mean the number cannot be relied on yet.
  const status: CapacityStatus = estimate === 0 ? 'unknown' : issues.some((i) => i.invalid) ? 'check' : 'ok'
  return { status, estimate, zonePeople, tableSeats: tableSeatsAll, usableArea, zones: zones.sort((a, b) => zonesIn.indexOf(zonesIn.find((g) => g.id === a.id)!) - zonesIn.indexOf(zonesIn.find((g) => g.id === b.id)!)), issues, assumptions }
}

export type Verdict = { tone: 'ok' | 'warn' | 'error' | 'muted'; text: string }
/** One wording for "does the expected audience fit?", never positive when the layout cannot support it. */
export function audienceVerdict(e: AudienceEstimate, audience: number): Verdict {
  if (e.status === 'unknown') return { tone: 'muted', text: 'not estimated yet' }
  if (e.status === 'check') return { tone: 'warn', text: 'unverified: fix layout issues' }
  if (!(audience > 0)) return { tone: 'muted', text: 'enter expected attendance' }
  return audience <= e.estimate ? { tone: 'ok', text: 'within space estimate' } : { tone: 'error', text: 'over space estimate' }
}
