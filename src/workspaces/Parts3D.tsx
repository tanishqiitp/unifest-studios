import { instances } from '../lib/partArrays'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Part, PartMat, Project, Vec3 } from '../types'
import { childrenOf } from '../lib/parts'
import { useSetContent } from './Set3D'

// Venue (x across, y depth, z up) to three.js (x, y up, z depth). Rotations are relabelled the same way.
export const toThree = (v: Vec3): [number, number, number] => [v[0], v[2], v[1]]
export const rotToThree = (r: Vec3): [number, number, number] => [THREE.MathUtils.degToRad(r[0]), THREE.MathUtils.degToRad(r[2]), THREE.MathUtils.degToRad(r[1])]
export const fromThree = (v: THREE.Vector3): Vec3 => [v.x, v.z, v.y]
export const rotFromThree = (e: THREE.Euler): Vec3 => [THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.z), THREE.MathUtils.radToDeg(e.y)]

export type Shading = 'solid' | 'material' | 'wire' | 'xray'

// ---------- geometry (origin at the bottom centre; x across, y up, z depth) ----------

// Sculpting, applied on build so every value stays editable: an organic surface (smooth bumps pushed along the
// surface normal), taper and twist along the height, and bend, which curls the width into an arc.
const tween = (a: number, b: number, t: number) => a + (b - a) * t
// Smooth repeatable 3D noise from layered sines: no dependency, same result for the same seed.
function ripple(x: number, y: number, z: number, s: number) {
  return (
    Math.sin(1.7 * x + s) * Math.sin(1.3 * y + 2.1 * s) * Math.sin(1.9 * z + 0.7 * s) +
    0.5 * Math.sin(3.1 * x - 1.3 * s) * Math.sin(2.7 * y + 0.4 * s) * Math.sin(3.3 * z + 1.9 * s) +
    0.25 * Math.sin(6.3 * x + 0.9 * s) * Math.sin(5.9 * y - 1.7 * s) * Math.sin(6.7 * z + 2.3 * s)
  )
}

