import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { Brand, Decor, Project } from '../types'
import { DECOR } from '../lib/decor'
import { getModel } from '../lib/models'

type Info = { title: string; lines: string[] }
const rad = THREE.MathUtils.degToRad

// Everything placed in the Decor workspace: decor, special effects, sponsor branding and imported models.
export function DecorItems({ project, show, motion, onInfo }: { project: Project; show: boolean; motion: boolean; onInfo: (i: Info) => void }) {
  return (
    <>
      {(project.decor ?? []).map((d) => (
        <group
          key={d.id}
          position={[d.x, d.z, d.y]}
          rotation-y={-rad(d.rotation)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            onInfo({ title: d.label || DECOR[d.kind].name, lines: [DECOR[d.kind].name, `${d.w} × ${d.d} m, ${d.h} m high`, ...(d.sponsor ? [`Sponsor: ${d.sponsor}`] : []), ...(DECOR[d.kind].effect ? [DECOR[d.kind].tip] : [])] })
          }}
        >
          <DecorMesh d={d} brand={project.brand} show={show} motion={motion} />
        </group>
      ))}
    </>
  )
}

function DecorMesh({ d, brand, show, motion }: { d: Decor; brand?: Brand; show: boolean; motion: boolean }) {
  const fx = DECOR[d.kind].effect
  if (fx) return <Effect d={d} show={show} motion={motion} />
  switch (d.kind) {
    case 'mandap':
      return <Mandap d={d} />
    case 'floral-arch':
      return <Arch d={d} />
    case 'flower-wall':
      return <FlowerWall d={d} />
    case 'drape':
      return <Drape d={d} />
    case 'pillar':
      return <Pillar d={d} />
    case 'chandelier':
      return <Chandelier d={d} show={show} />
    case 'centrepiece':
      return <Centrepiece d={d} />
    case 'photo-booth':
      return <Booth d={d} brand={brand} />
    case 'entrance-gate':
      return <Gate d={d} />
    case 'banner':
    case 'standee':
    case 'flag':
    case 'backdrop':
      return <Artwork d={d} brand={brand} />
    case 'model':
      return <ImportedModel d={d} />
  }
}

// ---------------------------------------------------------------- decor

function Mandap({ d }: { d: Decor }) {
  const r = Math.min(d.w, d.d) * 0.04 + 0.08
  const corners: [number, number][] = [
    [-d.w / 2 + r, -d.d / 2 + r],
    [d.w / 2 - r, -d.d / 2 + r],
    [-d.w / 2 + r, d.d / 2 - r],
    [d.w / 2 - r, d.d / 2 - r],
  ]
  return (
    <group>
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[d.w + 0.6, 0.3, d.d + 0.6]} />
        <meshStandardMaterial color="#efe6d6" roughness={0.6} />
      </mesh>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0.3, z]}>
          <mesh position={[0, (d.h - 0.9) / 2, 0]} castShadow>
            <cylinderGeometry args={[r, r * 1.2, d.h - 0.9, 16]} />
            <meshStandardMaterial color={d.color} roughness={0.4} metalness={0.2} />
          </mesh>
          <Blooms y={d.h - 0.9} r={r * 2.2} />
        </group>
      ))}
      <mesh position={[0, d.h - 0.35, 0]} castShadow>
        <coneGeometry args={[Math.hypot(d.w, d.d) / 2, 0.9, 4, 1]} />
        <meshStandardMaterial color={d.color} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, d.h - 0.85, 0]}>
        <boxGeometry args={[d.w, 0.12, d.d]} />
        <meshStandardMaterial color="#c9a14a" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}

const bloomColors = ['#f7c6d2', '#ffffff', '#f4a6b8', '#ffd9a0', '#e86f8f']

