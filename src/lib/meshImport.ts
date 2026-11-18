// Imported 3D files (STL, OBJ, GLB…) used as model parts. The file stays in this browser's model store
// (the same one Decor uses); here it is merged into one mesh scaled to a 1 × 1 × 1 box with its base at 0,
// so the part's own size fields and the drag handles resize it like any other shape.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const cache = new Map<string, THREE.BufferGeometry | 'loading' | 'missing'>()
const subs = new Set<() => void>()
let version = 0
const bump = () => {
  version++
  subs.forEach((f) => f())
}
export const meshVersion = () => version
export function subscribeMesh(f: () => void) {
  subs.add(f)
  return () => void subs.delete(f)
}

/** Merge every mesh of a loaded file into one geometry (positions and normals), and measure it. */
export function toUnit(obj: THREE.Object3D, zUp = false): { geo: THREE.BufferGeometry; size: THREE.Vector3; triangles: number } {
  obj.updateMatrixWorld(true)
  const gs: THREE.BufferGeometry[] = []
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    g.applyMatrix4(m.matrixWorld)
    if (zUp) g.rotateX(-Math.PI / 2) // CAD and 3D-printing files stand on Z; the stage stands on Y
    if (!g.attributes.normal) g.computeVertexNormals()
    g.morphAttributes = {}
    g.clearGroups()
    gs.push(g)
  })
  if (!gs.length) throw new Error('No shapes found in that file')
  const has = (k: string) => gs.every((g) => !!g.attributes[k])
  if (!has('normal')) gs.forEach((g) => g.attributes.normal || g.computeVertexNormals())
  let geo = gs.length === 1 ? gs[0] : mergeGeometries(gs)
  if (gs.length > 1) gs.forEach((g) => g.dispose())
  if (!geo) throw new Error('Could not combine the shapes in that file')
  geo.computeBoundingBox()
  const b = geo.boundingBox!
  const size = b.getSize(new THREE.Vector3())
  const c = b.getCenter(new THREE.Vector3())
  geo.translate(-c.x, -b.min.y, -c.z)
  geo.scale(1 / Math.max(size.x, 1e-6), 1 / Math.max(size.y, 1e-6), 1 / Math.max(size.z, 1e-6))
  geo.computeBoundingSphere()
  geo = geo as THREE.BufferGeometry
  return { geo, size, triangles: geo.attributes.position.count / 3 }
}

export function rememberMesh(id: string, zUp: boolean, geo: THREE.BufferGeometry) {
  cache.set(`${id}|${zUp ? 1 : 0}`, geo)
  bump()
}

/** The unit-size shape for an imported file, or null while it loads (or if this browser doesn't have the file). */
export function unitMesh(id: string | undefined, zUp = false): THREE.BufferGeometry | null {
  if (!id) return null
  const key = `${id}|${zUp ? 1 : 0}`
  const c = cache.get(key)
  if (c instanceof THREE.BufferGeometry) return c
  if (!c) {
    cache.set(key, 'loading')
    import('../workspaces/Decor3D')
      .then((m) => m.loadModel(id))
      .then((obj) => cache.set(key, toUnit(obj, zUp).geo))
      .catch(() => cache.set(key, 'missing'))
      .finally(bump)
  }
  return null
}

/** Real-world size in metres: files from CAD and 3D printing are usually in millimetres. */
export function guessMetres(size: THREE.Vector3): { scale: number; unit: 'mm' | 'cm' | 'm' } {
  const big = Math.max(size.x, size.y, size.z)
  if (big > 60) return { scale: 0.001, unit: 'mm' }
  if (big > 25) return { scale: 0.01, unit: 'cm' }
  return { scale: 1, unit: 'm' }
}
