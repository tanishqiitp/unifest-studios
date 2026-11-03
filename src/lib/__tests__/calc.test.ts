import { describe, expect, it } from 'vitest'
import type { Project, Screen } from '../../types'
import { allowableLoad, autoRig, cableOrder, capacity, circuitsFor, pixelLayout, portMap, powerPlan, rigging, screenColumns, screenStats, stockPieces, totals } from '../calc'
import { findPanel } from '../panels'
import { emptyProject } from '../templates'

const screen = (over: Partial<Screen> = {}): Screen => ({
  id: 's1',
  name: 'MAIN',
  panelId: 'p39-500',
  cols: 8,
  rows: 4,
  virtual: [],
  x: 0,
  y: 0,
  z: 2,
  rotation: 0,
  shape: 'flat',
  curveDeg: 0,
  mount: 'flown',
  color: '#ffffff',
  ...over,
})

const project = (over: Partial<Project> = {}): Project => ({ ...emptyProject('Test'), ...over })

describe('LED screens', () => {
  it('computes size, pixels, weight and power from the panel', () => {
    const st = screenStats(screen(), [])
    // P3.9 500x500: 128x128 px, 7.5 kg, 150 W max
    expect(st.w).toBe(4)
    expect(st.h).toBe(2)
    expect(st.pxW).toBe(1024)
    expect(st.pxH).toBe(512)
    expect(st.cabinets).toBe(32)
    expect(st.weight).toBe(240)
    expect(st.maxW).toBe(4800)
    expect(st.area).toBe(8)
  })

  it('leaves virtual (empty) cabinets out of weight, power and area', () => {
    const st = screenStats(screen({ virtual: [0, 1] }), [])
    expect(st.cabinets).toBe(30)
    expect(st.weight).toBe(225)
    expect(st.area).toBe(7.5)
    expect(st.pxW).toBe(1024) // the raster keeps its full size
  })

  it('cables in a serpentine from the bottom-left and skips virtual cells', () => {
    const s = screen({ cols: 3, rows: 2, virtual: [4] })
    // bottom row (r=1) left to right: 3,4,5 → 4 skipped; then top row right to left: 2,1,0
    expect(cableOrder(s)).toEqual([3, 5, 2, 1, 0])
  })

  it('fits as many cabinets per port as 655,360 px allows', () => {
    const s = screen({ cols: 20, rows: 4 })
    const pm = portMap(s, findPanel('p39-500'), 655360)
    expect(pm.perPort).toBe(40) // 655360 / (128*128)
    expect(pm.ports).toHaveLength(2)
    expect(pm.ports.flat()).toHaveLength(80)
  })

  it('sizes power circuits with an 80 % derate', () => {
    const { perCircuit, circuits } = circuitsFor(screen(), findPanel('p39-500'), 16)
    expect(perCircuit).toBe(Math.floor((230 * 16 * 0.8) / 150)) // 19
    expect(circuits.reduce((a, c) => a + c.cells.length, 0)).toBe(32)
  })

  it('balances circuits across the three phases', () => {
    const p = project({ screens: [screen({ cols: 24, rows: 9, panelId: 'p39-o' })] })
    const plan = powerPlan(p)
    expect(plan.imbalance).toBeLessThan(0.35)
    expect(new Set(plan.circuits.map((c) => c.phase)).size).toBe(3)
  })

  it('packs screens left to right in the pixel map', () => {
    const p = project({ screens: [screen({ id: 'b', x: 10 }), screen({ id: 'a', x: -10, cols: 4 })] })
    const pl = pixelLayout(p)
    expect(pl.items.map((i) => i.screen.id)).toEqual(['a', 'b'])
    expect(pl.width).toBe(512 + 1024)
    expect(pl.height).toBe(512)
  })

  it('keeps a flat screen centred and a curved screen symmetric', () => {
    const flat = screenColumns(screen({ x: 0, cols: 4 }), findPanel('p39-500'))
    expect(flat.map((c) => c.x)).toEqual([0.25, 0.75, 1.25, 1.75])
    const curved = screenColumns(screen({ x: 0, cols: 4, shape: 'concave', curveDeg: 10 }), findPanel('p39-500'))
    expect(curved[0].y).toBeCloseTo(curved[3].y, 6)
    expect(curved[0].y).not.toBeCloseTo(curved[1].y, 3)
  })
})

