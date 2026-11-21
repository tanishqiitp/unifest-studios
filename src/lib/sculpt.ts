// Brush sculpting for the Model workspace: base meshes, compact storage and the brush maths.
// Everything here works on plain typed arrays, so it is fast and testable without a browser.
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type SculptBase = 'sphere' | 'panel' | 'block'
export type SculptRes = 'low' | 'medium' | 'high'
export type Brush = 'draw' | 'inflate' | 'smooth' | 'grab' | 'flatten' | 'pinch' | 'crease' | 'twist' | 'scale' | 'snake' | 'mask' | 'paint'

// Points per sculpt object. High stays under ~45k points so a brush stroke stays smooth on laptops.
const SPHERE_DETAIL: Record<SculptRes, number> = { low: 24, medium: 40, high: 64 }
const PANEL_GRID: Record<SculptRes, number> = { low: 64, medium: 110, high: 170 }
const BLOCK_GRID: Record<SculptRes, number> = { low: 24, medium: 40, high: 60 }

const cache = new Map<string, THREE.BufferGeometry>()

/**
 * A unit-sized base mesh, origin at the bottom centre: x across -0.5..0.5, y up 0..1, z depth -0.5..0.5.
 * Indexed (shared points), so smoothing and normals work across the whole surface.
 */
export function sculptBase(base: SculptBase, res: SculptRes): THREE.BufferGeometry {
  const key = `${base}:${res}`
  const hit = cache.get(key)
  if (hit) return hit
  let g: THREE.BufferGeometry
  if (base === 'panel') {
    const n = PANEL_GRID[res]
    g = new THREE.PlaneGeometry(1, 1, n, n)
    g.translate(0, 0.5, 0)
  } else {
    const src = base === 'sphere' ? new THREE.IcosahedronGeometry(0.5, SPHERE_DETAIL[res]) : new THREE.BoxGeometry(1, 1, 1, BLOCK_GRID[res], BLOCK_GRID[res], BLOCK_GRID[res])
    src.deleteAttribute('normal')
    src.deleteAttribute('uv')
    g = mergeVertices(src, 1e-5)
    src.dispose()
    g.translate(0, 0.5, 0)
  }
  g.computeVertexNormals()
  cache.set(key, g)
  return g
}

// ---------------------------------------------------------------- storage

