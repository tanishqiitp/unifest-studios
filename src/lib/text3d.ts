// True 3D lettering. The font (Droid Sans Bold, Apache-2.0, ~330 KB) is fetched only the first time a sign is
// switched to 3D letters, then kept for the session. Until it arrives, or if it cannot load, the sign stays flat.
import * as THREE from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

export const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/fonts/droid/droid_sans_bold.typeface.json'

let font: Font | null = null
let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
const listeners = new Set<() => void>()

export function fontState() {
  return state
}
export function subscribeFont(cb: () => void) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}
export function requestFont() {
  if (state !== 'idle') return
  state = 'loading'
  new FontLoader().load(
    FONT_URL,
    (f) => {
      font = f
      state = 'ready'
      listeners.forEach((l) => l())
    },
    undefined,
    () => {
      state = 'failed'
      listeners.forEach((l) => l())
    },
  )
}

/**
 * Extruded letters fitted inside w × h (keeping their proportions), d deep, origin at the bottom centre.
 * Returns null while the font is not available.
 */
export function text3dGeometry(text: string, w: number, h: number, d: number, bevel = 0): THREE.BufferGeometry | null {
  if (!font) return null
  const g = new TextGeometry(text.trim() || ' ', {
    font,
    size: 1,
    depth: 1,
    curveSegments: 6,
    bevelEnabled: bevel > 0,
    bevelThickness: 0.06,
    bevelSize: 0.03,
    bevelSegments: 2,
  })
  g.computeBoundingBox()
  const b = g.boundingBox!
  const bw = Math.max(1e-3, b.max.x - b.min.x)
  const bh = Math.max(1e-3, b.max.y - b.min.y)
  const bd = Math.max(1e-3, b.max.z - b.min.z)
  const k = Math.min(w / bw, h / bh)
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  g.scale(k, k, Math.max(0.01, d) / bd)
  g.computeVertexNormals()
  return g
}
