import type { Project } from '../../types'
import { FIXTURE_INFO, portMap, powerPlan, screenStats, stockPieces, trussLength, TRUSS_INFO } from '../calc'

export interface EquipRow {
  category: string
  item: string
  qty: number
  unit: string
  weightKg: number
  powerW: number
}

export function equipmentList(p: Project): EquipRow[] {
  const rows: EquipRow[] = []
  const add = (category: string, item: string, qty: number, unit = 'pcs', weightKg = 0, powerW = 0) => {
    const r = rows.find((x) => x.category === category && x.item === item)
    if (r) {
      r.qty += qty
      r.weightKg += weightKg
      r.powerW += powerW
    } else rows.push({ category, item, qty, unit, weightKg, powerW })
  }

  let ports = 0
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    add('LED', `${st.panel.model} cabinet`, st.cabinets, 'pcs', st.weight, st.maxW)
    ports += portMap(s, st.panel, p.processor.portPx).ports.length
    if (s.mount === 'flown') add('LED', 'Flying bar (per column)', s.cols, 'pcs', s.cols * 6)
    else add('LED', 'Ground-stack base (per column)', s.cols, 'pcs', s.cols * 10)
  }
  if (ports) {
    add('LED', `${p.processor.name} port`, ports, 'ports')
    add('LED', 'LED processor (16 ports)', Math.ceil(ports / 16), 'pcs', 0, Math.ceil(ports / 16) * 150)
    add('LED', 'Cat6 data cable', ports, 'runs')
  }
  const pp = powerPlan(p)
  if (pp.circuits.length) add('Power', `${p.circuitAmps} A power line`, pp.circuits.length, 'circuits')

  for (const t of p.truss) {
    const info = TRUSS_INFO[t.type]
    for (const len of stockPieces(trussLength(t))) add('Truss', `${info.name} ${len} m`, 1, 'pcs', len * info.kgPerM)
    if (t.legs) add('Truss', `Ground-support tower ${t.height} m`, 2, 'pcs', 2 * (t.height * info.kgPerM + 60))
  }
  const corners = p.truss.length > 1 ? p.truss.length : 0
  if (corners) add('Truss', 'Corner / junction block', corners, 'pcs', corners * 6)
  for (const h of p.hoists) add('Rigging', `Chain hoist ${h.capacity} kg`, 1, 'pcs', 45, 1500)

  for (const d of p.decks) add('Stage', `Stage deck ${d.w}×${d.l} m`, 1, 'pcs', d.w * d.l * 25)

  for (const f of p.fixtures) add(f.kind === 'line-array' || f.kind === 'sub' ? 'Sound' : 'Lighting', FIXTURE_INFO[f.kind].name, 1, 'pcs', FIXTURE_INFO[f.kind].weight, FIXTURE_INFO[f.kind].watts)

  for (const g of p.ground) {
    if (g.kind === 'barricade') add('Site', 'Crowd barricade', Math.ceil(Math.max(g.w, g.h)), 'm')
    if (g.kind === 'seating') add('Site', 'Chairs', Math.round((g.w * g.h) / 0.6), 'pcs')
    if (g.kind === 'generator') add('Power', 'Generator', 1, 'pcs')
  }
  return rows
}

export function equipmentCSV(p: Project) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['Category', 'Item', 'Qty', 'Unit', 'Weight (kg)', 'Power (W)']
  const lines = equipmentList(p).map((r) => [r.category, r.item, r.qty, r.unit, Math.round(r.weightKg), Math.round(r.powerW)].map(esc).join(','))
  return [head.map(esc).join(','), ...lines].join('\r\n')
}