// Positions are stored relative to the part size, as 16-bit numbers, then base64: a medium sphere is
// ~100 KB instead of ~1 MB of JSON numbers. Each axis may reach twice the part's LARGEST side, so deep relief
// on a thin panel is kept (v2). Old saves (no prefix) used ±2× each axis's own size.
const RANGE = 2
export function encodeSculpt(pos: ArrayLike<number>, size: [number, number, number]): string {
  const big = Math.max(...size)
  const range = size.map((s) => (RANGE * big) / Math.max(1e-6, s)) // per axis, in units of that axis's size
  const q = new Int16Array(pos.length)
  for (let i = 0; i < pos.length; i++) {
    const k = i % 3
    q[i] = Math.max(-32767, Math.min(32767, Math.round((pos[i] / size[k] / range[k]) * 32767)))
  }
  const bytes = new Uint8Array(q.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `v2:${range.map((r) => +r.toFixed(6)).join(',')}:${btoa(s)}`
}

export function decodeSculpt(data: string, size: [number, number, number], count: number): Float32Array | null {
  try {
    let range = [RANGE, RANGE, RANGE]
    let body = data
    if (data.startsWith('v2:')) {
      const [, r, b] = data.split(':')
      range = r.split(',').map(Number)
      body = b
    }
    const bin = atob(body)
    if (bin.length !== count * 3 * 2 || range.some((r) => !(r > 0))) return null
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const q = new Int16Array(bytes.buffer)
    const out = new Float32Array(q.length)
    for (let i = 0; i < q.length; i++) out[i] = (q[i] / 32767) * range[i % 3] * size[i % 3]
    return out
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- neighbours (for smoothing)

const adjCache = new WeakMap<THREE.BufferAttribute, { start: Uint32Array; list: Uint32Array }>()
export function neighbours(index: THREE.BufferAttribute, count: number) {
  const hit = adjCache.get(index)
  if (hit) return hit
  const sets: Set<number>[] = Array.from({ length: count }, () => new Set())
  const idx = index.array
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i]
    const b = idx[i + 1]
    const c = idx[i + 2]
    sets[a].add(b).add(c)
    sets[b].add(a).add(c)
    sets[c].add(a).add(b)
  }
  const start = new Uint32Array(count + 1)
  for (let i = 0; i < count; i++) start[i + 1] = start[i] + sets[i].size
  const list = new Uint32Array(start[count])
  sets.forEach((s, i) => {
    let k = start[i]
    for (const n of s) list[k++] = n
  })
  const out = { start, list }
  adjCache.set(index, out)
  return out
}

// ---------------------------------------------------------------- brushes

export interface Dab {
  brush: Exclude<Brush, 'grab' | 'snake'>
  centre: [number, number, number] // local coordinates
  radius: number // local units
  strength: number // 0..1
  invert: boolean
  /** 0..1 per point: masked points (1) are protected from every brush except the mask brush itself. */
  mask?: Float32Array | null
  /** Paint: per-point RGB (0..1) to blend towards `color`. */
  colors?: Float32Array | null
  color?: [number, number, number]
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** Apply one brush dab to positions in place. Returns the indices of the points it moved. */
export function applyDab(pos: Float32Array, nrm: Float32Array, adj: { start: Uint32Array; list: Uint32Array } | null, d: Dab): number[] {
  const [cx, cy, cz] = d.centre
  const r2 = d.radius * d.radius
  const hits: number[] = []
  const w: number[] = []
  let ax = 0
  let ay = 0
  let az = 0
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const dx = pos[i * 3] - cx
    const dy = pos[i * 3 + 1] - cy
    const dz = pos[i * 3 + 2] - cz
    const q = dx * dx + dy * dy + dz * dz
    if (q > r2) continue
    let f = smoothstep(1 - Math.sqrt(q) / d.radius)
    if (d.mask && d.brush !== 'mask') f *= 1 - d.mask[i]
    if (f <= 0) continue
    hits.push(i)
    w.push(f)
    ax += nrm[i * 3] * f
    ay += nrm[i * 3 + 1] * f
    az += nrm[i * 3 + 2] * f
  }
  if (!hits.length) return hits
  const al = Math.hypot(ax, ay, az) || 1
  ax /= al
  ay /= al
  az /= al
  const sign = d.invert ? -1 : 1
  const step = d.radius * 0.12 * d.strength
  // Mask and paint change what the points carry, not where they are.
  if (d.brush === 'mask' && d.mask) {
    hits.forEach((i, k) => (d.mask![i] = Math.min(1, Math.max(0, d.mask![i] + w[k] * d.strength * 0.6 * sign))))
    return hits
  }
  if (d.brush === 'paint') {
    if (!d.colors || !d.color) return []
    const [r, g, b] = d.color
    hits.forEach((i, k) => {
      const t = Math.min(1, w[k] * d.strength * 0.6)
      const o = i * 3
      d.colors![o] += (r - d.colors![o]) * t
      d.colors![o + 1] += (g - d.colors![o + 1]) * t
      d.colors![o + 2] += (b - d.colors![o + 2]) * t
    })
    return hits
  }
  if (d.brush === 'smooth' && adj) {
    const next = new Float32Array(hits.length * 3)
    hits.forEach((i, k) => {
      let sx = 0
      let sy = 0
      let sz = 0
      const a = adj.start[i]
      const b = adj.start[i + 1]
      for (let j = a; j < b; j++) {
        const n = adj.list[j]
        sx += pos[n * 3]
        sy += pos[n * 3 + 1]
        sz += pos[n * 3 + 2]
      }
      const c = Math.max(1, b - a)
      const t = Math.min(1, w[k] * d.strength * 0.8)
      next[k * 3] = pos[i * 3] + (sx / c - pos[i * 3]) * t
      next[k * 3 + 1] = pos[i * 3 + 1] + (sy / c - pos[i * 3 + 1]) * t
      next[k * 3 + 2] = pos[i * 3 + 2] + (sz / c - pos[i * 3 + 2]) * t
    })
    hits.forEach((i, k) => pos.set(next.subarray(k * 3, k * 3 + 3), i * 3))
    return hits
  }
  hits.forEach((i, k) => {
    const f = w[k]
    const o = i * 3
    if (d.brush === 'draw') {
      pos[o] += ax * step * f * sign
      pos[o + 1] += ay * step * f * sign
      pos[o + 2] += az * step * f * sign
    } else if (d.brush === 'inflate') {
      pos[o] += nrm[o] * step * f * sign
      pos[o + 1] += nrm[o + 1] * step * f * sign
      pos[o + 2] += nrm[o + 2] * step * f * sign
    } else if (d.brush === 'flatten') {
      const dist = (pos[o] - cx) * ax + (pos[o + 1] - cy) * ay + (pos[o + 2] - cz) * az
      const t = Math.min(1, f * d.strength * 0.5)
      pos[o] -= ax * dist * t
      pos[o + 1] -= ay * dist * t
      pos[o + 2] -= az * dist * t
    } else if (d.brush === 'crease') {
      // After SculptGL's Crease (MIT, Stéphane Ginier): pinch towards the centre while cutting in along the
      // surface, so strokes leave a sharp groove (Ctrl: a sharp ridge).
      const t = Math.min(1, f * d.strength * 0.12)
      const cut = step * Math.pow(f, 5) * -sign * 1.5
      pos[o] += (cx - pos[o]) * t + ax * cut
      pos[o + 1] += (cy - pos[o + 1]) * t + ay * cut
      pos[o + 2] += (cz - pos[o + 2]) * t + az * cut
    } else if (d.brush === 'twist') {
      // Turn the area about the surface direction through the brush centre (Ctrl: the other way).
      const ang = f * d.strength * 0.12 * sign
      const px = pos[o] - cx
      const py = pos[o + 1] - cy
      const pz = pos[o + 2] - cz
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const dot = ax * px + ay * py + az * pz
      // Rodrigues' rotation about the unit axis (ax, ay, az).
      pos[o] = cx + px * c + (ay * pz - az * py) * s + ax * dot * (1 - c)
      pos[o + 1] = cy + py * c + (az * px - ax * pz) * s + ay * dot * (1 - c)
      pos[o + 2] = cz + pz * c + (ax * py - ay * px) * s + az * dot * (1 - c)
    } else if (d.brush === 'scale') {
      // After SculptGL's Local scale: grow the area around the brush (Ctrl: shrink it).
      const t = f * d.strength * 0.04 * sign
      pos[o] += (pos[o] - cx) * t
      pos[o + 1] += (pos[o + 1] - cy) * t
      pos[o + 2] += (pos[o + 2] - cz) * t
    } else if (d.brush === 'pinch') {
      const t = Math.min(1, f * d.strength * 0.15) * sign
      pos[o] += (cx - pos[o]) * t
      pos[o + 1] += (cy - pos[o + 1]) * t
      pos[o + 2] += (cz - pos[o + 2]) * t
    }
  })
  return hits
}

// ---------------------------------------------------------------- normals for just the brushed area

const faceCache = new WeakMap<THREE.BufferAttribute, { start: Uint32Array; list: Uint32Array }>()
/** For each point, the triangles that use it (built once per mesh). */
export function pointFaces(index: THREE.BufferAttribute, count: number) {
  const hit = faceCache.get(index)
  if (hit) return hit
  const idx = index.array
  const deg = new Uint32Array(count + 1)
  for (let i = 0; i < idx.length; i++) deg[idx[i] + 1]++
  for (let i = 0; i < count; i++) deg[i + 1] += deg[i]
  const list = new Uint32Array(idx.length)
  const fill = deg.slice(0, count)
  for (let f = 0; f < idx.length / 3; f++) for (let k = 0; k < 3; k++) list[fill[idx[f * 3 + k]]++] = f
  const out = { start: deg, list }
  faceCache.set(index, out)
  return out
}

/**
 * Recompute normals only around the moved points (and their neighbours), area-weighted like three.js.
 * Cost grows with the brush size, not the mesh size, so big meshes stay smooth while brushing.
 */
export function updateNormals(pos: Float32Array, nrm: Float32Array, index: THREE.BufferAttribute, moved: Iterable<number>, adj: { start: Uint32Array; list: Uint32Array }) {
  const faces = pointFaces(index, pos.length / 3)
  const idx = index.array
  const touched = new Set<number>()
  for (const v of moved) {
    touched.add(v)
    for (let j = adj.start[v]; j < adj.start[v + 1]; j++) touched.add(adj.list[j])
  }
  const fs = new Set<number>()
  for (const v of touched) for (let j = faces.start[v]; j < faces.start[v + 1]; j++) fs.add(faces.list[j])
  for (const v of touched) nrm[v * 3] = nrm[v * 3 + 1] = nrm[v * 3 + 2] = 0
  for (const f of fs) {
    const a = idx[f * 3] * 3
    const b = idx[f * 3 + 1] * 3
    const c = idx[f * 3 + 2] * 3
    const e1x = pos[b] - pos[a]
    const e1y = pos[b + 1] - pos[a + 1]
    const e1z = pos[b + 2] - pos[a + 2]
    const e2x = pos[c] - pos[a]
    const e2y = pos[c + 1] - pos[a + 1]
    const e2z = pos[c + 2] - pos[a + 2]
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    for (const v of [idx[f * 3], idx[f * 3 + 1], idx[f * 3 + 2]]) {
      if (!touched.has(v)) continue
      nrm[v * 3] += nx
      nrm[v * 3 + 1] += ny
      nrm[v * 3 + 2] += nz
    }
  }
  for (const v of touched) {
    const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1
    nrm[v * 3] /= l
    nrm[v * 3 + 1] /= l
    nrm[v * 3 + 2] /= l
  }
  return touched.size
}

/** Points and weights a grab stroke will move, taken once at the start of the stroke. */
export function grabSet(pos: Float32Array, centre: [number, number, number], radius: number, mask?: Float32Array | null) {
  const idx: number[] = []
  const w: number[] = []
  const start: number[] = []
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const q = Math.hypot(pos[i * 3] - centre[0], pos[i * 3 + 1] - centre[1], pos[i * 3 + 2] - centre[2])
    if (q > radius) continue
    idx.push(i)
    w.push(smoothstep(1 - q / radius) * (mask ? 1 - mask[i] : 1))
    start.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
  }
  return { idx, w, start }
}

