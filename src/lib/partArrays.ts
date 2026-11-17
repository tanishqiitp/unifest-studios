// Where each copy of an arrayed part goes (three.js axes: x across, y up, z depth).
import type { Part } from '../types'

const rad = (d: number) => (d * Math.PI) / 180
const toThree = (v: [number, number, number]): [number, number, number] => [v[0], v[2], v[1]]

type Ins = { pos: [number, number, number]; rotY: number; sy: number; flip: boolean; alt: boolean }
export function instances(p: Part): Ins[] {
  const a = p.array
  if (!a || a.count <= 1) return [{ pos: [0, 0, 0], rotY: 0, sy: 1, flip: false, alt: false }]
  const n = Math.min(200, Math.max(1, Math.round(a.count)))
  const turn = rad(a.turn ?? 0)
  // Height grows by `grow` per step away from the first copy (or from the centre when symmetric).
  const sy = (k: number) => Math.max(0.05, 1 + (a.grow ?? 0) * k)
  if (a.mode === 'radial') {
    const sweep = rad(a.angle ?? 360)
    const step = Math.abs(sweep - Math.PI * 2) < 1e-3 ? sweep / n : sweep / Math.max(1, n - 1)
    return Array.from({ length: n }, (_, i) => ({ pos: [0, 0, 0], rotY: i * step + turn * i, sy: sy(i), flip: false, alt: i % 2 === 1 }))
  }
  if (a.symmetric) {
    // Copies on both sides: 0, +1, -1, +2, -2… with the far side mirrored.
    return Array.from({ length: n }, (_, i) => {
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1)
      const m = Math.abs(k)
      return { pos: toThree([a.offset[0] * k, a.offset[1] * k, a.offset[2] * k]), rotY: turn * k, sy: sy(m), flip: k < 0, alt: m % 2 === 1 }
    })
  }
  return Array.from({ length: n }, (_, i) => ({ pos: toThree([a.offset[0] * i, a.offset[1] * i, a.offset[2] * i]), rotY: turn * i, sy: sy(i), flip: false, alt: i % 2 === 1 }))
}

