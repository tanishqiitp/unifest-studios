// Curves: a smooth line through points you place, turned into a tube or a ribbon, or used as a guide to
// repeat other parts along. Built once per edit, so they cost nothing while the scene is still.
import * as THREE from 'three'
import type { Part } from '../types'

export const CURVE_PRESETS: Record<string, [number, number][]> = {
  Arch: [[0, 0], [0.12, 0.62], [0.5, 1], [0.88, 0.62], [1, 0]],
  Wave: [[0, 0.5], [0.2, 0.85], [0.4, 0.2], [0.6, 0.85], [0.8, 0.2], [1, 0.5]],
  'S-curve': [[0, 0.1], [0.3, 0.1], [0.5, 0.5], [0.7, 0.9], [1, 0.9]],
  Spiral: Array.from({ length: 14 }, (_, i) => {
    const a = i * 0.9
    const r = 0.08 + i * 0.03
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as [number, number]
  }),
  'Half circle': Array.from({ length: 9 }, (_, i) => [0.5 + Math.cos(Math.PI - (i * Math.PI) / 8) * 0.5, Math.sin(Math.PI - (i * Math.PI) / 8)] as [number, number]),
}

/** The part's curve in its own three.js space (x across, y up, z depth), origin at the bottom centre. */
export function partCurve(p: Part): THREE.CatmullRomCurve3 | null {
  const pts = p.profile ?? []
  if (pts.length < 2) return null
  const top = p.plane === 'top'
  const v = pts.map(([u, w]) => (top ? new THREE.Vector3((u - 0.5) * p.w, 0, (0.5 - w) * p.d) : new THREE.Vector3((u - 0.5) * p.w, w * p.h, 0)))
  return new THREE.CatmullRomCurve3(v, !!p.closed, 'centripetal')
}

/** Tube or ribbon along the curve. A ribbon drawn in the top view stands up as a curved wall p.h tall. */
export function curveGeometry(p: Part): THREE.BufferGeometry | null {
  const c = partCurve(p)
  if (!c || p.form === 'guide') return null
  const t = Math.max(0.01, p.thick ?? 0.15)
  const n = Math.min(400, Math.max(32, Math.round(c.getLength() * 8)))
  if (p.form !== 'ribbon') return new THREE.TubeGeometry(c, n, t, 12, !!p.closed)
  // Ribbon: a band with real thickness. Its width runs along the depth (side view) or height (top view).
  const top = p.plane === 'top'
  const side = top ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
  const width = top ? p.h : p.d
  const pos: number[] = []
  const idx: number[] = []
  const steps = p.closed ? n : n + 1
  for (let i = 0; i < steps; i++) {
    const u = i / n
    // u runs 0..1 (open: the last ring is the true end; closed: it stops one step short and wraps by index).
    const pt = c.getPointAt(Math.min(1, u))
    const tan = c.getTangentAt(Math.min(1, u))
    const nrm = new THREE.Vector3().crossVectors(tan, side).normalize()
    const base = top ? pt.clone() : pt.clone().addScaledVector(side, -width / 2)
    for (const [a, b] of [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, 1],
    ]) {
      const q = base.clone().addScaledVector(side, a * width).addScaledVector(nrm, (b * t) / 2)
      pos.push(q.x, q.y, q.z)
    }
  }
  const ring = (i: number) => (i % steps) * 4
  const segs = p.closed ? steps : steps - 1
  for (let i = 0; i < segs; i++) {
    const a = ring(i)
    const b = ring(i + 1)
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4
      idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2)
    }
  }
  if (!p.closed) {
    const e = ring(steps - 1)
    idx.push(0, 2, 1, 0, 3, 2, e, e + 1, e + 2, e, e + 2, e + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * Where copies go when a part is repeated along its parent curve: positions relative to the part's own spot,
 * and a turn so each copy follows the line (top-view curves turn about the vertical; side-view ones lean).
 */
export function alongCurve(curve: Part, child: Part, count: number): { pos: [number, number, number]; rotY: number; rotZ: number }[] {
  const c = partCurve(curve)
  if (!c) return [{ pos: [0, 0, 0], rotY: 0, rotZ: 0 }]
  const n = Math.max(1, Math.min(200, Math.round(count)))
  const own = new THREE.Vector3(child.pos[0], child.pos[2], child.pos[1])
  return Array.from({ length: n }, (_, i) => {
    const u = curve.closed ? i / n : n === 1 ? 0.5 : i / (n - 1)
    const pt = c.getPointAt(u).sub(own)
    const tan = c.getTangentAt(u)
    const top = curve.plane === 'top'
    return { pos: [pt.x, pt.y, pt.z], rotY: top ? Math.atan2(-tan.z, tan.x) : 0, rotZ: top ? 0 : Math.atan2(tan.y, tan.x) }
  })
}