export function applyGrab(pos: Float32Array, set: ReturnType<typeof grabSet>, delta: [number, number, number]) {
  set.idx.forEach((i, k) => {
    pos[i * 3] = set.start[k * 3] + delta[0] * set.w[k]
    pos[i * 3 + 1] = set.start[k * 3 + 1] + delta[1] * set.w[k]
    pos[i * 3 + 2] = set.start[k * 3 + 2] + delta[2] * set.w[k]
  })
}

/**
 * Snake hook (SculptGL's Drag): pull the points under the brush along with the mouse, picking up new points
 * at every step, so you can draw out horns, tentacles and drips.
 */
export function applySnake(pos: Float32Array, centre: [number, number, number], radius: number, delta: [number, number, number], mask?: Float32Array | null): number[] {
  const hits: number[] = []
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const q = Math.hypot(pos[i * 3] - centre[0], pos[i * 3 + 1] - centre[1], pos[i * 3 + 2] - centre[2])
    if (q > radius) continue
    const f = smoothstep(1 - q / radius) * (mask ? 1 - mask[i] : 1)
    if (f <= 0) continue
    pos[i * 3] += delta[0] * f
    pos[i * 3 + 1] += delta[1] * f
    pos[i * 3 + 2] += delta[2] * f
    hits.push(i)
  }
  return hits
}

