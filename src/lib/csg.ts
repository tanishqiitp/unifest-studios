// Holes, like Tinkercad: a part marked as a cutter is cut out of the other parts in its group.
// The cutting library (three-bvh-csg) loads only once a project actually uses a cutter, so nobody else pays
// for it, and cuts are worked out once per edit (not per frame).
import * as THREE from 'three'

type Lib = typeof import('three-bvh-csg')
let lib: Lib | null = null
let loading = false
const subs = new Set<() => void>()

export const csgReady = () => lib
export function subscribeCsg(f: () => void) {
  subs.add(f)
  return () => void subs.delete(f)
}
export function requestCsg() {
  if (lib || loading) return
  loading = true
  import('three-bvh-csg')
    .then((m) => {
      lib = m
      subs.forEach((f) => f())
    })
    .catch(() => (loading = false)) // try again on the next request (flaky connection)
}

// Only positions and normals take part, so shapes built in different ways can be combined.
function prep(g: THREE.BufferGeometry) {
  const c = g.index ? g.toNonIndexed() : g.clone()
  for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k)
  if (!c.attributes.normal) c.computeVertexNormals()
  c.clearGroups()
  return c
}

/**
 * The solid with every cutter taken out. Each cutter comes with its matrix in the solid's own space.
 * Returns null while the library is loading or if a cut fails (the uncut shape is shown instead).
 */
export function cutGeometry(solid: THREE.BufferGeometry, cutters: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]): THREE.BufferGeometry | null {
  if (!lib || !cutters.length) return null
  const { Brush, Evaluator, SUBTRACTION } = lib
  const ev = new Evaluator()
  ev.attributes = ['position', 'normal']
  ev.useGroups = false
  let a = new Brush(prep(solid))
  a.updateMatrixWorld()
  try {
    for (const c of cutters) {
      const b = new Brush(prep(c.geo))
      c.matrix.decompose(b.position, b.quaternion, b.scale)
      b.updateMatrixWorld()
      const r = ev.evaluate(a, b, SUBTRACTION)
      a.geometry.dispose()
      b.geometry.dispose()
      a = r
    }
    a.geometry.computeBoundingSphere()
    a.geometry.computeBoundingBox()
    return a.geometry
  } catch {
    a.geometry.dispose()
    return null
  }
}
