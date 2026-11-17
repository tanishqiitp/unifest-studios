import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Project, SetPiece, Skin } from '../types'
import { hasOpening, ledBounds, outlinePoints, planeSize, SET_KINDS, setLedArea } from '../lib/setpieces'

type Info = { title: string; lines: string[] }
type Span = { x0: number; x1: number; z0: number; z1: number }

// Set pieces from the Set Design workspace. Pieces face the audience (+z in the 3D world).
export function SetItems({ project, show, dropAt, onInfo, onPick }: { project: Project; show: boolean; dropAt: number; onInfo: (i: Info) => void; onPick?: (id: string) => void }) {
  const set = project.set ?? []
  const span = useMemo(() => ledBounds(set), [set])
  const content = useSetContent(project.setContent)
  if (!set.length) return null
  return (
    <>
      {set.map((s) => (
        <group
          key={s.id}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            if (onPick) return onPick(s.mirrorOf ?? s.id)
            const a = setLedArea(s)
            onInfo({ title: s.label, lines: [SET_KINDS[s.kind].name, `${s.w} × ${s.h} m, ${s.d} m deep`, `${s.z > 0 ? `${s.z} m off the ground` : 'On the ground'}`, ...(a ? [`${a.toFixed(1)} m² LED`] : [])] })
          }}
        >
          <Piece s={s} span={span} content={content} show={show} dropAt={dropAt} />
        </group>
      ))}
    </>
  )
}

// One image or video shared by every LED surface.
export function useSetContent(src?: string) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!src) return setTex(null)
    if (src.startsWith('data:')) {
      const t = new THREE.TextureLoader().load(src)
      t.colorSpace = THREE.SRGBColorSpace
      setTex(t)
      return () => t.dispose()
    }
    const v = document.createElement('video')
    v.src = src
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.crossOrigin = 'anonymous'
    v.play().catch(() => undefined)
    const t = new THREE.VideoTexture(v)
    t.colorSpace = THREE.SRGBColorSpace
    setTex(t)
    return () => {
      v.pause()
      t.dispose()
    }
  }, [src])
  return tex
}

// Default LED look when no content is set: a glowing gradient with a panel grid.
const defaultLed = (() => {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 1024, 512)
  grd.addColorStop(0, '#2b0a5a')
  grd.addColorStop(0.45, '#7a1fa2')
  grd.addColorStop(0.7, '#ff4d8d')
  grd.addColorStop(1, '#ffb347')
  g.fillStyle = grd
  g.fillRect(0, 0, 1024, 512)
  const r = g.createRadialGradient(512, 256, 10, 512, 256, 300)
  r.addColorStop(0, 'rgba(255,255,255,0.55)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 1024, 512)
  g.strokeStyle = 'rgba(0,0,0,0.35)'
  for (let x = 0; x < 1024; x += 16) g.strokeRect(x, 0, 16, 512)
  for (let y = 0; y < 512; y += 16) g.strokeRect(0, y, 1024, 16)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
})()

// ---------- materials ----------

const goldTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#b8892f'
  g.fillRect(0, 0, 256, 256)
  // Simple ornament: scrolls and beads
  g.strokeStyle = '#f3d27a'
  g.lineWidth = 6
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(64 + (i % 2) * 128, 64 + Math.floor(i / 2) * 128, 40, 0, Math.PI * 1.5)
    g.stroke()
  }
  g.fillStyle = '#ffe7a3'
  for (let i = 0; i < 16; i++) {
    g.beginPath()
    g.arc(16 + i * 16, 8, 5, 0, Math.PI * 2)
    g.arc(16 + i * 16, 248, 5, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
})()

const matCache = new Map<string, THREE.Material>()
function skinMat(skin: Skin, color: string): THREE.Material {
  const key = `${skin}|${color}`
  if (matCache.has(key)) return matCache.get(key)!
  let m: THREE.Material
  if (skin === 'mirror') m = new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 1, roughness: 0.06 })
  else if (skin === 'gold') m = new THREE.MeshStandardMaterial({ map: goldTex, metalness: 0.85, roughness: 0.3 })
  else if (skin === 'wood') m = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.8 })
  else if (skin === 'black') m = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.7, metalness: 0.2 })
  else if (skin === 'white') m = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 })
  else if (skin === 'fabric') m = new THREE.MeshStandardMaterial({ color, roughness: 1 })
  else m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  matCache.set(key, m)
  return m
}

