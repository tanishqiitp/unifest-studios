import type { CrewMember, Project } from '../types'
import type { EquipRow } from './export/equipment'
import { readLibrary, readProject } from './library'
import { fullEquipment } from './quote'

// ---------- Inventory (this browser's own stock) ----------

const INV_KEY = 'unifest:inventory'
export type InvItem = { id: string; item: string; category: string; qty: number }

export function readInventory(): InvItem[] {
  try {
    return JSON.parse(localStorage.getItem(INV_KEY) || '[]') as InvItem[]
  } catch {
    return []
  }
}

export function writeInventory(list: InvItem[]) {
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(list))
  } catch {
    /* storage full or blocked */
  }
}

// Seed stock from what this project needs.
export const inventoryFromProject = (p: Project): InvItem[] => fullEquipment(p).map((r) => ({ id: `${r.category}:${r.item}`, item: r.item, category: r.category, qty: r.qty }))

export function otherProjects(p: Project): Project[] {
  return readLibrary()
    .filter((e) => e.id !== p.id)
    .map((e) => readProject(e.id))
    .filter((x): x is Project => !!x)
}

// ---------- Availability across overlapping events ----------

const DAY = 86400000
const range = (p: Project): [number, number] | null => {
  const s = p.eventDate ? Date.parse(p.eventDate) : NaN
  return Number.isNaN(s) ? null : [s, s + (Math.max(1, p.eventDays ?? 1) - 1) * DAY]
}
const overlaps = (a: Project, b: Project) => {
  const x = range(a)
  const y = range(b)
  return !!x && !!y && x[0] <= y[1] && y[0] <= x[1]
}

export interface AvailRow {
  item: string
  need: number
  own: number
  bookedElsewhere: number
  short: number
  hireIn: boolean // not in inventory at all
}

export function availability(p: Project, inv: InvItem[], others: Project[]): AvailRow[] {
  const clash = others.filter((o) => overlaps(p, o))
  const booked = new Map<string, number>()
  for (const o of clash) for (const r of fullEquipment(o)) booked.set(r.item, (booked.get(r.item) ?? 0) + r.qty)
  return fullEquipment(p).map((r) => {
    const stock = inv.filter((i) => i.item === r.item)
    const bookedElsewhere = booked.get(r.item) ?? 0
    if (!stock.length) return { item: r.item, need: r.qty, own: 0, bookedElsewhere, short: r.qty, hireIn: true }
    const own = stock.reduce((a, i) => a + i.qty, 0)
    return { item: r.item, need: r.qty, own, bookedElsewhere, short: Math.max(0, r.qty + bookedElsewhere - own), hireIn: false }
  })
}

// ---------- Truck pack list ----------

const LOAD_ORDER = ['Truss', 'Rigging', 'Stage', 'LED', 'Lighting', 'Sound', 'Power', 'Decor', 'Effects', 'Branding', 'Site']
export interface Truck {
  name: string
  kg: number
  items: { category: string; item: string; qty: number; weightKg: number }[]
}

// Load in build order (rigging first); a row that does not fit is split across trucks.
export function packList(p: Project, truckKg = 7000): Truck[] {
  const rank = (c: string) => (LOAD_ORDER.includes(c) ? LOAD_ORDER.indexOf(c) : LOAD_ORDER.length)
  const rows: EquipRow[] = fullEquipment(p).sort((a, b) => rank(a.category) - rank(b.category))
  const trucks: Truck[] = []
  const fresh = () => trucks.push({ name: `Truck ${trucks.length + 1}`, kg: 0, items: [] })
  fresh()
  for (const r of rows) {
    const uw = r.qty ? r.weightKg / r.qty : 0
    let left = r.qty
    while (left > 0) {
      const cur = trucks[trucks.length - 1]
      let take = left
      if (uw > 0) take = Math.min(left, Math.floor((truckKg - cur.kg) / uw + 1e-9))
      if (take <= 0) {
        if (cur.items.length) {
          fresh()
          continue
        }
        take = 1 // a single piece heavier than a truck still has to go somewhere
      }
      cur.items.push({ category: r.category, item: r.item, qty: take, weightKg: take * uw })
      cur.kg += take * uw
      left -= take
    }
  }
  return trucks.filter((t) => t.items.length)
}

// ---------- Generator sizing ----------

const DG_SIZES = [15, 25, 30, 40, 62.5, 82.5, 125, 160, 200, 250, 320, 380, 500]
// Share of connected load that actually runs at once.
const DIVERSITY: Record<string, number> = { LED: 0.7, Lighting: 0.8, Effects: 0.5 }

export function generatorPlan(p: Project) {
  const rows = fullEquipment(p).filter((r) => r.category !== 'Sound')
  const la = p.fixtures.filter((f) => f.kind === 'line-array').length
  const subs = p.fixtures.filter((f) => f.kind === 'sub').length
  const soundW = Math.ceil(la / 4) * 3000 + subs * 1500 // amplifier draw
  const connectedW = rows.reduce((a, r) => a + r.powerW, 0) + soundW
  const demandW = rows.reduce((a, r) => a + r.powerW * (DIVERSITY[r.category] ?? 1), 0) + soundW
  const demandKva = demandW / 1000 / 0.8 // power factor 0.8
  const need = demandKva * 1.25 // 25% headroom
  const sets: number[] = []
  let rest = need
  while (rest > 500) {
    sets.push(500)
    rest -= 500
  }
  if (rest > 0) sets.push(DG_SIZES.find((s) => s >= rest) ?? 500)
  const suggestedKva = sets.reduce((a, b) => a + b, 0)
  return {
    connectedKw: Math.round(connectedW) / 1000,
    diversity: connectedW ? Math.round((demandW / connectedW) * 100) / 100 : 1,
    demandKva: Math.round(demandKva * 10) / 10,
    suggestedKva,
    sets,
    standby: suggestedKva > 100, // add one standby set
  }
}

// ---------- Crew ----------

export type CrewSuggestion = Omit<CrewMember, 'id'>

export function crewSuggestion(p: Project): CrewSuggestion[] {
  const out: CrewSuggestion[] = []
  const add = (n: number, role: string, dept: CrewMember['dept']) => {
    for (let i = 0; i < n; i++) out.push({ name: '', role, phone: '', call: '', dept })
  }
  const cabinets = fullEquipment(p).filter((r) => r.category === 'LED' && /cabinet$/.test(r.item)).reduce((a, r) => a + r.qty, 0)
  const fixtures = p.fixtures.filter((f) => f.kind !== 'line-array' && f.kind !== 'sub').length
  const sound = p.fixtures.some((f) => f.kind === 'line-array' || f.kind === 'sub')
  const decor = p.decor?.length ?? 0
  add(1, 'Production Manager', 'Production')
  if (cabinets) add(Math.ceil(cabinets / 150) + 1, 'LED Technician', 'LED')
  if (p.hoists.length) add(Math.max(2, Math.ceil(p.hoists.length / 4)), 'Rigger', 'Rigging')
  if (fixtures) add(Math.ceil(fixtures / 20) + 1, 'Lighting Technician', 'Lighting')
  if (sound) add(2, 'Sound Engineer', 'Sound')
  if (p.decks.length) add(Math.ceil(p.decks.length / 10) + 2, 'Stage Hand', 'Stage')
  if (decor > 0) add(Math.ceil(decor / 15) + 1, 'Decor Crew', 'Decor')
  if (p.ground.some((g) => g.kind === 'generator')) add(1, 'Power Technician', 'Power')
  return out
}