function Blooms({ y, r, n = 9 }: { y: number; r: number; n?: number }) {
  return (
    <group position={[0, y, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * r * 0.6, Math.sin(i * 2.1) * 0.1, Math.sin(a) * r * 0.6]}>
            <sphereGeometry args={[r * 0.35, 10, 8]} />
            <meshStandardMaterial color={bloomColors[i % bloomColors.length]} roughness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

function Arch({ d }: { d: Decor }) {
  const R = d.w / 2
  const legs = Math.max(0, d.h - R)
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * R, legs / 2, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, legs, 10]} />
          <meshStandardMaterial color={d.color} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, legs, 0]} castShadow>
        <torusGeometry args={[R, 0.22, 10, 40, Math.PI]} />
        <meshStandardMaterial color={d.color} roughness={0.85} />
      </mesh>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 13) * Math.PI
        return (
          <mesh key={i} position={[Math.cos(a) * R, legs + Math.sin(a) * R, 0.15]}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshStandardMaterial color={bloomColors[i % bloomColors.length]} roughness={0.8} />
          </mesh>
        )
      })}
    </group>
  )
}

function flowerTexture(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#2f3b2a'
  g.fillRect(0, 0, 256, 256)
  const cols = [color, '#ffffff', '#f7c6d2', '#ffd9a0', '#e86f8f']
  for (let i = 0; i < 420; i++) {
    g.fillStyle = cols[i % cols.length]
    g.beginPath()
    g.arc((i * 97) % 256, (i * 57 + (i % 7) * 13) % 256, 7 + (i % 5), 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function FlowerWall({ d }: { d: Decor }) {
  const tex = useMemo(() => {
    const t = flowerTexture(d.color)
    t.repeat.set(Math.max(1, d.w / 1.5), Math.max(1, d.h / 1.5))
    return t
  }, [d.color, d.w, d.h])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh position={[0, d.h / 2, 0]} castShadow>
      <boxGeometry args={[d.w, d.h, Math.max(0.1, d.d)]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  )
}

function Drape({ d }: { d: Decor }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(d.w, d.h, Math.max(8, Math.round(d.w * 6)), 1)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / d.w) * Math.PI * Math.max(4, d.w * 2)) * 0.12)
    g.computeVertexNormals()
    return g
  }, [d.w, d.h])
  return (
    <mesh geometry={geo} position={[0, d.h / 2, 0]} castShadow>
      <meshStandardMaterial color={d.color} roughness={0.9} side={THREE.DoubleSide} transparent opacity={0.92} />
    </mesh>
  )
}

function Pillar({ d }: { d: Decor }) {
  const r = Math.min(d.w, d.d) / 2
  return (
    <group>
      <mesh position={[0, d.h / 2, 0]} castShadow>
        <cylinderGeometry args={[r * 0.6, r * 0.8, d.h, 16]} />
        <meshStandardMaterial color={d.color} roughness={0.5} />
      </mesh>
      <Blooms y={d.h} r={r * 1.3} n={7} />
    </group>
  )
}

function Chandelier({ d, show }: { d: Decor; show: boolean }) {
  const r = d.w / 2
  return (
    <group>
      <mesh position={[0, d.h + 3, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 6, 4]} />
        <meshBasicMaterial color="#555" />
      </mesh>
      <mesh position={[0, d.h * 0.6, 0]}>
        <coneGeometry args={[r, d.h * 0.8, 20, 1, true]} />
        <meshStandardMaterial color={d.color} metalness={0.9} roughness={0.15} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * r * 0.9, 0.15, Math.sin(a) * r * 0.9]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshBasicMaterial color={show ? [4, 3.4, 2.2] : '#ffe9b0'} toneMapped={!show} />
          </mesh>
        )
      })}
    </group>
  )
}

function Centrepiece({ d }: { d: Decor }) {
  return (
    <group>
      <mesh position={[0, d.h * 0.4, 0]}>
        <cylinderGeometry args={[0.03, 0.08, d.h * 0.8, 8]} />
        <meshStandardMaterial color="#c9a14a" metalness={0.8} roughness={0.3} />
      </mesh>
      <Blooms y={d.h * 0.85} r={d.w * 0.5} n={6} />
    </group>
  )
}