// LED material showing the slice of the shared content that falls on this surface.
// `uvMetres` = the geometry's UVs are in metres (shape geometry) rather than 0..1 (boxes).
function useLedMat(enabled: boolean, base: THREE.Texture, span: Span | null, left: number, bottom: number, w: number, h: number, uvMetres: boolean, show: boolean) {
  const mat = useMemo(() => {
    if (!enabled) return null
    const t = base.clone()
    t.needsUpdate = true
    t.colorSpace = THREE.SRGBColorSpace
    const sx = span ? Math.max(0.1, span.x1 - span.x0) : w
    const sz = span ? Math.max(0.1, span.z1 - span.z0) : h
    const x0 = span ? span.x0 : left
    const z0 = span ? span.z0 : bottom
    if (uvMetres) {
      t.repeat.set(1 / sx, 1 / sz)
      t.offset.set((left - x0) / sx, (bottom - z0) / sz)
    } else {
      t.repeat.set(w / sx, h / sz)
      t.offset.set((left - x0) / sx, (bottom - z0) / sz)
    }
    const g = show ? 1.5 : 1.1
    return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(g, g, g), toneMapped: false })
  }, [enabled, base, span, left, bottom, w, h, uvMetres, show])
  useEffect(() => () => void (mat?.map?.dispose(), mat?.dispose()), [mat])
  return mat
}

// ---------- shapes ----------

// Front outline (x 0..W, y 0..H, y up) with an optional hole, for frames, arches and rings.
function frontShape(s: SetPiece): { outer: THREE.Shape; hole: THREE.Path | null } {
  const W = s.w
  const H = s.h
  const b = Math.min(s.border ?? 0.6, W / 2 - 0.05, H / 2 - 0.05)
  if (s.kind === 'ring') {
    const r = Math.min(W, H) / 2
    const outer = new THREE.Shape().absarc(W / 2, H / 2, r, 0, Math.PI * 2, false)
    const hole = new THREE.Path().absarc(W / 2, H / 2, Math.max(0.05, r - b), 0, Math.PI * 2, true)
    return { outer, hole }
  }
  if (s.kind === 'arch') {
    const r = W / 2
    const legs = Math.max(0, H - r)
    const outer = new THREE.Shape()
    outer.moveTo(0, 0)
    outer.lineTo(W, 0)
    outer.lineTo(W, legs)
    outer.absarc(r, legs, r, 0, Math.PI, false)
    outer.lineTo(0, 0)
    const ri = Math.max(0.05, r - b)
    const hole = new THREE.Path()
    hole.moveTo(b, 0)
    hole.lineTo(b, legs)
    hole.absarc(r, legs, ri, Math.PI, 0, true)
    hole.lineTo(W - b, 0)
    hole.lineTo(b, 0)
    return { outer, hole }
  }
  const outer = new THREE.Shape()
  outer.moveTo(0, 0)
  outer.lineTo(W, 0)
  outer.lineTo(W, H)
  outer.lineTo(0, H)
  outer.lineTo(0, 0)
  if (!hasOpening(s.kind)) return { outer, hole: null }
  const hole = new THREE.Path()
  hole.moveTo(b, b)
  hole.lineTo(b, H - b)
  hole.lineTo(W - b, H - b)
  hole.lineTo(W - b, b)
  hole.lineTo(b, b)
  return { outer, hole }
}

