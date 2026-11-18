import { describe, expect, it } from 'vitest'
import { alongCurve, curveGeometry, partCurve } from '../curves'
import { newPart } from '../parts'

describe('curves', () => {
  it('builds a tube and a standing ribbon wall', () => {
    const tube = newPart('path', [0, 0, 0])
    expect(curveGeometry(tube)!.getAttribute('position').count).toBeGreaterThan(100)
    const wall = newPart('path', [0, 0, 0], { form: 'ribbon', plane: 'top', h: 3 })
    const g = curveGeometry(wall)!
    g.computeBoundingBox()
    expect(g.boundingBox!.max.y).toBeCloseTo(3, 3)
    expect(curveGeometry({ ...tube, form: 'guide' })).toBeNull()
  })
  it('repeats copies evenly along the curve, turned to follow it', () => {
    const c = newPart('path', [0, 0, 0], { w: 10, h: 4 })
    const child = newPart('box', [0, 0, 0], { parent: c.id })
    const ins = alongCurve(c, child, 9)
    expect(ins).toHaveLength(9)
    const curve = partCurve(c)!
    expect(ins[4].pos[1]).toBeCloseTo(curve.getPointAt(0.5).y, 3)
    expect(Math.abs(ins[0].rotZ)).toBeGreaterThan(0.3) // leaning with the arch at its foot
  })
})

describe('ribbon ends', () => {
  it('an open ribbon ends at the curve end, not back at its start', () => {
    const wall = newPart('path', [0, 0, 0], { form: 'ribbon', plane: 'top', w: 10, d: 4, h: 2, profile: [[0, 0.2], [0.5, 0.85], [1, 0.2]] })
    const pos = curveGeometry(wall)!.getAttribute('position')
    const last = pos.count - 4
    expect(pos.getX(last)).toBeGreaterThan(4) // right end, not the left start
  })
})