function Booth({ d, brand }: { d: Decor; brand?: Brand }) {
  return (
    <group>
      <Artwork d={{ ...d, d: 0.1, z: 0 }} brand={brand} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (d.w / 2), d.h / 2, d.d / 2]} castShadow>
          <boxGeometry args={[0.1, d.h, d.d]} />
          <meshStandardMaterial color={d.color} />
        </mesh>
      ))}
    </group>
  )
}

function Gate({ d }: { d: Decor }) {
  const tw = Math.min(1.2, d.w * 0.18)
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (d.w / 2 - tw / 2), 0, 0]}>
          <mesh position={[0, d.h * 0.42, 0]} castShadow>
            <boxGeometry args={[tw, d.h * 0.84, d.d]} />
            <meshStandardMaterial color={d.color} roughness={0.6} />
          </mesh>
          <mesh position={[0, d.h * 0.9, 0]}>
            <sphereGeometry args={[tw * 0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#c9a14a" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, d.h * 0.62, 0]} castShadow>
        <torusGeometry args={[d.w / 2 - tw, 0.25, 8, 30, Math.PI]} />
        <meshStandardMaterial color={d.color} roughness={0.6} />
      </mesh>
      <mesh position={[0, d.h * 0.62 + 0.1, 0.05]}>
        <torusGeometry args={[d.w / 2 - tw, 0.18, 6, 30, Math.PI]} />
        <meshStandardMaterial color="#f7c6d2" roughness={0.9} />
      </mesh>
    </group>
  )
}

// Banners, standees, flags and backdrops: the uploaded artwork, else the brand logo, else the sponsor name.
function useArtwork(d: Decor, brand?: Brand) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    const src = d.image ?? (d.sponsor ? undefined : brand?.logo)
    let t: THREE.Texture
    if (src) {
      t = new THREE.TextureLoader().load(src)
    } else {
      const c = document.createElement('canvas')
      const ratio = d.w / Math.max(0.1, d.h)
      c.width = 512
      c.height = Math.max(64, Math.round(512 / ratio))
      const g = c.getContext('2d')!
      g.fillStyle = brand?.color && !d.sponsor ? brand.color : d.color
      g.fillRect(0, 0, c.width, c.height)
      const text = (d.sponsor || brand?.name || d.label || 'Your logo').toUpperCase()
      g.fillStyle = isLight(g.fillStyle as string) ? '#000' : '#fff'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      let fs = Math.min(c.height * 0.3, 90)
      g.font = `700 ${fs}px Inter, sans-serif`
      while (g.measureText(text).width > c.width * 0.85 && fs > 10) g.font = `700 ${(fs -= 4)}px Inter, sans-serif`
      g.fillText(text, c.width / 2, c.height / 2)
      t = new THREE.CanvasTexture(c)
    }
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    setTex(t)
    return () => t.dispose()
  }, [d.image, d.sponsor, d.label, d.color, d.w, d.h, brand?.logo, brand?.name, brand?.color])
  return tex
}

function isLight(hex: string) {
  const c = new THREE.Color(hex)
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6
}

