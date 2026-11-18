import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { csgReady, cutGeometry, requestCsg, subscribeCsg } from './csg'

// Volume of a closed mesh (sum of signed tetrahedra).
function volume(g: THREE.BufferGeometry) {
  const p = (g.index ? g.toNonIndexed() : g).getAttribute('position')
  let v = 0
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i)
    b.fromBufferAttribute(p, i + 1)
    c.fromBufferAttribute(p, i + 2)
    v += a.dot(b.clone().cross(c)) / 6
  }
  return Math.abs(v)
}

describe('holes', () => {
  it('loads the cutter on demand and cuts one shape out of another', async () => {
    expect(cutGeometry(new THREE.BoxGeometry(), [])).toBeNull()
    await new Promise<void>((res) => {
      const off = subscribeCsg(() => (off(), res()))
      requestCsg()
    })
    expect(csgReady()).toBeTruthy()
    const solid = new THREE.BoxGeometry(2, 2, 2)
    const hole = new THREE.CylinderGeometry(0.5, 0.5, 4, 24)
    const out = cutGeometry(solid, [{ geo: hole, matrix: new THREE.Matrix4() }])!
    expect(out).toBeTruthy()
    // 8 m³ cube minus a 0.5 m radius bore 2 m long (≈1.57 m³)
    expect(volume(out)).toBeGreaterThan(6.2)
    expect(volume(out)).toBeLessThan(6.6)
    // A cutter off to the side leaves the shape whole.
    const far = cutGeometry(solid, [{ geo: hole, matrix: new THREE.Matrix4().makeTranslation(10, 0, 0) }])!
    expect(volume(far)).toBeCloseTo(8, 1)
  })
})
