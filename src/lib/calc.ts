import type { Fixture, GroundItem, Hoist, Panel, Project, Screen, Truss, TrussType } from '../types'
import { nanoid } from 'nanoid'
import { findPanel } from './panels'

export const VOLTS = 230
const CIRCUIT_DERATE = 0.8

export const TRUSS_INFO: Record<TrussType, { name: string; kgPerM: number; size: number; strength: number }> = {
  box30: { name: '30 cm box truss', kgPerM: 7, size: 0.3, strength: 1 },
  box40: { name: '40 cm box truss', kgPerM: 10, size: 0.4, strength: 1.8 },
  tri30: { name: '30 cm triangle truss', kgPerM: 5, size: 0.3, strength: 0.7 },
}

export const FIXTURE_INFO: Record<Fixture['kind'], { name: string; weight: number; watts: number; flown: boolean }> = {
  'moving-head': { name: 'Moving head', weight: 22, watts: 450, flown: true },
  par: { name: 'LED par', weight: 4, watts: 120, flown: true },
  beam: { name: 'Beam light', weight: 18, watts: 350, flown: true },
  blinder: { name: 'Blinder', weight: 6, watts: 400, flown: true },
  'line-array': { name: 'Line array box', weight: 55, watts: 0, flown: true },
  sub: { name: 'Subwoofer', weight: 70, watts: 0, flown: false },
}

// ---------- LED screens ----------

export function screenSize(s: Screen, p: Panel) {
  return { w: (s.cols * p.w) / 1000, h: (s.rows * p.h) / 1000 }
}

export interface ScreenStats {
  panel: Panel
  w: number
  h: number
  area: number
  pxW: number
  pxH: number
  cabinets: number
  weight: number
  maxW: number
  avgW: number
}

export function screenStats(s: Screen, custom: Panel[]): ScreenStats {
  const panel = findPanel(s.panelId, custom)
  const { w, h } = screenSize(s, panel)
  const cabinets = s.cols * s.rows - s.virtual.length
  return {
    panel,
    w,
    h,
    area: (cabinets * panel.w * panel.h) / 1e6,
    pxW: s.cols * panel.pxW,
    pxH: s.rows * panel.pxH,
    cabinets,
    weight: cabinets * panel.weight,
    maxW: cabinets * panel.maxW,
    avgW: cabinets * panel.avgW,
  }
}

// Column centres of a (possibly curved) screen in the top view, in world coordinates.
export function screenColumns(s: Screen, p: Panel): { x: number; y: number; angle: number }[] {
  const cw = p.w / 1000
  const W = s.cols * cw
  const step = s.shape === 'flat' ? 0 : ((s.shape === 'concave' ? 1 : -1) * s.curveDeg * Math.PI) / 180
  let heading = (-step * (s.cols - 1)) / 2
  let px = 0
  let py = 0
  const local: { x: number; y: number; angle: number }[] = []
  let firstLeft = { x: 0, y: 0 }
  for (let i = 0; i < s.cols; i++) {
    const dx = Math.cos(heading)
    const dy = Math.sin(heading)
    if (i === 0) firstLeft = { x: px, y: py }
    local.push({ x: px + (dx * cw) / 2, y: py + (dy * cw) / 2, angle: heading })
    px += dx * cw
    py += dy * cw
    heading += step
  }
  const mid = { x: (firstLeft.x + px) / 2, y: (firstLeft.y + py) / 2 }
  const rot = (s.rotation * Math.PI) / 180
  const cx = s.x + W / 2
  return local.map((c) => {
    const lx = c.x - mid.x
    const ly = c.y - mid.y
    return {
      x: cx + lx * Math.cos(rot) - ly * Math.sin(rot),
      y: s.y + lx * Math.sin(rot) + ly * Math.cos(rot),
      angle: c.angle + rot,
    }
  })
}

// Order in which cabinets are daisy-chained for data (serpentine), skipping virtual cells.
export function cableOrder(s: Screen, path: 'S-row' | 'S-col' = 'S-row'): number[] {
  const out: number[] = []
  const skip = new Set(s.virtual)
  if (path === 'S-row') {
    for (let r = s.rows - 1; r >= 0; r--) {
      const k = s.rows - 1 - r
      for (let i = 0; i < s.cols; i++) {
        const c = k % 2 === 0 ? i : s.cols - 1 - i
        const idx = r * s.cols + c
        if (!skip.has(idx)) out.push(idx)
      }
    }
  } else {
    for (let c = 0; c < s.cols; c++) {
      for (let i = 0; i < s.rows; i++) {
        const r = c % 2 === 0 ? s.rows - 1 - i : i
        const idx = r * s.cols + c
        if (!skip.has(idx)) out.push(idx)
      }
    }
  }
  return out
}

