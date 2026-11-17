// Regression tests for issues found in review of the modelling tools.
import { describe, expect, it } from 'vitest'
import { buildAssembly, copies, newPart, partArea } from '../parts'
import { generateProject, TEMPLATES } from '../templates'
import { curveGeometry } from '../curves'
import { decodeSculpt, encodeSculpt } from '../sculpt'
import { stageFit } from '../fixes'

describe('review fixes', () => {
  it('scattered flowers are quoted by their real size, and copies are capped like the 3D view', () => {
    const parts = buildAssembly(generateProject(TEMPLATES[0]), 'mandap')
    const flowers = parts.find((x) => x.name === 'Canopy flowers')!
    // ~420 small flowers: well under 200 m² of surface (it was ~3,575 m² before the fix).
    expect(partArea(flowers)).toBeLessThan(200)
    expect(copies(newPart('box', [0, 0, 0], { array: { mode: 'linear', count: 1500, offset: [1, 0, 0] } }))).toBe(200)
    expect(copies(newPart('box', [0, 0, 0], { array: { mode: 'surface', count: 1500, offset: [0, 0, 0] } }))).toBe(1500)
  })

  it('ribbon walls are wound outwards (positive enclosed volume)', () => {
    const wall = newPart('path', [0, 0, 0], { form: 'ribbon', plane: 'top', w: 10, d: 4, h: 2, thick: 0.3, profile: [[0, 0.2], [0.5, 0.85], [1, 0.2]] })
    const g = curveGeometry(wall)!
    const pos = g.getAttribute('position')
    const idx = g.index!.array
    let vol = 0
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]].map((k) => [pos.getX(k), pos.getY(k), pos.getZ(k)])
      vol += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
    }
    expect(vol / 6).toBeGreaterThan(0)
  })

  it('deep relief on a thin panel survives saving', () => {
    const size: [number, number, number] = [3, 3, 0.1]
    const pos = new Float32Array([0, 1, 0.6, 1, 2, -0.4])
    const back = decodeSculpt(encodeSculpt(pos, size), size, 2)!
    expect(back[2]).toBeCloseTo(0.6, 3)
    expect(back[5]).toBeCloseTo(-0.4, 3)
  })

  it('old sculpt saves (without the v2 header) still open', () => {
    // Old format: Int16 of pos / size / 2.
    const q = new Int16Array([16383, 0, -16383])
    const old = btoa(String.fromCharCode(...new Uint8Array(q.buffer)))
    const back = decodeSculpt(old, [2, 2, 2], 1)!
    expect(back[0]).toBeCloseTo(2, 2)
    expect(back[2]).toBeCloseTo(-2, 2)
  })

  it('stage fit leaves delay screens far down the venue alone', () => {
    const p = generateProject(TEMPLATES[0])
    const delay = { ...p.screens[0], id: 'delay', name: 'DELAY', y: p.venue.l - 5, mirrorOf: undefined }
    p.screens.push(delay)
    const d = p.decks.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b))
    p.decks.push({ ...d, id: 'wide', x: d.x + d.w, w: 6 })
    const before = delay.x
    stageFit(p)?.apply(p)
    expect(p.screens.find((s) => s.id === 'delay')!.x).toBe(before)
  })
})