function Piece({ s, span, content, show, dropAt }: { s: SetPiece; span: Span | null; content: THREE.Texture | null; show: boolean; dropAt: number }) {
  const base = content ?? defaultLed
  const left = s.x - s.w / 2
  const front = s.y + s.d / 2
  const solid = skinMat(s.skin, s.color)
  const drawn = s.kind === 'shape' || s.kind === 'line'
  const open = hasOpening(s.kind) || drawn
  // LED materials only for pieces that show LED: a box face, or a frame/arch/ring face or filling.
  const ledBox = useLedMat(s.skin === 'led' && !open, base, span, left, s.z, s.w, s.h, false, show)
  const ledShape = useLedMat(open && (s.skin === 'led' || s.inner === 'led'), base, span, left, s.z, s.w, s.h, true, show)
  const flash = useRef<THREE.MeshBasicMaterial[]>([])
  flash.current = [ledBox, ledShape].filter((m): m is THREE.MeshBasicMaterial => !!m)
  // The drop: LED faces flash white for a moment.
  useFrame(({ clock }) => {
    const t = (performance.now() - dropAt) / 1000
    const k = dropAt && t >= 0 && t < 1.2 ? Math.max(0, 1 - t / 1.2) * (Math.sin(t * 40) > 0 ? 3 : 1) : 0
    const g = (show ? 1.5 : 1.1) + k
    for (const m of flash.current) m.color.setScalar(g)
    void clock
  })

  const frameGeo = useMemo(() => {
    if (!hasOpening(s.kind)) return null
    const { outer, hole } = frontShape(s)
    if (hole) outer.holes.push(hole)
    return new THREE.ExtrudeGeometry(outer, { depth: s.d, bevelEnabled: false, curveSegments: 32 })
  }, [s])
  const innerGeo = useMemo(() => {
    if (!hasOpening(s.kind) || !s.inner || s.inner === 'open') return null
    const { hole } = frontShape(s)
    if (!hole) return null
    const sh = new THREE.Shape(hole.getPoints(48))
    return new THREE.ShapeGeometry(sh, 32)
  }, [s])
  useEffect(() => () => (frameGeo?.dispose(), innerGeo?.dispose()), [frameGeo, innerGeo])

  const faceMat = (s.skin === 'led' ? (open ? ledShape : ledBox) : null) ?? solid
  const innerMat = s.inner === 'led' ? ledShape : s.inner && s.inner !== 'open' ? skinMat(s.inner as Skin, s.color) : null

  let body: React.ReactNode
  if (s.kind === 'shape' || s.kind === 'line') {
    body = <Sketch s={s} mat={faceMat} />
  } else if (hasOpening(s.kind)) {
    body = (
      <group position={[left, s.z, s.y - s.d / 2]}>
        <mesh geometry={frameGeo!} material={faceMat} castShadow />
        {innerGeo && innerMat && <mesh geometry={innerGeo} material={innerMat} position={[0, 0, s.d * 0.4]} />}
      </group>
    )
  } else if (s.kind === 'pod') {
    body = (
      <mesh position={[s.x, s.z + s.h / 2, s.y]} material={ledBox ?? solid} castShadow>
        <cylinderGeometry args={[s.w / 2, s.w / 2, s.h, 40]} />
      </mesh>
    )
  } else if (s.kind === 'balloon') {
    body = <Balloon s={s} />
  } else if (s.kind === 'cutout') {
    body = <Cutout s={s} />
  } else if (s.kind === 'tent') {
    body = (
      <group position={[s.x, s.z, s.y]}>
        <mesh position={[0, s.h * 0.3, 0]} material={solid} castShadow>
          <boxGeometry args={[s.w, s.h * 0.6, s.d]} />
        </mesh>
        <mesh position={[0, s.h * 0.8, 0]} rotation-y={Math.PI / 4} material={solid} castShadow>
          <coneGeometry args={[Math.hypot(s.w, s.d) / 2, s.h * 0.4, 4]} />
        </mesh>
      </group>
    )
  } else if (s.kind === 'stall') {
    body = (
      <group position={[s.x, s.z, s.y]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[s.w, 1, s.d]} />
          <meshStandardMaterial color="#3a3a3a" />
        </mesh>
        <mesh position={[0, s.h - s.h * 0.12, 0]} material={solid}>
          <boxGeometry args={[s.w, s.h * 0.25, s.d]} />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[(k * s.w) / 2, s.h / 2, s.d / 2]}>
            <boxGeometry args={[0.06, s.h, 0.06]} />
            <meshStandardMaterial color="#999" metalness={0.7} />
          </mesh>
        ))}
      </group>
    )
  } else if (s.kind === 'scaffold') {
    body = <Scaffold s={s} />
  } else {
    // Boxes: towers, blocks, booths, logo signs. Only the front face carries LED or artwork.
    body = <BoxPiece s={s} face={faceMat} side={s.skin === 'led' ? skinMat('black', '#000') : solid} />
  }

  const inner = (
    <>
      {body}
      {s.outline && <Outline s={s} front={front} />}
    </>
  )
  if (!s.rot) return <group>{inner}</group>
  // Turned in the top view: spin about the piece's centre.
  return (
    <group position={[s.x, 0, s.y]} rotation-y={-THREE.MathUtils.degToRad(s.rot)}>
      <group position={[-s.x, 0, -s.y]}>{inner}</group>
    </group>
  )
}

