// Fabric without physics: pleats are shaped waves, swags are scalloped dips along the top edge.
// One light mesh per drape, built once per edit.
import * as THREE from 'three'
import type { Part } from '../types'

/** A hanging drape p.w wide and p.h tall, pleats p.d deep, with p.steps folds and p.swags scallops on top. */
export function drapeGeometry(p: Part): THREE.BufferGeometry {
  const folds = Math.max(1, Math.min(80, Math.round(p.steps ?? 10)))
  const swags = Math.max(0, Math.min(20, Math.round(p.swags ?? 0)))
  const sag = Math.max(0, Math.min(0.9, p.sag ?? 0.25)) * p.h
  const nx = Math.min(640, folds * 10)
  const ny = 28
  const g = new THREE.PlaneGeometry(p.w, p.h, nx, ny)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const v = (pos.getY(i) + p.h / 2) / p.h // 0 at the hem, 1 at the top
    const u = x / p.w + 0.5 // 0..1 across
    // The top edge dips between hanging points; the fabric below follows it down to the hem.
    const local = swags ? (u * swags) % 1 : 0
    const dip = swags ? sag * Math.sin(Math.PI * local) : 0
    const top = p.h - dip
    const y = v * top
    // Pleats, a little fuller towards the hem, and gathered tighter where the swags hang.
    const gather = swags ? 1 - 0.5 * Math.sin(Math.PI * local) * v : 1
    const z = Math.sin(u * folds * Math.PI * 2) * (p.d / 2) * (0.55 + 0.45 * (1 - v)) * gather
    pos.setXYZ(i, x, y, z)
  }
  g.computeVertexNormals()
  return g
}