function Artwork({ d, brand }: { d: Decor; brand?: Brand }) {
  const tex = useArtwork(d, brand)
  const stand = d.kind === 'standee' || d.kind === 'flag'
  const faceH = d.kind === 'flag' ? d.h * 0.75 : d.h
  const y0 = d.kind === 'flag' ? d.h - faceH : 0
  return (
    <group>
      <mesh position={[0, y0 + faceH / 2, 0]} castShadow>
        <boxGeometry args={[d.w, faceH, Math.max(0.02, Math.min(0.1, d.d))]} />
        <meshStandardMaterial attach="material-0" color="#222" />
        <meshStandardMaterial attach="material-1" color="#222" />
        <meshStandardMaterial attach="material-2" color="#222" />
        <meshStandardMaterial attach="material-3" color="#222" />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.6} />
        <meshStandardMaterial attach="material-5" map={d.kind === 'flag' ? tex : null} color={d.kind === 'flag' ? '#fff' : '#333'} roughness={0.6} />
      </mesh>
      {stand && (
        <mesh position={[d.kind === 'flag' ? -d.w / 2 : 0, d.h / 2, d.kind === 'flag' ? 0 : -0.05]}>
          <cylinderGeometry args={[0.02, 0.02, d.h, 6]} />
          <meshStandardMaterial color="#888" metalness={0.8} />
        </mesh>
      )}
      {d.kind === 'standee' && (
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[d.w, 0.08, 0.25]} />
          <meshStandardMaterial color="#999" metalness={0.8} roughness={0.3} />
        </mesh>
      )}
      {d.kind === 'banner' &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[(s * d.w) / 2, d.h / 2, -0.03]}>
            <boxGeometry args={[0.05, d.h, 0.05]} />
            <meshStandardMaterial color="#555" metalness={0.8} />
          </mesh>
        ))}
    </group>
  )
}

// ---------------------------------------------------------------- special effects