// A drawn sketch on its plane, pushed out into a solid (shapes) or built from beams (lines).
function Sketch({ s, mat }: { s: SetPiece; mat: THREE.Material }) {
  const [a, b, push] = planeSize(s)
  const plane = s.plane ?? 'front'
  const geo = useMemo(() => {
    const pts = s.pts ?? []
    if (s.kind !== 'shape' || pts.length < 3) return null
    const sh = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u * a, v * b)))
    return new THREE.ExtrudeGeometry(sh, { depth: push, bevelEnabled: false, curveSegments: 24 })
  }, [s.kind, s.pts, a, b, push])
  useEffect(() => () => geo?.dispose(), [geo])
  const beams = useMemo(() => {
    if (s.kind !== 'line') return []
    const t = s.border ?? 0.15
    const p = (s.pts ?? []).map(([u, v]) => [u * a, v * b])
    return p.slice(1).map((q, i) => {
      const [x0, y0] = p[i]
      const len = Math.hypot(q[0] - x0, q[1] - y0)
      return { pos: [(x0 + q[0]) / 2, (y0 + q[1]) / 2, push / 2] as [number, number, number], rot: Math.atan2(q[1] - y0, q[0] - x0), size: [len + t, t, push] as [number, number, number] }
    })
  }, [s.kind, s.pts, s.border, a, b, push])
  // Place the sketch plane in the world (see SketchPlane in types.ts).
  const place =
    plane === 'front'
      ? { position: [s.x - s.w / 2, s.z, s.y - s.d / 2] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
      : plane === 'top'
        ? { position: [s.x - s.w / 2, s.z + s.h, s.y - s.d / 2] as [number, number, number], rotation: [Math.PI / 2, 0, 0] as [number, number, number] }
        : { position: [s.x + s.w / 2, s.z, s.y - s.d / 2] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number] }
  return (
    <group {...place}>
      {geo && <mesh geometry={geo} material={mat} castShadow receiveShadow />}
      {beams.map((m, i) => (
        <mesh key={i} position={m.pos} rotation-z={m.rot} material={mat} castShadow>
          <boxGeometry args={m.size} />
        </mesh>
      ))}
    </group>
  )
}

function BoxPiece({ s, face, side }: { s: SetPiece; face: THREE.Material; side: THREE.Material }) {
  const [art, setArt] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!s.image) return setArt(null)
    const t = new THREE.TextureLoader().load(s.image)
    t.colorSpace = THREE.SRGBColorSpace
    setArt(t)
    return () => t.dispose()
  }, [s.image])
  const artMat = useMemo(() => (art ? new THREE.MeshStandardMaterial({ map: art, roughness: 0.5, emissive: '#ffffff', emissiveMap: art, emissiveIntensity: 0.35 }) : null), [art])
  const front = artMat ?? face
  const mats = useMemo(() => [side, side, side, side, front, side], [side, front])
  return (
    <mesh position={[s.x, s.z + s.h / 2, s.y]} material={mats} castShadow receiveShadow>
      <boxGeometry args={[s.w, s.h, s.d]} />
    </mesh>
  )
}

function Cutout({ s }: { s: SetPiece }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!s.image) return setTex(null)
    const t = new THREE.TextureLoader().load(s.image)
    t.colorSpace = THREE.SRGBColorSpace
    setTex(t)
    return () => t.dispose()
  }, [s.image])
  return (
    <group position={[s.x, s.z, s.y]}>
      <mesh position={[0, s.h / 2, 0]} castShadow>
        <planeGeometry args={[s.w, s.h]} />
        {tex ? <meshStandardMaterial map={tex} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.6} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.3} /> : <meshStandardMaterial color="#666" wireframe />}
      </mesh>
      {/* Back brace */}
      <mesh position={[0, s.h * 0.35, -0.4]} rotation-x={0.4}>
        <boxGeometry args={[0.08, s.h * 0.7, 0.08]} />
        <meshStandardMaterial color="#555" />
      </mesh>
    </group>
  )
}