/** Relax the whole shape a little (unmasked points only): softens a rough sculpt in one go. */
export function smoothAll(pos: Float32Array, adj: { start: Uint32Array; list: Uint32Array }, amount: number, mask?: Float32Array | null) {
  const n = pos.length / 3
  const next = new Float32Array(pos.length)
  for (let i = 0; i < n; i++) {
    let sx = 0
    let sy = 0
    let sz = 0
    const a = adj.start[i]
    const b = adj.start[i + 1]
    for (let j = a; j < b; j++) {
      const k = adj.list[j]
      sx += pos[k * 3]
      sy += pos[k * 3 + 1]
      sz += pos[k * 3 + 2]
    }
    const c = Math.max(1, b - a)
    const t = amount * (mask ? 1 - mask[i] : 1)
    next[i * 3] = pos[i * 3] + (sx / c - pos[i * 3]) * t
    next[i * 3 + 1] = pos[i * 3 + 1] + (sy / c - pos[i * 3 + 1]) * t
    next[i * 3 + 2] = pos[i * 3 + 2] + (sz / c - pos[i * 3 + 2]) * t
  }
  pos.set(next)
}

/** Painted colours, one RGB byte triple per point. */
export function encodePaint(cols: ArrayLike<number>): string {
  const b = new Uint8Array(cols.length)
  for (let i = 0; i < cols.length; i++) b[i] = Math.round(Math.min(1, Math.max(0, cols[i])) * 255)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return `p1:${btoa(s)}`
}
export function decodePaint(data: string, count: number): Float32Array | null {
  if (!data.startsWith('p1:')) return null
  try {
    const s = atob(data.slice(3))
    if (s.length !== count * 3) return null
    const out = new Float32Array(s.length)
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) / 255
    return out
  } catch {
    return null
  }
}