export function partGeometry(p: Part): THREE.BufferGeometry | null {
  const tapered = p.taper !== undefined && Math.abs(p.taper - 1) > 1e-3
  const organic = (p.organic ?? 0) > 0
  const bend = Math.abs(p.bend ?? 0) > 0.5
  const g = baseGeometry(p, { taper: tapered || !!p.twist, organic, bend })
  if (!g || !(tapered || p.twist || organic || bend)) return g
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const box = new THREE.Box3().setFromBufferAttribute(pos)
  const y0 = box.min.y
  const span = Math.max(1e-6, box.max.y - y0)
  if (organic) {
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute
    const size = Math.max(0.05, Math.min(p.w, p.h, p.d))
    const amp = (p.organic ?? 0) * size * 0.5
    const f = 2.4 / Math.max(0.2, Math.max(p.w, p.h, p.d) * 0.35)
    const seed = p.seed ?? 1
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const n = ripple(x * f, y * f, z * f, seed) * amp
      pos.setXYZ(i, x + nrm.getX(i) * n, y + nrm.getY(i) * n, z + nrm.getZ(i) * n)
    }
  }
  if (tapered || p.twist) {
    const taper = p.taper ?? 1
    const tw = THREE.MathUtils.degToRad(p.twist ?? 0)
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - y0) / span
      const k = tween(1, taper, t)
      const a = tw * t
      const x = pos.getX(i) * k
      const z = pos.getZ(i) * k
      pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), pos.getY(i), x * Math.sin(a) + z * Math.cos(a))
    }
  }
  if (bend) {
    // Curl the width around a centre below the part: 180° turns a flat ribbon into a standing arch.
    const total = THREE.MathUtils.degToRad(Math.max(-359, Math.min(359, p.bend ?? 0)))
    const w = Math.max(1e-6, box.max.x - box.min.x)
    const R = w / Math.abs(total)
    const sign = Math.sign(total)
    for (let i = 0; i < pos.count; i++) {
      const th = ((pos.getX(i) - (box.min.x + box.max.x) / 2) / w) * total
      const r = R + sign * (pos.getY(i) - y0)
      pos.setXYZ(i, Math.sin(th) * r * sign, y0 + sign * (Math.cos(th) * r - R), pos.getZ(i))
    }
    // Stand the curled shape back on the ground.
    const nb = new THREE.Box3().setFromBufferAttribute(pos)
    g.translate(0, -nb.min.y, 0)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

function baseGeometry(p: Part, need: { taper: boolean; organic: boolean; bend: boolean } = { taper: false, organic: false, bend: false }): THREE.BufferGeometry | null {
  // Shapes that will be sculpted need enough points to bend smoothly.
  const sx = need.bend ? 96 : need.organic ? 24 : need.taper ? 2 : 1
  const sy = need.organic ? 24 : need.taper ? 16 : need.bend ? 2 : 1
  const sz = need.organic ? 12 : need.taper ? 2 : 1
  const { w, h, d } = p
  const seg = Math.max(3, Math.round(p.seg ?? 32))
  let g: THREE.BufferGeometry
  switch (p.kind) {
    case 'group':
      return null
    case 'box':
      g = p.bevel && p.bevel > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(p.bevel, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d, sx, sy, sz)
      g.translate(0, h / 2, 0)
      return g
    case 'cylinder':
      g = new THREE.CylinderGeometry(w / 2, w / 2, h, seg)
      g.scale(1, 1, d / Math.max(w, 0.001))
      g.translate(0, h / 2, 0)
      return g
    case 'cone':
      g = new THREE.ConeGeometry(w / 2, h, seg)
      g.scale(1, 1, d / Math.max(w, 0.001))
      g.translate(0, h / 2, 0)
      return g
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, seg, Math.max(4, Math.round(seg / 2)))
      g.scale(w, h, d)
      g.translate(0, h / 2, 0)
      return g
    case 'dome':
      g = new THREE.SphereGeometry(0.5, seg, Math.max(4, Math.round(seg / 2)), 0, Math.PI * 2, 0, (Math.PI / 2) * Math.min(1, (p.arc ?? 180) / 180))
      g.scale(w, h * 2, d)
      return g
    case 'torus': {
      const t = Math.max(0.01, p.thick ?? 0.25)
      g = new THREE.TorusGeometry(Math.max(0.02, w / 2 - t), t, 16, Math.max(24, seg * 2), THREE.MathUtils.degToRad(Math.max(1, Math.min(360, p.arc ?? 360))))
      g.scale(1, h / Math.max(w, 0.001), 1)
      g.translate(0, h / 2, 0)
      return g
    }
    case 'plane':
      g = new THREE.PlaneGeometry(w, d)
      g.rotateX(-Math.PI / 2)
      g.translate(0, h, 0)
      return g
    case 'text':
      g = new THREE.PlaneGeometry(w, h)
      g.translate(0, h / 2, 0)
      return g
    case 'stairs': {
      const n = Math.max(1, Math.round(p.steps ?? 6))
      const rise = h / n
      const run = d / n
      // Lowest step at the front (towards the audience), highest at the back.
      const steps = Array.from({ length: n }, (_, i) => {
        const b = new THREE.BoxGeometry(w, rise * (i + 1), run)
        b.translate(0, (rise * (i + 1)) / 2, d / 2 - run * (i + 0.5))
        return b
      })
      g = mergeGeometries(steps) ?? new THREE.BoxGeometry(w, h, d)
      steps.forEach((s) => s.dispose())
      return g
    }
    case 'ramp': {
      const s = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(-d / 2, h)])
      g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false })
      g.rotateY(-Math.PI / 2)
      g.translate(w / 2, 0, 0)
      return g
    }
    case 'lathe': {
      const pts = (p.profile ?? []).map(([u, v]) => new THREE.Vector2(Math.max(0, u) * (w / 2), v * h))
      if (pts.length < 2) return null
      g = new THREE.LatheGeometry(pts, seg)
      g.scale(1, 1, d / Math.max(w, 0.001))
      return g
    }
    case 'extrude': {
      const pts = (p.profile ?? []).map(([u, v]) => new THREE.Vector2((u - 0.5) * w, v * h))
      if (pts.length < 3) return null
      const bev = Math.max(0, p.bevel ?? 0)
      g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 12 })
      g.translate(0, 0, -d / 2)
      return g
    }
  }
}

// ---------- materials ----------

function textTexture(text: string, w: number, h: number) {
  const c = document.createElement('canvas')
  const ar = Math.max(0.1, w / Math.max(h, 0.01))
  c.height = 256
  c.width = Math.min(4096, Math.round(256 * ar))
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = 200
  g.font = `800 ${size}px Inter, system-ui, sans-serif`
  while (size > 20 && g.measureText(text).width > c.width * 0.95) g.font = `800 ${(size -= 8)}px Inter, system-ui, sans-serif`
  g.fillText(text, c.width / 2, c.height / 2 + 8)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function useMap(src?: string) {
  const [t, setT] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!src) return setT(null)
    const tex = new THREE.TextureLoader().load(src)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    setT(tex)
    return () => tex.dispose()
  }, [src])
  return t
}

