// Weight and power: one set of definitions for the HUD, Deliver, the technical PDF and the equipment CSV.
//
//  - Total equipment weight: every row of the equipment list (LED, flying bars and bases, truss stock and
//    towers, rigging hardware, hoists, stage decks, lighting, sound, decor, set pieces and modelled parts).
//  - Load on truss supports: truss self-weight plus everything hung on it (LED, fixtures), from the rigging
//    calculation. Ground-supported: the rest (decks, stacks, towers' bases, decor, set, sound on the ground).
//  - Power, continuous (max): LED at maximum draw + lighting + processors + effects and set LED.
//    LED average draw is shown alongside. Hoist motors are intermittent and listed separately, never added.
//  - No diversity factor is applied here; the generator plan applies its own stated factors.
//  - Items without a published power spec (e.g. loudspeaker amplifiers) are listed as unverified, not guessed.
// These are planning estimates and do not replace structural or electrical review.
import type { Project } from '../types'
import { rigging, screenStats } from './calc'
import { fullEquipment } from './quote'
import type { EquipRow } from './export/equipment'

export type PowerKind = 'continuous' | 'motor' | 'none'
export const powerKind = (r: EquipRow): PowerKind => (r.category === 'Rigging' && /hoist/i.test(r.item) ? 'motor' : r.powerW > 0 ? 'continuous' : 'none')

export interface LoadSummary {
  rows: EquipRow[]
  weightKg: number
  trussLoadKg: number
  groundKg: number
  ledMaxW: number
  ledAvgW: number
  otherW: number // continuous loads other than LED cabinets
  continuousMaxW: number // ledMaxW + otherW
  motorW: number // hoists, intermittent
  unverified: string[]
}

export function loadSummary(p: Project): LoadSummary {
  const rows = fullEquipment(p)
  const weightKg = rows.reduce((a, r) => a + r.weightKg, 0)
  const trussLoadKg = Math.min(weightKg, rigging(p).trusses.reduce((a, t) => a + t.total, 0))
  const stats = p.screens.map((s) => screenStats(s, p.customPanels))
  const ledMaxW = stats.reduce((a, s) => a + s.maxW, 0)
  const ledAvgW = stats.reduce((a, s) => a + s.avgW, 0)
  const cabinetW = rows.filter((r) => r.category === 'LED' && /cabinet/i.test(r.item)).reduce((a, r) => a + r.powerW, 0)
  const continuous = rows.filter((r) => powerKind(r) === 'continuous').reduce((a, r) => a + r.powerW, 0)
  const otherW = continuous - cabinetW
  const motorW = rows.filter((r) => powerKind(r) === 'motor').reduce((a, r) => a + r.powerW, 0)
  const unverified: string[] = []
  if (p.fixtures.some((f) => f.kind === 'line-array' || f.kind === 'sub')) unverified.push('Loudspeaker amplifier power is not included (no model specified).')
  if ((p.parts ?? []).length) unverified.push('Modelled parts use an estimated 12 kg per m² of surface.')
  if ((p.set ?? []).length) unverified.push('Set pieces use estimated weights per m².')
  return { rows, weightKg, trussLoadKg, groundKg: weightKg - trussLoadKg, ledMaxW, ledAvgW, otherW, continuousMaxW: cabinetW + otherW, motorW, unverified }
}

/** Equipment CSV: one row per item with unit and row totals, then the summary totals with their definitions. */
export function equipmentCSV(p: Project) {
  const s = loadSummary(p)
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const r1 = (n: number) => Math.round(n * 10) / 10
  const head = ['Category', 'Item', 'Qty', 'Unit', 'Unit weight (kg)', 'Row weight (kg)', 'Unit power (W)', 'Row power (W)', 'Power type']
  const lines = s.rows.map((r) => [r.category, r.item, r.qty, r.unit, r.qty ? r1(r.weightKg / r.qty) : '', r1(r.weightKg), r.qty && r.powerW ? r1(r.powerW / r.qty) : '', r1(r.powerW), powerKind(r) === 'motor' ? 'Motor (intermittent)' : powerKind(r) === 'continuous' ? 'Continuous' : ''].map(esc).join(','))
  const sum = (label: string, value: string) => [esc(label), esc(value)].join(',')
  return [
    head.map(esc).join(','),
    ...lines,
    '',
    sum('Total equipment weight (kg)', String(r1(s.weightKg))),
    sum('  of which on truss supports (kg)', String(r1(s.trussLoadKg))),
    sum('  of which ground-supported (kg)', String(r1(s.groundKg))),
    sum('Continuous power, max (kW)', String(r1(s.continuousMaxW / 1000))),
    sum('  LED max / average (kW)', `${r1(s.ledMaxW / 1000)} / ${r1(s.ledAvgW / 1000)}`),
    sum('  Other continuous loads (kW)', String(r1(s.otherW / 1000))),
    sum('Hoist motors, intermittent, not in continuous total (kW)', String(r1(s.motorW / 1000))),
    ...s.unverified.map((u) => sum('Unverified', u)),
    sum('Note', 'Planning estimates without diversity. Not a substitute for structural or electrical review.'),
  ].join('\r\n')
}