function Balloon({ s }: { s: SetPiece }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!s.image) return setTex(null)
    const t = new THREE.TextureLoader().load(s.image)
    t.colorSpace = THREE.SRGBColorSpace
    setTex(t)
    return () => t.dispose()
  }, [s.image])
  const r = s.w / 2
  return (
    <group position={[s.x, s.z, s.y]}>
      <mesh position={[0, s.h - r, 0]} castShadow>
        <sphereGeometry args={[r, 32, 24]} />
        <meshStandardMaterial color={s.color} map={tex} roughness={0.4} />
      </mesh>
      <mesh position={[0, (s.h - 2 * r) / 2, 0]}>
        <cylinderGeometry args={[0.01, 0.01, Math.max(0.1, s.h - 2 * r), 4]} />
        <meshBasicMaterial color="#888" />
      </mesh>
    </group>
  )
}

function Scaffold({ s }: { s: SetPiece }) {
  const geo = useMemo(() => {
    const pts: number[] = []
    const lv = Math.max(1, Math.round(s.h / 2))
    const W = s.w / 2
    const D = s.d / 2
    const corners: [number, number][] = [
      [-W, -D],
      [W, -D],
      [W, D],
      [-W, D],
    ]
    for (const [x, z] of corners) pts.push(x, 0, z, x, s.h, z)
    for (let i = 0; i <= lv; i++) {
      const y = (i * s.h) / lv
      for (let k = 0; k < 4; k++) {
        const a = corners[k]
        const b = corners[(k + 1) % 4]
        pts.push(a[0], y, a[1], b[0], y, b[1])
        if (i < lv) pts.push(a[0], y, a[1], b[0], ((i + 1) * s.h) / lv, b[1])
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [s.w, s.h, s.d])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <lineSegments geometry={geo} position={[s.x, s.z, s.y]}>
      <lineBasicMaterial color={s.skin === 'white' ? '#dddddd' : '#8a8a8a'} />
    </lineSegments>
  )
}

// ---------- outline lights ----------

const bulbGeo = new THREE.SphereGeometry(0.06, 8, 6)

function Outline({ s, front }: { s: SetPiece; front: number }) {
  const o = s.outline!
  const step = o.style === 'bulb' ? 0.35 : 0.25
  // Local front-view points (y down from the top) → world positions on the front face.
  const pts = useMemo(() => outlinePoints(s, step).map(([px, py]) => new THREE.Vector3(s.x - s.w / 2 + px, s.z + s.h - py, front + 0.03)), [s, front, step])
  const inst = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => new THREE.Color(o.color), [o.color])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color() }), [])
  useEffect(() => {
    const im = inst.current
    if (!im) return
    pts.forEach((p, i) => {
      tmp.m.makeTranslation(p.x, p.y, p.z)
      im.setMatrixAt(i, tmp.m)
      im.setColorAt(i, tmp.c.copy(base).multiplyScalar(3))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [pts, base, tmp])
  useFrame(({ clock }) => {
    const im = inst.current
    if (!im || !o.chase || !im.instanceColor) return
    const t = clock.elapsedTime * 8
    for (let i = 0; i < pts.length; i++) {
      const on = (Math.floor(t) + i) % 3 === 0
      im.setColorAt(i, tmp.c.copy(base).multiplyScalar(on ? 4 : 0.6))
    }
    im.instanceColor.needsUpdate = true
  })
  const tube = useMemo(() => {
    if (o.style !== 'neon' || pts.length < 2) return null
    const closed = s.kind !== 'arch'
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.01)
    return new THREE.TubeGeometry(curve, pts.length * 2, 0.04, 6, closed)
  }, [o.style, pts, s.kind])
  useEffect(() => () => tube?.dispose(), [tube])
  if (o.style === 'neon')
    return tube ? (
      <mesh geometry={tube}>
        <meshBasicMaterial color={base.clone().multiplyScalar(3)} toneMapped={false} />
      </mesh>
    ) : null
  return (
    <instancedMesh ref={inst} args={[bulbGeo, undefined, pts.length]} key={pts.length}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
