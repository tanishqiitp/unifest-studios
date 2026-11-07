import { nanoid } from 'nanoid'
import type { Guest, Meal, Project, Table, TableKind } from '../types'
import { stageBounds } from './calc'

// Chair footprint and spacing, metres.
export const CHAIR = 0.45
const PITCH = 0.6 // chair spacing along a table edge
const ROW_PITCH = 0.55 // theatre chair width

export interface TablePreset {
  id: string
  kind: TableKind
  name: string
  w: number
  l: number
  seats: number
  hint: string
}

export const TABLE_PRESETS: TablePreset[] = [
  { id: 'round-60', kind: 'round', name: 'Round 5 ft', w: 1.52, l: 1.52, seats: 8, hint: 'Weddings and dinners, 8 guests' },
  { id: 'round-72', kind: 'round', name: 'Round 6 ft', w: 1.83, l: 1.83, seats: 10, hint: 'Gala dinners, 10 guests' },
  { id: 'banquet-6', kind: 'banquet', name: 'Banquet 6 ft', w: 1.83, l: 0.76, seats: 6, hint: 'Long table, 6 guests' },
  { id: 'banquet-8', kind: 'banquet', name: 'Banquet 8 ft', w: 2.44, l: 0.76, seats: 8, hint: 'Long table, 8 guests' },
  { id: 'cocktail', kind: 'cocktail', name: 'Cocktail', w: 0.75, l: 0.75, seats: 0, hint: 'High table, standing guests' },
  { id: 'sweetheart', kind: 'sweetheart', name: 'Sweetheart', w: 1.5, l: 0.6, seats: 2, hint: 'Couple’s table, faces the room' },
  { id: 'row-10', kind: 'row', name: 'Chair row', w: 10 * ROW_PITCH, l: 0.5, seats: 10, hint: 'Theatre-style row of chairs' },
  { id: 'classroom', kind: 'classroom', name: 'Classroom', w: 1.8, l: 0.45, seats: 3, hint: 'Narrow table, guests on one side' },
  { id: 'lounge', kind: 'lounge', name: 'Lounge set', w: 2.4, l: 2.4, seats: 6, hint: 'Sofas around a coffee table' },
  { id: 'dance', kind: 'dance', name: 'Dance floor', w: 6, l: 6, seats: 0, hint: 'Clear floor for dancing' },
  { id: 'buffet', kind: 'buffet', name: 'Buffet', w: 3.6, l: 0.76, seats: 0, hint: 'Food service counter' },
  { id: 'bar', kind: 'bar', name: 'Bar', w: 4, l: 0.8, seats: 0, hint: 'Drinks counter' },
]

export const MEALS: { id: Meal; name: string }[] = [
  { id: 'veg', name: 'Veg' },
  { id: 'non-veg', name: 'Non-veg' },
  { id: 'jain', name: 'Jain' },
  { id: 'vegan', name: 'Vegan' },
  { id: 'kids', name: 'Kids' },
]

export const isSeated = (k: TableKind) => !['cocktail', 'dance', 'buffet', 'bar'].includes(k)

export function newTable(preset: TablePreset, x: number, y: number, label: string): Table {
  return { id: nanoid(8), kind: preset.kind, x, y, w: preset.w, l: preset.l, rotation: 0, seats: preset.seats, label }
}

// Chair positions in the table's own frame (x across, y depth; guests at -y face +y), then rotated into the plan.
export function seatPositions(t: Table): { x: number; y: number; angle: number }[] {
  const local: { x: number; y: number; angle: number }[] = []
  const n = t.seats
  if (n > 0) {
    if (t.kind === 'round' || t.kind === 'lounge') {
      const r = t.w / 2 + CHAIR * 0.6
      // Cabaret spreads guests over the 270° away from the stage (which is towards -y).
      const arc = t.open ? Math.PI * 1.5 : Math.PI * 2
      const start = t.open ? -Math.PI / 2 + Math.PI / 4 + arc / n / 2 : -Math.PI / 2
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * arc
        local.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, angle: a + Math.PI / 2 })
      }
    } else if (t.kind === 'row') {
      const step = t.w / n
      for (let i = 0; i < n; i++) local.push({ x: -t.w / 2 + step * (i + 0.5), y: 0, angle: 0 })
    } else if (t.kind === 'classroom' || t.kind === 'sweetheart') {
      // Everyone on the back edge, facing the front (towards the stage).
      const step = t.w / n
      for (let i = 0; i < n; i++) local.push({ x: -t.w / 2 + step * (i + 0.5), y: t.l / 2 + CHAIR * 0.6, angle: Math.PI })
    } else {
      // Banquet: both long sides, extra seat goes to the far side.
      const near = Math.floor(n / 2)
      const far = n - near
      for (const [count, side] of [
        [far, -1],
        [near, 1],
      ] as const) {
        const step = Math.max(PITCH, t.w / Math.max(1, count))
        const span = step * count
        for (let i = 0; i < count; i++) local.push({ x: -span / 2 + step * (i + 0.5), y: side * (t.l / 2 + CHAIR * 0.6), angle: side > 0 ? Math.PI : 0 })
      }
    }
  }
  const r = (t.rotation * Math.PI) / 180
  return local.map((s) => ({ x: t.x + s.x * Math.cos(r) - s.y * Math.sin(r), y: t.y + s.x * Math.sin(r) + s.y * Math.cos(r), angle: s.angle + r }))
}