export interface PortMap {
  perPort: number
  ports: number[][] // cell indices per port
}

export function portMap(s: Screen, panel: Panel, portPx: number): PortMap {
  const perPort = Math.max(1, Math.floor(portPx / (panel.pxW * panel.pxH)))
  const order = cableOrder(s)
  const ports: number[][] = []
  for (let i = 0; i < order.length; i += perPort) ports.push(order.slice(i, i + perPort))
  return { perPort, ports }
}

export interface Circuit {
  screenId: string
  index: number
  phase: 'L1' | 'L2' | 'L3'
  cells: number[]
  watts: number
  amps: number
}

export function circuitsFor(s: Screen, panel: Panel, amps: number): { perCircuit: number; circuits: Omit<Circuit, 'phase'>[] } {
  const perCircuit = Math.max(1, Math.floor((VOLTS * amps * CIRCUIT_DERATE) / panel.maxW))
  const order = cableOrder(s)
  const circuits: Omit<Circuit, 'phase'>[] = []
  for (let i = 0; i < order.length; i += perCircuit) {
    const cells = order.slice(i, i + perCircuit)
    const watts = cells.length * panel.maxW
    circuits.push({ screenId: s.id, index: circuits.length, cells, watts, amps: watts / VOLTS })
  }
  return { perCircuit, circuits }
}

// Assign every circuit of every screen to the least-loaded phase (greedy balance).
export function powerPlan(project: Project) {
  const all: Circuit[] = []
  const load = { L1: 0, L2: 0, L3: 0 }
  const raw = project.screens.flatMap((s) => circuitsFor(s, findPanel(s.panelId, project.customPanels), project.circuitAmps).circuits)
  raw
    .slice()
    .sort((a, b) => b.watts - a.watts)
    .forEach((c) => {
      const phase = (Object.keys(load) as (keyof typeof load)[]).sort((a, b) => load[a] - load[b])[0]
      load[phase] += c.watts
      all.push({ ...c, phase })
    })
  const amps = { L1: load.L1 / VOLTS, L2: load.L2 / VOLTS, L3: load.L3 / VOLTS }
  const vals = Object.values(amps)
  const maxA = Math.max(...vals)
  const imbalance = maxA > 0 ? (maxA - Math.min(...vals)) / maxA : 0
  return { circuits: all, amps, imbalance }
}

// Pixel-map raster: screens packed left to right in stage order.
export function pixelLayout(project: Project) {
  let x = 0
  let H = 0
  const items = project.screens
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((s) => {
      const st = screenStats(s, project.customPanels)
      const it = { screen: s, stats: st, rx: x, ry: 0 }
      x += st.pxW
      H = Math.max(H, st.pxH)
      return it
    })
  return { items, width: x, height: H }
}

// ---------- Truss & rigging ----------

function projectOnSegment(t: Truss, px: number, py: number) {
  const dx = t.x2 - t.x1
  const dy = t.y2 - t.y1
  const L2 = dx * dx + dy * dy || 1
  const u = Math.min(1, Math.max(0, ((px - t.x1) * dx + (py - t.y1) * dy) / L2))
  const cx = t.x1 + u * dx
  const cy = t.y1 + u * dy
  return { u, dist: Math.hypot(px - cx, py - cy) }
}

export function trussLength(t: Truss) {
  return Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
}

const STOCK = [4, 3, 2, 1.5, 1, 0.5]

// Split a run into rental stock lengths, longest first.
export function stockPieces(len: number) {
  const out: number[] = []
  let rest = Math.round(len * 2) / 2
  for (const s of STOCK) while (rest >= s - 0.001) (out.push(s), (rest -= s))
  return out
}

// Approximate allowable uniformly distributed load (kg) for a simply supported span.
// Indicative only — always verify against the manufacturer's load table.
export function allowableLoad(type: TrussType, span: number) {
  const table: [number, number][] = [
    [2, 1600],
    [4, 1200],
    [6, 800],
    [8, 550],
    [10, 400],
    [12, 280],
    [14, 200],
    [16, 150],
    [20, 80],
  ]
  let v = table[table.length - 1][1]
  for (let i = 0; i < table.length - 1; i++) {
    const [s0, l0] = table[i]
    const [s1, l1] = table[i + 1]
    if (span <= s0) {
      v = l0
      break
    }
    if (span <= s1) {
      v = l0 + ((span - s0) / (s1 - s0)) * (l1 - l0)
      break
    }
  }
  return v * TRUSS_INFO[type].strength
}