function usePartMaterial(p: Part, shading: Shading, led: THREE.Texture | null, mirrored: boolean) {
  const m: PartMat = p.mat
  const map = useMap(m.map)
  const text = useMemo(() => (p.kind === 'text' ? textTexture(p.text || ' ', p.w, p.h) : null), [p.kind, p.text, p.w, p.h])
  useEffect(() => () => text?.dispose(), [text])
  const mat = useMemo(() => {
    const solid = shading === 'solid'
    const tex = solid ? null : m.led ? led : map
    const mt = new THREE.MeshStandardMaterial({
      color: m.led && !solid ? '#ffffff' : m.color,
      metalness: solid ? 0 : m.metal,
      roughness: solid ? 0.7 : m.rough,
      map: text ?? tex ?? null,
      alphaMap: null,
      emissive: m.led && !solid ? '#ffffff' : m.color,
      emissiveMap: (m.led && !solid ? led : null) ?? (text && !solid ? text : null),
      emissiveIntensity: solid ? 0 : m.led ? 1.1 : (m.glow ?? 0),
      transparent: shading === 'xray' || (m.opacity ?? 1) < 1 || !!text,
      opacity: shading === 'xray' ? 0.35 : (m.opacity ?? 1),
      alphaTest: text ? 0.4 : 0,
      wireframe: shading === 'wire' || !!m.wire,
      side: mirrored || p.kind === 'plane' || p.kind === 'text' || p.kind === 'lathe' || (p.kind === 'torus' && (p.arc ?? 360) < 360) ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: shading !== 'xray',
    })
    if (text) mt.color.set(m.color)
    return mt
  }, [m.color, m.metal, m.rough, m.glow, m.opacity, m.led, m.wire, shading, led, map, text, mirrored, p.kind, p.arc])
  useEffect(() => () => mat.dispose(), [mat])
  return mat
}

// ---------- scene ----------

interface Ctx {
  all: Part[]
  shading: Shading
  led: THREE.Texture | null
  onPick?: (id: string, e: ThreeEvent<MouseEvent>) => void
  register?: (id: string, o: THREE.Object3D | null) => void
  selected?: Set<string>
  shadows: boolean
}
const PartsCtx = createContext<Ctx | null>(null)

export function PartsScene({
  project,
  shading = 'material',
  onPick,
  register,
  selected,
  shadows = false,
}: {
  project: Project
  shading?: Shading
  onPick?: Ctx['onPick']
  register?: Ctx['register']
  selected?: Set<string>
  shadows?: boolean
}) {
  const all = project.parts ?? []
  const led = useSetContent(all.some((p) => p.mat.led) ? project.setContent : undefined)
  const ctx = useMemo<Ctx>(() => ({ all, shading, led, onPick, register, selected, shadows }), [all, shading, led, onPick, register, selected, shadows])
  if (!all.length) return null
  const roots = childrenOf(all, undefined)
  const cx = project.venue.w / 2
  return (
    <PartsCtx.Provider value={ctx}>
      {roots.map((p) => (
        <group key={p.id}>
          <PartNode p={p} root />
          {p.mirror && !p.hidden && (
            <group position={[2 * cx, 0, 0]} scale={[-1, 1, 1]}>
              <PartNode p={p} mirrored />
            </group>
          )}
        </group>
      ))}
    </PartsCtx.Provider>
  )
}

function PartNode({ p, mirrored, root }: { p: Part; mirrored?: boolean; root?: boolean }) {
  const ctx = useContext(PartsCtx)!
  const geo = useMemo(() => partGeometry(p), [p])
  useEffect(() => () => geo?.dispose(), [geo])
  const mat = usePartMaterial(p, ctx.shading, ctx.led, !!mirrored)
  // Alternating copies share one second material in the alternate colour.
  const altColor = p.array?.alt
  const altMat = useMemo(() => {
    if (!altColor || !(mat instanceof THREE.MeshStandardMaterial)) return null
    const m = mat.clone()
    m.color.set(altColor)
    return m
  }, [mat, altColor])
  useEffect(() => () => altMat?.dispose(), [altMat])
  const kids = childrenOf(ctx.all, p.id)
  if (p.hidden) return null
  const radius = p.array?.mode === 'radial' ? (p.array.radius ?? 2) : 0
  const sel = !mirrored && ctx.selected?.has(p.id)
  return (
    <group
      ref={mirrored || !ctx.register ? undefined : (o) => ctx.register!(p.id, o)}
      position={toThree(p.pos)}
      rotation={rotToThree(p.rot)}
      scale={toThree(p.scl)}
      userData={{ partId: p.id, root }}
    >
      {instances(p).map((ins, i) => (
        <group key={i} position={ins.pos} rotation-y={ins.rotY} scale={[ins.flip ? -1 : 1, ins.sy, 1]}>
          <group position={[0, 0, radius]}>
            {geo && (
              <mesh
                geometry={geo}
                material={ins.alt && altMat ? altMat : mat}
                castShadow={ctx.shadows}
                receiveShadow={ctx.shadows}
                onClick={
                  ctx.onPick
                    ? (e) => {
                        e.stopPropagation()
                        ctx.onPick!(p.id, e)
                      }
                    : undefined
                }
              />
            )}
            {sel && geo && i === 0 && <SelOutline geo={geo} />}
            {kids.map((k) => (
              <PartNode key={k.id} p={k} mirrored={mirrored} />
            ))}
          </group>
        </group>
      ))}
    </group>
  )
}

const outlineMat = new THREE.LineBasicMaterial({ color: '#ff9a1f', depthTest: false, transparent: true, opacity: 0.9 })
function SelOutline({ geo }: { geo: THREE.BufferGeometry }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 25), [geo])
  useEffect(() => () => edges.dispose(), [edges])
  return <lineSegments geometry={edges} material={outlineMat} renderOrder={10} />
}