describe('Rigging', () => {
  const truss = { id: 't1', type: 'box30' as const, x1: 0, y1: 0, x2: 10, y2: 0, height: 8, legs: false }

  it('splits a centred load equally between two end hoists', () => {
    const p = project({
      truss: [truss],
      hoists: [
        { id: 'h1', x: 0, y: 0, capacity: 1000 },
        { id: 'h2', x: 10, y: 0, capacity: 1000 },
      ],
      screens: [screen({ x: 3, cols: 8 })], // 4 m wide, centred at x=5
    })
    const r = rigging(p)
    const [a, b] = r.supports
    expect(a.kg).toBeCloseTo(b.kg, 6)
    // truss 10 m × 7 kg/m + 240 kg screen
    expect(a.kg + b.kg).toBeCloseTo(70 + 240, 6)
  })

  it('uses the lever rule for off-centre loads', () => {
    const p = project({
      truss: [truss],
      hoists: [
        { id: 'h1', x: 0, y: 0, capacity: 1000 },
        { id: 'h2', x: 10, y: 0, capacity: 1000 },
      ],
      fixtures: [{ id: 'f', kind: 'moving-head', x: 2.5, y: 0, z: 8 }],
    })
    const r = rigging(p)
    const fixtureShare = (s: (typeof r.supports)[number]) => s.kg - 35 // remove half the truss self-weight
    expect(fixtureShare(r.supports[0])).toBeCloseTo(22 * 0.75, 6)
    expect(fixtureShare(r.supports[1])).toBeCloseTo(22 * 0.25, 6)
  })

  it('flags a truss with no hoists and no legs as unsupported', () => {
    const r = rigging(project({ truss: [truss] }))
    expect(r.trusses[0].supported).toBe(false)
    expect(r.supports.every((s) => s.capacity === 0)).toBe(true)
  })

  it('auto-rig keeps every point under 80 % and every span inside its rating', () => {
    const p = project({ truss: [{ ...truss, x2: 24 }], screens: [screen({ x: 2, cols: 40, rows: 10, panelId: 'p39-1000' })] })
    p.hoists = autoRig(p)
    expect(p.hoists.length).toBeGreaterThanOrEqual(2)
    const r = rigging(p)
    for (const s of r.supports) expect(s.kg).toBeLessThanOrEqual(s.capacity * 0.8 + 1e-6)
    for (const t of r.trusses) expect(t.spanLoad).toBeLessThanOrEqual(t.allowable + 1e-6)
    expect(p.hoists.every((h) => !h.id.startsWith('tmp-'))).toBe(true)
  })

  it('allows less load on longer spans and more on heavier truss', () => {
    expect(allowableLoad('box30', 12)).toBeLessThan(allowableLoad('box30', 6))
    expect(allowableLoad('box40', 12)).toBeGreaterThan(allowableLoad('box30', 12))
  })

  it('cuts a run into stock truss lengths that add up', () => {
    const pieces = stockPieces(13.5)
    expect(pieces.reduce((a, b) => a + b, 0)).toBeCloseTo(13.5, 6)
  })
})

describe('Ground plan', () => {
  it('estimates capacity from zone densities', () => {
    const g = [
      { id: 'a', kind: 'crowd' as const, x: 0, y: 0, w: 10, h: 10, rotation: 0, label: '' },
      { id: 'b', kind: 'vip' as const, x: 0, y: 0, w: 5, h: 4, rotation: 0, label: '' },
      { id: 'c', kind: 'food' as const, x: 0, y: 0, w: 50, h: 50, rotation: 0, label: '' },
    ]
    expect(capacity(g)).toBe(200 + 20)
  })

  it('totals pixels, weight and power across the project', () => {
    const p = project({ screens: [screen(), screen({ id: 's2', x: 6 })] })
    const t = totals(p)
    expect(t.pxW).toBe(2048)
    expect(t.cabinets).toBe(64)
    expect(t.powerKw).toBeCloseTo(9.6, 6)
  })
})