export interface SupportLoad {
  id: string
  label: string
  x: number
  y: number
  kg: number
  capacity: number
  trussId: string
}

export interface TrussLoad {
  truss: Truss
  length: number
  selfWeight: number
  attached: { label: string; kg: number }[]
  total: number
  maxSpan: number
  spanLoad: number // live load carried by the worst span (uniform approximation)
  allowable: number
  supported: boolean
}

export function rigging(project: Project) {
  const supports: SupportLoad[] = []
  const trusses: TrussLoad[] = []
  const custom = project.customPanels

  for (const t of project.truss) {
    const L = trussLength(t)
    const pts: { u: number; kg: number; label: string }[] = []
    const selfWeight = L * TRUSS_INFO[t.type].kgPerM
    const n = Math.max(2, Math.ceil(L / 0.5))
    for (let i = 0; i < n; i++) pts.push({ u: (i + 0.5) / n, kg: selfWeight / n, label: 'truss' })

    const attached: { label: string; kg: number }[] = []
    for (const s of project.screens) {
      if (s.mount !== 'flown') continue
      const st = screenStats(s, custom)
      const cols = screenColumns(s, st.panel)
      const colKg = st.weight / Math.max(1, cols.length)
      let hit = false
      for (const c of cols) {
        const p = projectOnSegment(t, c.x, c.y)
        if (p.dist < 0.75) {
          pts.push({ u: p.u, kg: colKg, label: s.name })
          hit = true
        }
      }
      if (hit) attached.push({ label: s.name, kg: Math.round(st.weight) })
    }
    for (const f of project.fixtures) {
      const info = FIXTURE_INFO[f.kind]
      if (!info.flown) continue
      const p = projectOnSegment(t, f.x, f.y)
      if (p.dist < 0.6) {
        pts.push({ u: p.u, kg: info.weight, label: info.name })
        attached.push({ label: info.name, kg: info.weight })
      }
    }

    // Support points: hoists near the line, else ground-support legs at the ends.
    let sup = project.hoists
      .map((h: Hoist) => ({ h, p: projectOnSegment(t, h.x, h.y) }))
      .filter((o) => o.p.dist < 0.5)
      .map((o) => ({ id: o.h.id, u: o.p.u, x: o.h.x, y: o.h.y, capacity: o.h.capacity, label: `Hoist ${o.h.id.slice(0, 4).toUpperCase()}` }))
    const supported = sup.length > 0 || t.legs
    if (sup.length === 0) {
      sup = [
        { id: `${t.id}-a`, u: 0, x: t.x1, y: t.y1, capacity: t.legs ? 1000 : 0, label: t.legs ? 'Tower A' : 'End A (unsupported)' },
        { id: `${t.id}-b`, u: 1, x: t.x2, y: t.y2, capacity: t.legs ? 1000 : 0, label: t.legs ? 'Tower B' : 'End B (unsupported)' },
      ]
    }
    sup.sort((a, b) => a.u - b.u)
    const kgs = sup.map(() => 0)
    for (const pt of pts) {
      let i = sup.findIndex((s) => s.u >= pt.u)
      if (i === -1) kgs[sup.length - 1] += pt.kg
      else if (i === 0) kgs[0] += pt.kg
      else {
        const a = sup[i - 1]
        const b = sup[i]
        const f = (pt.u - a.u) / (b.u - a.u || 1)
        kgs[i - 1] += pt.kg * (1 - f)
        kgs[i] += pt.kg * f
      }
    }
    sup.forEach((s, i) => supports.push({ id: s.id, label: s.label, x: s.x, y: s.y, kg: kgs[i], capacity: s.capacity, trussId: t.id }))

    // Longest unsupported length; cantilevered ends count double.
    let maxSpan = Math.max(sup[0].u * L * 2, (1 - sup[sup.length - 1].u) * L * 2)
    for (let i = 1; i < sup.length; i++) maxSpan = Math.max(maxSpan, (sup[i].u - sup[i - 1].u) * L)

    const total = pts.reduce((a, p) => a + p.kg, 0)
    const spanLoad = (total - selfWeight) * Math.min(1, maxSpan / Math.max(L, 0.01))
    trusses.push({ truss: t, length: L, selfWeight, attached: mergeAttached(attached), total, maxSpan, spanLoad, allowable: allowableLoad(t.type, maxSpan), supported })
  }

  // Merge supports that share a hoist (a hoist can sit at a truss junction).
  const merged = new Map<string, SupportLoad>()
  for (const s of supports) {
    const m = merged.get(s.id)
    if (m) m.kg += s.kg
    else merged.set(s.id, { ...s })
  }
  return { supports: [...merged.values()], trusses }
}