// Each effect is a small particle system that loops while the effect is set to fire.
function Effect({ d, show, motion }: { d: Decor; show: boolean; motion: boolean }) {
  const kind = d.kind
  const N = kind === 'smoke' ? 40 : kind === 'firework' ? 260 : kind === 'confetti' ? 220 : kind === 'bubble' ? 60 : 180
  const pts = useRef<THREE.Points>(null)
  const state = useMemo(() => {
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const vel = new Float32Array(N * 3)
    const age = new Float32Array(N).map(() => Math.random())
    return { pos, col, vel, age }
  }, [N])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(state.col, 3))
    return g
  }, [state])
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: kind === 'smoke' ? 1.6 : kind === 'bubble' ? 0.18 : kind === 'confetti' ? 0.09 : 0.07,
        map: kind === 'smoke' ? softDot : dot,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: kind === 'smoke' || kind === 'confetti' || kind === 'bubble' ? THREE.NormalBlending : THREE.AdditiveBlending,
        opacity: kind === 'smoke' ? 0.35 : 1,
        toneMapped: false,
      }),
    [kind],
  )
  useEffect(() => () => (geo.dispose(), mat.dispose()), [geo, mat])
  const k = d.intensity ?? 0.8
  const base = useMemo(() => new THREE.Color(d.color), [d.color])
  const tmp = useMemo(() => new THREE.Color(), [])
  const firing = (d.fire ?? true) && motion
  const cycle = kind === 'firework' ? 3 : kind === 'confetti' ? 4 : 1.4

  useFrame(({ clock }, dt) => {
    const { pos, col, vel, age } = state
    const t = clock.elapsedTime
    const H = d.h * k
    for (let i = 0; i < N; i++) {
      age[i] += dt / cycle
      const j = i * 3
      if (age[i] >= 1) {
        age[i] -= 1
        if (!firing) {
          pos[j + 1] = -100 // hide
          continue
        }
        spawn(kind, i, N, H, d, pos, vel, t)
      }
      if (pos[j + 1] < -50) continue
      // Move
      const a = age[i]
      if (kind === 'firework') {
        if (a < 0.3) {
          pos[j] = 0
          pos[j + 2] = 0
          pos[j + 1] = (a / 0.3) * H
        } else {
          pos[j] += vel[j] * dt
          pos[j + 1] += vel[j + 1] * dt
          pos[j + 2] += vel[j + 2] * dt
          vel[j + 1] -= 3 * dt
        }
      } else {
        pos[j] += vel[j] * dt
        pos[j + 1] += vel[j + 1] * dt
        pos[j + 2] += vel[j + 2] * dt
        const g = kind === 'cold-pyro' ? 9 : kind === 'confetti' ? 0.6 : kind === 'smoke' || kind === 'bubble' ? -0.05 : kind === 'co2-jet' ? 4 : 0
        vel[j + 1] -= g * dt
        if (kind === 'confetti') {
          vel[j] *= 0.98
          vel[j + 2] *= 0.98
          if (vel[j + 1] < -0.8) vel[j + 1] = -0.8
          pos[j] += Math.sin(t * 3 + i) * 0.01
        }
        if (pos[j + 1] < 0) pos[j + 1] = kind === 'confetti' ? 0.01 : -100
      }
      // Colour fades with age
      const fade = kind === 'smoke' ? Math.sin(a * Math.PI) : kind === 'confetti' || kind === 'bubble' ? 1 : 1 - a
      if (kind === 'confetti') tmp.setHSL((i * 0.137) % 1, 0.8, 0.6)
      else if (kind === 'firework') tmp.setHSL(((Math.floor(t / cycle) * 0.23 + (i % 3) * 0.05) % 1 + 1) % 1, 0.9, 0.65)
      else if (kind === 'flame') tmp.setRGB(1, 0.35 + (1 - a) * 0.5, 0.05)
      else tmp.copy(base)
      const glow = show && kind !== 'smoke' && kind !== 'confetti' && kind !== 'bubble' ? 2.5 : 1
      col[j] = tmp.r * fade * glow
      col[j + 1] = tmp.g * fade * glow
      col[j + 2] = tmp.b * fade * glow
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  return (
    <group>
      {/* The machine itself */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[Math.min(0.5, d.w), 0.24, Math.min(0.5, d.d)]} />
        <meshStandardMaterial color="#111" metalness={0.6} roughness={0.4} />
      </mesh>
      <points ref={pts} geometry={geo} material={mat} frustumCulled={false} position={[0, 0.25, 0]} />
    </group>
  )
}

function spawn(kind: Decor['kind'], i: number, N: number, H: number, d: Decor, pos: Float32Array, vel: Float32Array, t: number) {
  const j = i * 3
  const r = () => Math.random() - 0.5
  pos[j] = r() * 0.1
  pos[j + 1] = 0
  pos[j + 2] = r() * 0.1
  if (kind === 'cold-pyro') {
    const v = Math.sqrt(2 * 9 * Math.max(0.5, H))
    vel[j] = r() * 0.8
    vel[j + 1] = v * (0.85 + Math.random() * 0.2)
    vel[j + 2] = r() * 0.8
  } else if (kind === 'co2-jet') {
    const v = Math.sqrt(2 * 4 * Math.max(0.5, H))
    vel[j] = r() * 1.2
    vel[j + 1] = v * (0.8 + Math.random() * 0.3)
    vel[j + 2] = r() * 1.2
  } else if (kind === 'flame') {
    vel[j] = r() * 0.5
    vel[j + 1] = H * (1.2 + Math.random() * 0.4)
    vel[j + 2] = r() * 0.5
  } else if (kind === 'smoke') {
    vel[j] = r() * 0.8 + 0.4
    vel[j + 1] = 0.15 + Math.random() * 0.3
    vel[j + 2] = r() * 0.8 + 0.3
  } else if (kind === 'bubble') {
    pos[j + 1] = H * 0.5
    vel[j] = r() * 1.5
    vel[j + 1] = 0.2 + Math.random() * 0.4
    vel[j + 2] = r() * 1.5 + 0.5
  } else if (kind === 'confetti') {
    vel[j] = r() * 4
    vel[j + 1] = Math.sqrt(2 * 9 * Math.max(1, H)) * (0.6 + Math.random() * 0.4)
    vel[j + 2] = r() * 4 + 1.5
  } else if (kind === 'firework') {
    // Burst: random direction on a sphere, launched from the top of the climb.
    const u = Math.random() * 2 - 1
    const th = Math.random() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const sp = (2.5 + Math.random()) * Math.max(0.6, H / 8) * (1 + Math.sin(t + d.x) * 0.1)
    vel[j] = s * Math.cos(th) * sp
    vel[j + 1] = u * sp
    vel[j + 2] = s * Math.sin(th) * sp
  }
  void N
}

function dotTexture(soft: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(soft ? 0.5 : 0.25, `rgba(255,255,255,${soft ? 0.5 : 0.8})`)
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}
const dot = dotTexture(false)
const softDot = dotTexture(true)

// ---------------------------------------------------------------- imported models

let draco: DRACOLoader | null = null
function gltfLoader() {
  const l = new GLTFLoader()
  draco ??= new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  l.setDRACOLoader(draco)
  l.setMeshoptDecoder(MeshoptDecoder)
  return l
}

// Parsed models are cached by file id so moving or editing an item does not re-parse the file.
const cache = new Map<string, Promise<THREE.Object3D>>()

export function loadModel(id: string): Promise<THREE.Object3D> {
  if (!cache.has(id))
    cache.set(
      id,
      (async () => {
        const m = await getModel(id)
        if (!m) throw new Error('This model is not stored in this browser. Import the file again.')
        if (m.type === 'glb' || m.type === 'gltf') {
          const g = await gltfLoader().parseAsync(m.type === 'gltf' ? new TextDecoder().decode(m.data) : m.data, '')
          return g.scene
        }
        if (m.type === 'obj') return new OBJLoader().parse(new TextDecoder().decode(m.data))
        if (m.type === 'fbx') return new FBXLoader().parse(m.data, '')
        const geo = new STLLoader().parse(m.data)
        geo.computeVertexNormals()
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.6 }))
      })(),
    )
  return cache.get(id)!
}

