import { describe, expect, it } from 'vitest'
import { applyDab, applyGrab, decodeSculpt, encodeSculpt, grabSet, neighbours, sculptBase } from '../sculpt'

const sphere = () => {
  const g = sculptBase('sphere', 'low')
  return { g, pos: new Float32Array(g.getAttribute('position').array), nrm: new Float32Array(g.getAttribute('normal').array) }
}
const top = (pos: Float32Array) => Math.max(...Array.from({ length: pos.length / 3 }, (_, i) => pos[i * 3 + 1]))

describe('sculpting', () => {
  it('base meshes are indexed and light enough for live brushing', () => {
    for (const b of ['sphere', 'panel', 'block'] as const) {
      const g = sculptBase(b, 'high')
      expect(g.index).not.toBeNull()
      expect(g.getAttribute('position').count).toBeLessThan(50000)
    }
  })
  it('stores a sculpt compactly and reads it back at a new size', () => {
    const { pos } = sphere()
    const data = encodeSculpt(pos, [1, 1, 1])
    expect(data.length).toBeLessThan(pos.length * 3)
    const back = decodeSculpt(data, [2, 1, 1], pos.length / 3)!
    expect(back[0]).toBeCloseTo(pos[0] * 2, 3)
    expect(back[1]).toBeCloseTo(pos[1], 3)
    expect(decodeSculpt(data, [1, 1, 1], 5)).toBeNull()
  })
  it('draw raises the surface, Ctrl carves it, and points far away do not move', () => {
    const { pos, nrm } = sphere()
    const before = top(pos)
    const far = pos.slice(0, 3)
    applyDab(pos, nrm, null, { brush: 'draw', centre: [0, 1, 0], radius: 0.3, strength: 1, invert: false })
    expect(top(pos)).toBeGreaterThan(before)
    const p2 = sphere()
    applyDab(p2.pos, p2.nrm, null, { brush: 'draw', centre: [0, 1, 0], radius: 0.3, strength: 1, invert: true })
    expect(top(p2.pos)).toBeLessThan(before)
    if (Math.hypot(far[0], far[1] - 1, far[2]) > 0.3) expect(Array.from(pos.slice(0, 3))).toEqual(Array.from(far))
  })
  it('smooth evens out a spike', () => {
    const { g, pos, nrm } = sphere()
    for (let k = 0; k < 4; k++) applyDab(pos, nrm, null, { brush: 'draw', centre: [0, 1, 0], radius: 0.15, strength: 1, invert: false })
    const spike = top(pos)
    const adj = neighbours(g.index!, pos.length / 3)
    for (let k = 0; k < 6; k++) applyDab(pos, nrm, adj, { brush: 'smooth', centre: [0, 1, 0], radius: 0.3, strength: 1, invert: false })
    expect(top(pos)).toBeLessThan(spike)
  })
  it('grab pulls an area with a soft edge', () => {
    const { pos } = sphere()
    const set = grabSet(pos, [0, 1, 0], 0.3)
    applyGrab(pos, set, [0, 0.5, 0])
    expect(top(pos)).toBeGreaterThan(1.4)
  })
})

describe('fast shading while brushing', () => {
  it('updating normals around the brush gives the same result as a full recompute', async () => {
    const { updateNormals } = await import('../sculpt')
    const g = sculptBase('sphere', 'low').clone()
    const pos = g.getAttribute('position').array as Float32Array
    const nrm = g.getAttribute('normal').array as Float32Array
    const moved = applyDab(pos, nrm, null, { brush: 'draw', centre: [0.2, 0.8, 0.3], radius: 0.25, strength: 1, invert: false })
    expect(moved.length).toBeGreaterThan(0)
    const touched = updateNormals(pos, nrm, g.index!, moved, neighbours(g.index!, pos.length / 3))
    expect(touched).toBeLessThan(pos.length / 3 / 2) // far less work than the whole mesh
    const fast = Float32Array.from(nrm)
    g.computeVertexNormals()
    const full = g.getAttribute('normal').array as Float32Array
    let worst = 0
    for (let i = 0; i < full.length; i++) worst = Math.max(worst, Math.abs(full[i] - fast[i]))
    expect(worst).toBeLessThan(1e-4)
  })
})