// Place evenly spaced chain hoists on every loaded truss until each point stays under 80% of
// its rating and every span is within the indicative truss limit.
export function autoRig(project: Project): Hoist[] {
  let hoists = project.hoists.slice()
  for (const t of project.truss) {
    const L = trussLength(t)
    const onThis = (h: Hoist) => projectOnSegment(t, h.x, h.y).dist < 0.5
    const others = hoists.filter((h) => !onThis(h))
    let best: Hoist[] | null = null
    for (let n = L < 2 ? 1 : 2; n <= 40 && !best; n++) {
      for (const cap of [1000, 2000]) {
        const inset = Math.min(0.25, L / 4)
        const cand: Hoist[] = Array.from({ length: n }, (_, i) => {
          const u = n === 1 ? 0.5 : (inset + (i * (L - 2 * inset)) / (n - 1)) / L
          return { id: `tmp-${i}`, x: Math.round((t.x1 + (t.x2 - t.x1) * u) * 100) / 100, y: Math.round((t.y1 + (t.y2 - t.y1) * u) * 100) / 100, capacity: cap }
        })
        const r = rigging({ ...project, hoists: [...others, ...cand] })
        const tl = r.trusses.find((x) => x.truss.id === t.id)!
        if (tl.total - tl.selfWeight < 1 && t.legs) {
          best = hoists.filter(onThis)
          break
        }
        const pts = r.supports.filter((s) => cand.some((c) => c.id === s.id))
        if (pts.every((s) => s.kg <= s.capacity * 0.8) && tl.spanLoad <= tl.allowable) {
          best = cand
          break
        }
      }
    }
    hoists = [...others, ...(best ?? []).map((h) => (h.id.startsWith('tmp-') ? { ...h, id: nanoid(8) } : h))]
  }
  return hoists
}

function mergeAttached(a: { label: string; kg: number }[]) {
  const m = new Map<string, number>()
  a.forEach((x) => m.set(x.label, (m.get(x.label) ?? 0) + x.kg))
  return [...m].map(([label, kg]) => ({ label, kg }))
}

// ---------- Ground plan ----------

export const DENSITY: Partial<Record<GroundItem['kind'], number>> = { crowd: 2, seating: 1 / 0.6, vip: 1 }

export function capacity(ground: GroundItem[]) {
  return Math.round(ground.reduce((a, g) => a + (DENSITY[g.kind] ?? 0) * g.w * g.h, 0))
}

export function stageBounds(project: Project) {
  if (!project.decks.length) return null
  const xs = project.decks.flatMap((d) => [d.x, d.x + d.w])
  const ys = project.decks.flatMap((d) => [d.y, d.y + d.l])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), l: Math.max(...ys) - Math.min(...ys), h: Math.max(...project.decks.map((d) => d.h)) }
}

// ---------- Project totals (HUD) ----------

export function totals(project: Project) {
  const stats = project.screens.map((s) => screenStats(s, project.customPanels))
  const pl = pixelLayout(project)
  const ledKg = stats.reduce((a, s) => a + s.weight, 0)
  const trussKg = project.truss.reduce((a, t) => a + trussLength(t) * TRUSS_INFO[t.type].kgPerM, 0)
  const fixKg = project.fixtures.reduce((a, f) => a + FIXTURE_INFO[f.kind].weight, 0)
  const ledW = stats.reduce((a, s) => a + s.maxW, 0)
  const fixW = project.fixtures.reduce((a, f) => a + FIXTURE_INFO[f.kind].watts, 0)
  const sb = stageBounds(project)
  return {
    pxW: pl.width,
    pxH: pl.height,
    ledArea: stats.reduce((a, s) => a + s.area, 0),
    cabinets: stats.reduce((a, s) => a + s.cabinets, 0),
    weight: ledKg + trussKg + fixKg,
    powerKw: (ledW + fixW) / 1000,
    stage: sb ? `${fmt(sb.w)} × ${fmt(sb.l)} m` : '—',
    capacity: capacity(project.ground),
  }
}

export function fmt(n: number, d = 1) {
  return Number.isInteger(n) ? String(n) : n.toFixed(d)
}

export function fmtLen(m: number, units: 'm' | 'ft') {
  return units === 'ft' ? `${(m * 3.28084).toFixed(1)} ft` : `${fmt(m, 2)} m`
}
