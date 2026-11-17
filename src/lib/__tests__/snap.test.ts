import { describe, expect, it } from 'vitest'
import { alignBoxes, snapBox, snapRect } from '../snap'
import type { Box3 } from '../cad'

const box = (x0: number, w: number, y0 = 0, d = 1, z0 = 0, h = 1): Box3 => ({ x0, x1: x0 + w, y0, y1: y0 + d, z0, z1: z0 + h })

describe('smart snap', () => {
  it('snaps a left edge to a nearby right edge and shows a guide', () => {
    const s = snapRect({ x: 5.08, y: 3.3, w: 2, h: 1 }, [{ x: 0, y: 0, w: 5, h: 2 }], 0.2)
    expect(s.x).toBeCloseTo(5)
    expect(s.guides.some((g) => g.vertical && g.at === 5)).toBe(true)
  })
  it('lines up centres', () => {
    const s = snapRect({ x: 0.9, y: 10, w: 2, h: 1 }, [{ x: 0, y: 0, w: 4, h: 1 }], 0.2)
    expect(s.x + 1).toBeCloseTo(2)
  })
  it('falls back to the grid when nothing is near', () => {
    const s = snapRect({ x: 3.13, y: 7.4, w: 1, h: 1 }, [], 0.2)
    expect(s.guides).toHaveLength(0)
    expect(((s.x + 0.5) * 4) % 1).toBeCloseTo(0)
  })
  it('sits a 3D box on top of another', () => {
    const b = snapBox(box(0, 1, 0, 1, 1.15, 1), [box(0, 2, 0, 2, 0, 1.2)], 0.3)
    expect(b.z0).toBeCloseTo(1.2)
  })
})

describe('align and distribute', () => {
  it('lines up left edges to the reference', () => {
    const out = alignBoxes(box(2, 1), [box(5, 3), box(-1, 2)], 'x-min')
    expect(out.map((b) => b.x0)).toEqual([2, 2])
    expect(out[0].x1 - out[0].x0).toBe(3)
  })
  it('stacks on top and drops to the floor', () => {
    expect(alignBoxes(box(0, 1, 0, 1, 0, 2), [box(0, 1, 0, 1, 0.5, 1)], 'stack')[0].z0).toBe(2)
    expect(alignBoxes(box(0, 1), [box(0, 1, 0, 1, 3, 1)], 'floor')[0].z0).toBe(0)
  })
  it('spaces three or more evenly, keeping the outer ones', () => {
    const out = alignBoxes(box(0, 1), [box(0, 1), box(1.5, 1), box(9, 1)], 'dist-x')
    expect(out[0].x0).toBe(0)
    expect(out[2].x0).toBe(9)
    expect(out[1].x0 - out[0].x1).toBeCloseTo(out[2].x0 - out[1].x1)
  })
})
