import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { newPart } from './parts'
import { geodomeGeometry, helixGeometry, treeGeometry, trussGeometry } from './frames'
import { guessMetres, toUnit } from './meshImport'

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('advanced shapes', () => {
  it('builds each one at its size, standing on the floor', () => {
    for (const [kind, fn] of [
      ['geodome', geodomeGeometry],
      ['truss', trussGeometry],
      ['helix', helixGeometry],
      ['tree', treeGeometry],
    ] as const) {
      const p = newPart(kind, [0, 0, 0])
      const b = box(fn(p))
      expect(b.min.y).toBeGreaterThan(-0.2)
      expect(b.max.y).toBeCloseTo(p.h, 0)
      expect(b.max.x - b.min.x).toBeGreaterThan(p.w * 0.8)
      expect(b.max.x - b.min.x).toBeLessThan(p.w * 1.2)
    }
  })

  it('makes more struts with more detail', () => {
    const p = newPart('geodome', [0, 0, 0])
    const n = (steps: number) => geodomeGeometry({ ...p, steps }).attributes.position.count
    expect(n(3)).toBeGreaterThan(n(1) * 3)
  })

  it('turns an imported file into a unit shape and guesses its units', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(300, 100, 50).translate(10, 20, 30))
    const u = toUnit(mesh)
    const b = box(u.geo)
    expect(b.min.y).toBeCloseTo(0)
    expect(b.max.y).toBeCloseTo(1)
    expect(b.max.x - b.min.x).toBeCloseTo(1)
    expect(u.size.x).toBeCloseTo(300)
    expect(guessMetres(u.size).unit).toBe('mm')
    // Z-up files (STL) are stood upright: their Z becomes the height.
    expect(toUnit(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3)), true).size.y).toBeCloseTo(3)
  })
})
