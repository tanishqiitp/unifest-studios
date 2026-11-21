import { describe, expect, it } from 'vitest'
import { applyDab, applySnake, decodePaint, encodePaint, neighbours, sculptBase, smoothAll } from './sculpt'

const ball = () => {
  const g = sculptBase('sphere', 'low').clone()
  g.setIndex(sculptBase('sphere', 'low').getIndex())
  return { pos: (g.getAttribute('position').array as Float32Array).slice(), nrm: (g.getAttribute('normal').array as Float32Array).slice(), g }
}
// The top of the unit ball (sculpt bases are 1 across, standing on 0).
const top = (pos: Float32Array) => {
  let best = 0
  for (let i = 0; i < pos.length / 3; i++) if (pos[i * 3 + 1] > pos[best * 3 + 1]) best = i
  return [pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]] as [number, number, number]
}

describe('SculptGL-style brushes', () => {
  it('masked points do not move', () => {
    const { pos, nrm } = ball()
    const c = top(pos)
    const mask = new Float32Array(pos.length / 3).fill(1)
    const before = pos.slice()
    applyDab(pos, nrm, null, { brush: 'draw', centre: c, radius: 0.3, strength: 1, invert: false, mask })
    expect(pos).toEqual(before)
  })

  it('the mask brush paints protection, Ctrl erases it', () => {
    const { pos, nrm } = ball()
    const mask = new Float32Array(pos.length / 3)
    const hits = applyDab(pos, nrm, null, { brush: 'mask', centre: top(pos), radius: 0.3, strength: 1, invert: false, mask })
    expect(hits.length).toBeGreaterThan(0)
    expect(Math.max(...mask)).toBeGreaterThan(0.5)
    applyDab(pos, nrm, null, { brush: 'mask', centre: top(pos), radius: 0.3, strength: 1, invert: true, mask })
    applyDab(pos, nrm, null, { brush: 'mask', centre: top(pos), radius: 0.3, strength: 1, invert: true, mask })
    expect(Math.max(...mask)).toBeLessThan(0.01)
  })

  it('crease cuts in, scale grows, twist keeps distance from the centre', () => {
    const { pos, nrm } = ball()
    const c = top(pos)
    const y0 = c[1]
    applyDab(pos, nrm, null, { brush: 'crease', centre: c, radius: 0.3, strength: 1, invert: false })
    expect(top(pos)[1]).toBeLessThan(y0)

    const b = ball()
    const r0 = Math.hypot(b.pos[0] - 0, b.pos[2] - 0)
    applyDab(b.pos, b.nrm, null, { brush: 'scale', centre: [0, 1, 0], radius: 2, strength: 1, invert: false })
    expect(Math.hypot(b.pos[0], b.pos[2])).toBeGreaterThan(r0)

    const t = ball()
    const ct = top(t.pos)
    const dist = (p: Float32Array, i: number) => Math.hypot(p[i * 3] - ct[0], p[i * 3 + 1] - ct[1], p[i * 3 + 2] - ct[2])
    const d0 = Array.from({ length: 50 }, (_, i) => dist(t.pos, i))
    const moved = applyDab(t.pos, t.nrm, null, { brush: 'twist', centre: ct, radius: 0.4, strength: 1, invert: false })
    expect(moved.length).toBeGreaterThan(0)
    d0.forEach((d, i) => expect(dist(t.pos, i)).toBeCloseTo(d, 4))
  })

  it('snake hook pulls the surface out along the stroke', () => {
    const { pos } = ball()
    const c = top(pos)
    let at = c
    for (let k = 0; k < 10; k++) {
      applySnake(pos, at, 0.25, [0, 0.1, 0])
      at = [at[0], at[1] + 0.1, at[2]]
    }
    expect(top(pos)[1]).toBeGreaterThan(c[1] + 0.5)
  })

  it('paint blends towards the colour and survives saving', () => {
    const { pos, nrm } = ball()
    const colors = new Float32Array(pos.length).fill(1)
    applyDab(pos, nrm, null, { brush: 'paint', centre: top(pos), radius: 0.3, strength: 1, invert: false, colors, color: [1, 0, 0] })
    expect(Math.min(...colors)).toBeLessThan(0.8)
    const back = decodePaint(encodePaint(colors), pos.length / 3)!
    back.forEach((v, i) => expect(Math.abs(v - colors[i])).toBeLessThan(0.005))
  })

  it('relax smooths the whole shape', () => {
    const { pos, g } = ball()
    pos[1] += 0.5 // a spike
    const y = pos[1]
    smoothAll(pos, neighbours(g.index!, pos.length / 3), 0.5)
    expect(pos[1]).toBeLessThan(y)
  })
})