export interface ModelStats {
  size: THREE.Vector3
  meshes: string[]
  triangles: number
}

// Natural size (Blender metres, Y up), part names and triangle count of a model.
export function modelStats(obj: THREE.Object3D): ModelStats {
  const box = new THREE.Box3().setFromObject(obj)
  const meshes: string[] = []
  let triangles = 0
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes.push(m.name || `Part ${meshes.length + 1}`)
    const g = m.geometry
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return { size: box.getSize(new THREE.Vector3()), meshes, triangles: Math.round(triangles) }
}

function ImportedModel({ d }: { d: Decor }) {
  const [src, setSrc] = useState<THREE.Object3D | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (!d.modelId) return
    let live = true
    loadModel(d.modelId).then(
      (o) => live && setSrc(o),
      () => live && setErr(true),
    )
    return () => void (live = false)
  }, [d.modelId])

  // A copy per item, recentred on the floor and scaled to the item's box.
  const obj = useMemo(() => {
    if (!src || d.proxy) return null
    const o = src.clone(true)
    const box = new THREE.Box3().setFromObject(o)
    const size = box.getSize(new THREE.Vector3())
    const c = box.getCenter(new THREE.Vector3())
    o.position.set(-c.x, -box.min.y, -c.z)
    const wrap = new THREE.Group()
    wrap.add(o)
    wrap.scale.set(d.w / Math.max(1e-3, size.x), d.h / Math.max(1e-3, size.y), d.d / Math.max(1e-3, size.z))
    const hidden = new Set(d.hidden ?? [])
    let n = 0
    o.traverse((x) => {
      const m = x as THREE.Mesh
      if (!m.isMesh) return
      const name = m.name || `Part ${++n}`
      if (!m.name) n = n // keep numbering in step with modelStats
      m.visible = !hidden.has(name)
      m.castShadow = true
      m.receiveShadow = true
      if (d.tint || d.wire) {
        m.material = new THREE.MeshStandardMaterial({ color: d.tint ? d.color : '#dddddd', wireframe: !!d.wire, roughness: 0.6, metalness: 0.1 })
      }
    })
    return wrap
  }, [src, d.w, d.h, d.d, d.tint, d.wire, d.color, d.proxy, d.hidden])

  if (!obj)
    return (
      <mesh position={[0, d.h / 2, 0]}>
        <boxGeometry args={[d.w, d.h, d.d]} />
        <meshStandardMaterial color={err ? '#7a2a2a' : '#666'} wireframe={!d.proxy} transparent opacity={d.proxy ? 0.5 : 1} />
      </mesh>
    )
  return <primitive object={obj} />
}