// Space a table needs including its chairs, for packing.
export function footprint(t: Pick<Table, 'kind' | 'w' | 'l' | 'seats'>) {
  const c = t.seats > 0 ? CHAIR * 1.2 : 0
  if (t.kind === 'round' || t.kind === 'lounge') return { w: t.w + 2 * c, l: t.w + 2 * c }
  if (t.kind === 'row') return { w: t.w, l: CHAIR }
  if (t.kind === 'classroom' || t.kind === 'sweetheart') return { w: t.w, l: t.l + c }
  return { w: t.w, l: t.l + 2 * c }
}

export function seatCount(p: Project) {
  return p.tables.reduce((a, t) => a + (isSeated(t.kind) ? t.seats : 0), 0)
}

export function tableNumbering(p: Project) {
  return p.tables.filter((t) => isSeated(t.kind) && t.kind !== 'row')
}

// ---------- automatic layouts ----------

export type LayoutStyle = 'banquet' | 'theatre' | 'classroom' | 'cabaret' | 'cocktail'

export const LAYOUT_STYLES: { id: LayoutStyle; name: string; hint: string }[] = [
  { id: 'banquet', name: 'Banquet', hint: 'Round tables of 10 for dinners and weddings' },
  { id: 'theatre', name: 'Theatre', hint: 'Rows of chairs facing the stage' },
  { id: 'classroom', name: 'Classroom', hint: 'Rows of narrow tables, guests face the stage' },
  { id: 'cabaret', name: 'Cabaret', hint: 'Round tables with the side facing the stage left open' },
  { id: 'cocktail', name: 'Cocktail', hint: 'High tables for standing guests' },
]

export interface Area {
  x: number
  y: number
  w: number
  l: number
}

// The free floor in front of the stage, inside the venue walls.
export function defaultArea(p: Project): Area {
  const sb = stageBounds(p)
  const top = sb ? sb.y + sb.l + 3 : 3
  const x = 2
  return { x, y: top, w: Math.max(4, p.venue.w - 2 * x), l: Math.max(4, p.venue.l - top - 3) }
}

export interface AutoLayoutInput {
  style: LayoutStyle
  guests: number
  area: Area
  aisle: number // centre and cross aisle width, metres
}

// Packs tables row by row from the front of the area, centred, until every guest has a seat (or space runs out).
export function autoLayout({ style, guests, area, aisle }: AutoLayoutInput): { tables: Table[]; seats: number; fits: boolean } {
  const tables: Table[] = []
  let seats = 0
  let n = 0
  const label = () => String(++n)
  const preset = {
    banquet: TABLE_PRESETS[1],
    cabaret: TABLE_PRESETS[1],
    theatre: TABLE_PRESETS[6],
    classroom: TABLE_PRESETS[7],
    cocktail: TABLE_PRESETS[4],
  }[style]
  const perTable = style === 'cabaret' ? 7 : style === 'cocktail' ? 6 : preset.seats

  if (style === 'theatre') {
    // Rows of chairs either side of a centre aisle.
    const half = (area.w - aisle) / 2
    const perSide = Math.max(1, Math.floor(half / ROW_PITCH))
    const rowGap = 0.95
    for (let y = area.y + CHAIR / 2; y + CHAIR / 2 <= area.y + area.l && seats < guests; y += rowGap) {
      for (const side of [-1, 1]) {
        if (seats >= guests) break
        const count = Math.min(perSide, guests - seats)
        const w = count * ROW_PITCH
        const cx = area.x + area.w / 2 + side * (aisle / 2 + w / 2)
        tables.push({ id: nanoid(8), kind: 'row', x: cx, y, w, l: 0.5, rotation: 0, seats: count, label: `Row ${tables.length + 1}` })
        seats += count
      }
    }
    return { tables, seats, fits: seats >= guests }
  }

  const fp = footprint({ ...preset, seats: perTable })
  // Service gaps between chair backs: ~3.5 m between round centres is standard banquet spacing.
  const gapX = style === 'classroom' ? 0.3 : style === 'cocktail' ? 2.2 : 0.6
  const gapY = style === 'classroom' ? 0.75 : style === 'cocktail' ? 2.2 : 0.6
  const cellW = fp.w + gapX
  const cellL = fp.l + gapY
  const half = (area.w - aisle) / 2
  const perSide = Math.max(1, Math.floor((half + gapX) / cellW))
  for (let row = 0; ; row++) {
    const y = area.y + row * cellL + fp.l / 2
    if (y + fp.l / 2 > area.y + area.l || seats >= guests) break
    // Stagger alternate rows of rounds so sightlines go between tables.
    const shift = style === 'banquet' && row % 2 ? cellW / 2 : 0
    for (const side of [-1, 1]) {
      for (let i = 0; i < perSide && seats < guests; i++) {
        const offset = aisle / 2 + fp.w / 2 + i * cellW + (side > 0 ? shift : 0)
        if (offset + fp.w / 2 > area.w / 2) continue
        const t: Table = { id: nanoid(8), kind: preset.kind, x: area.x + area.w / 2 + side * offset, y, w: preset.w, l: preset.l, rotation: 0, seats: perTable, label: label() }
        if (style === 'cabaret') t.open = true
        tables.push(t)
        seats += style === 'cocktail' ? perTable : t.seats
      }
    }
  }
  if (style === 'cocktail') tables.forEach((t) => (t.seats = 0))
  return { tables, seats, fits: seats >= guests }
}

