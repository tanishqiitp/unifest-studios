import { describe, expect, it } from 'vitest'
import { applyCage, CAGE_PRESETS, cageOffset, EMPTY_CAGE, hasCage } from '../cage'
import { drapeGeometry } from '../drape'
import { newPart } from '../parts'

describe('cage deform', () => {
  it('does nothing with an empty cage and moves the middle for a bulge', () => {
    expect(hasCage({ front: EMPTY_CAGE })).toBe(false)
    expect(cageOffset(EMPTY_CAGE, 0.3, 0.7)).toEqual([0, 0])
    const pos = new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 1, 0])
    applyCage(pos, [-0.5, 0, -0.5], [0.5, 1, 0.5], [1, 1, 1], { front: CAGE_PRESETS.Bulge.front })
    expect(pos[0]).toBeLessThan(-0.5) // left middle pushed out
    expect(pos[3]).toBeGreaterThan(0.5) // right middle pushed out
    expect(pos[7]).toBeCloseTo(0) // bottom stays on the ground
  })
  it('a lean moves the top more than the bottom', () => {
    const pos = new Float32Array([0, 0, 0, 0, 1, 0])
    applyCage(pos, [-0.5, 0, -0.5], [0.5, 1, 0.5], [2, 3, 1], { front: CAGE_PRESETS.Lean.front })
    expect(pos[3]).toBeGreaterThan(pos[0])
  })
})

describe('drapes', () => {
  it('hangs from the top to the floor, with swags dipping the top edge', () => {
    const flat = drapeGeometry(newPart('drape', [0, 0, 0], { w: 6, h: 4, d: 0.4, swags: 0 }))
    flat.computeBoundingBox()
    expect(flat.boundingBox!.min.y).toBeCloseTo(0, 5)
    expect(flat.boundingBox!.max.y).toBeCloseTo(4, 5)
    const sw = drapeGeometry(newPart('drape', [0, 0, 0], { w: 6, h: 4, d: 0.4, swags: 3, sag: 0.3 }))
    const pos = sw.getAttribute('position')
    // The top edge dips mid-swag but reaches full height where the swags meet.
    let lowestTop = Infinity
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 2.5) lowestTop = Math.min(lowestTop, pos.getY(i))
    expect(lowestTop).toBeLessThan(4)
  })
})
