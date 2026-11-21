// Frame and organic shapes for the Advanced list: geodesic dome, space-frame truss, helix and a low-poly tree.
// Each is built once per edit from a few primitives merged into one mesh (one draw call), origin at the bottom
// centre and sized w × h × d like every other part.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Part } from '../types'

const UP = new THREE.Vector3(0, 1, 0)

/** A round bar from a to b. */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 6) {
  const len = a.distanceTo(b)
  const g = new THREE.CylinderGeometry(r, r, Math.max(len, 1e-4), sides, 1, true)
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize())
  g.applyQuaternion(q)
  const m = a.clone().add(b).multiplyScalar(0.5)
  g.translate(m.x, m.y, m.z)
  return g
}
function node(p: THREE.Vector3, r: number) {
  return new THREE.SphereGeometry(r, 8, 6).translate(p.x, p.y, p.z)
}
const merge = (gs: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x)))
  gs.forEach((x) => x.dispose())
  return g
}

/** Geodesic dome: the struts of a subdivided icosahedron's upper half, with a ball at every joint. */
export function geodomeGeometry(p: Part) {
  const detail = Math.max(1, Math.min(4, Math.round(p.steps ?? 2)))
  const r = Math.max(0.005, p.thick ?? 0.04)
  const ico = new THREE.IcosahedronGeometry(1, detail)
  ico.deleteAttribute('normal')
  ico.deleteAttribute('uv')
  const g = mergeVertices(ico, 1e-4)
  const pos = g.getAttribute('position')
  const idx = g.getIndex()!
  const at = (i: number) => new THREE.Vector3(pos.getX(i) * (p.w / 2), pos.getY(i) * p.h, pos.getZ(i) * (p.d / 2))
  const keep = (i: number) => pos.getY(i) > -1e-3
  const edges = new Set<string>()
  const used = new Set<number>()
  const parts: THREE.BufferGeometry[] = []
  for (let t = 0; t < idx.count; t += 3) {
    const tri = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
    for (let k = 0; k < 3; k++) {
      const a = tri[k]
      const b = tri[(k + 1) % 3]
      if (!keep(a) || !keep(b)) continue
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (edges.has(key)) continue
      edges.add(key)
      used.add(a).add(b)
      parts.push(strut(at(a), at(b), r))
    }
  }
  for (const i of used) parts.push(node(at(i), r * 1.7))
  ico.dispose()
  g.dispose()
  return merge(parts)
}

/** Box truss (space frame): four chords along the length, square frames at every bay, zig-zag bracing on each face. */
export function trussGeometry(p: Part) {
  const bays = Math.max(1, Math.min(60, Math.round(p.steps ?? Math.max(1, Math.round(p.w)))))
  const r = Math.max(0.005, p.thick ?? 0.025)
  const x = (i: number) => -p.w / 2 + (i * p.w) / bays
  const corner = (i: number, c: number) => new THREE.Vector3(x(i), c & 2 ? p.h : 0, c & 1 ? p.d / 2 : -p.d / 2)
  const ring = [0, 1, 3, 2] // around the square
  const parts: THREE.BufferGeometry[] = []
  for (const c of ring) parts.push(strut(corner(0, c), corner(bays, c), r * 1.4))
  for (let i = 0; i <= bays; i++) for (let k = 0; k < 4; k++) parts.push(strut(corner(i, ring[k]), corner(i, ring[(k + 1) % 4]), r))
  for (let i = 0; i < bays; i++)
    for (let k = 0; k < 4; k++) {
      const a = ring[k]
      const b = ring[(k + 1) % 4]
      parts.push(i % 2 ? strut(corner(i, a), corner(i + 1, b), r * 0.8) : strut(corner(i, b), corner(i + 1, a), r * 0.8))
    }
  return merge(parts)
}

/** Helix: a tube coiling up (spiral lights, springs, twisting sculptures). `steps` = turns. */
export function helixGeometry(p: Part) {
  const turns = Math.max(0.25, Math.min(30, p.steps ?? 3))
  const n = Math.max(24, Math.round(turns * 40))
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const a = t * turns * Math.PI * 2
    return new THREE.Vector3((Math.cos(a) * p.w) / 2, t * p.h, (Math.sin(a) * p.d) / 2)
  })
  const r = Math.max(0.005, p.thick ?? 0.05)
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, r, 8, false)
}

/** Low-poly tree: a trunk and stacked cones (`steps` tiers, `seg` sides). Use Taper/Organic for variety. */
export function treeGeometry(p: Part) {
  const tiers = Math.max(1, Math.min(8, Math.round(p.steps ?? 3)))
  const sides = Math.max(3, Math.round(p.seg ?? 7))
  const trunkH = p.h * 0.22
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(p.w * 0.05, p.w * 0.07, trunkH, Math.min(sides, 8)).translate(0, trunkH / 2, 0)]
  const crown = p.h - trunkH * 0.6
  for (let i = 0; i < tiers; i++) {
    const s = 1 - i / (tiers + 0.6)
    const th = (crown / tiers) * 1.5
    const y0 = trunkH * 0.6 + (i * crown) / (tiers + 0.5)
    parts.push(new THREE.ConeGeometry(p.w * 0.5 * s, th, sides).translate(0, y0 + th / 2, 0))
  }
  const g = merge(parts)
  g.scale(1, 1, p.d / Math.max(p.w, 1e-3))
  return g
}