// ---------- guests ----------

const MEAL_WORDS: Record<string, Meal> = { veg: 'veg', vegetarian: 'veg', 'non-veg': 'non-veg', nonveg: 'non-veg', 'non veg': 'non-veg', jain: 'jain', vegan: 'vegan', kid: 'kids', kids: 'kids', child: 'kids' }

// One guest per line: "Name, Group, Meal, VIP". Only the name is required.
export function parseGuests(text: string): Guest[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/[,\t;]/).map((x) => x.trim()))
    .filter((c) => c[0])
    .map((c) => ({
      id: nanoid(8),
      name: c[0].slice(0, 80),
      group: (c[1] ?? '').slice(0, 40),
      meal: MEAL_WORDS[(c[2] ?? '').toLowerCase()] ?? 'veg',
      vip: /^(vip|yes|y|true|1)$/i.test(c[3] ?? '') || /\bvip\b/i.test(c[1] ?? ''),
    }))
}

// Seats unassigned guests: VIPs at the tables nearest the stage, groups kept together where they fit.
export function autoSeat(p: Project): Guest[] {
  const sb = stageBounds(p)
  const front = sb ? { x: sb.x + sb.w / 2, y: sb.y + sb.l } : { x: p.venue.w / 2, y: 0 }
  const order = p.tables
    .filter((t) => isSeated(t.kind) && t.seats > 0)
    .sort((a, b) => Math.hypot(a.x - front.x, a.y - front.y) - Math.hypot(b.x - front.x, b.y - front.y))
  const free = new Map(order.map((t) => [t.id, t.seats - p.guests.filter((g) => g.tableId === t.id).length]))
  const guests = p.guests.map((g) => ({ ...g }))
  const waiting = guests.filter((g) => !g.tableId || !free.has(g.tableId))
  waiting.forEach((g) => (g.tableId = undefined))
  // Biggest groups first, VIP groups ahead of everyone.
  const groups = new Map<string, Guest[]>()
  for (const g of waiting) {
    const k = g.group || `__${g.id}`
    groups.set(k, [...(groups.get(k) ?? []), g])
  }
  const ordered = [...groups.values()].sort((a, b) => Number(b.some((g) => g.vip)) - Number(a.some((g) => g.vip)) || b.length - a.length)
  for (const group of ordered) {
    let rest = group
    while (rest.length) {
      // Prefer a single table that holds the whole remaining group, else the emptiest table.
      const fit = order.find((t) => (free.get(t.id) ?? 0) >= rest.length)
      const table = fit ?? [...order].sort((a, b) => (free.get(b.id) ?? 0) - (free.get(a.id) ?? 0))[0]
      const room = table ? (free.get(table.id) ?? 0) : 0
      if (!table || room <= 0) return guests
      const now = rest.slice(0, room)
      now.forEach((g) => (g.tableId = table.id))
      free.set(table.id, room - now.length)
      rest = rest.slice(room)
    }
  }
  return guests
}

export function mealCounts(guests: Guest[]) {
  const out = Object.fromEntries(MEALS.map((m) => [m.id, 0])) as Record<Meal, number>
  for (const g of guests) out[g.meal]++
  return out
}

export function seatingCSV(p: Project) {
  const name = new Map(p.tables.map((t) => [t.id, t.label]))
  const rows = [['Guest', 'Group', 'Meal', 'VIP', 'Table']]
  for (const g of [...p.guests].sort((a, b) => (name.get(a.tableId ?? '') ?? '~').localeCompare(name.get(b.tableId ?? '') ?? '~', undefined, { numeric: true }) || a.name.localeCompare(b.name)))
    rows.push([g.name, g.group, MEALS.find((m) => m.id === g.meal)!.name, g.vip ? 'Yes' : '', g.tableId ? `Table ${name.get(g.tableId) ?? ''}` : 'Not seated'])
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')
}

// Older saved projects have no seating yet.
export function withSeating(p: Project): Project {
  p.tables ??= []
  p.guests ??= []
  return p
}
