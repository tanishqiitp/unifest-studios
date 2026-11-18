import { describe, expect, it } from 'vitest'
import { cutoutPaths, insidePoly } from '../cutouts'
import { slimArch } from '../parts'

const square: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]

describe('cut-outs', () => {
  it('lays out a grid of openings inside a panel', () => {
    expect(cutoutPaths({ shape: 'square', cols: 4, rows: 3, size: 0.6 }, square, 2)).toHaveLength(12)
  })
  it('keeps circles round on a wide panel', () => {
    const [c] = cutoutPaths({ shape: 'circle', cols: 1, rows: 1, size: 0.8 }, square, 4)
    const xs = c.map((p) => p[0])
    const ys = c.map((p) => p[1])
    expect((Math.max(...xs) - Math.min(...xs)) * 4).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 2)
  })
  it('drops openings that would cross the outline of an arch', () => {
    const arch = slimArch(0.1)
    const holes = cutoutPaths({ shape: 'square', cols: 6, rows: 6, size: 0.5 }, arch, 1)
    expect(holes.length).toBeLessThan(36)
    for (const h of holes) for (const p of h) expect(insidePoly(p, arch)).toBe(true)
  })
})
