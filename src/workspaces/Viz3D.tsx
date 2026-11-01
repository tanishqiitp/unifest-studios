import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { Camera, Film, Moon, Sun, Zap } from 'lucide-react'
import { useStore } from '../store'
import type { Project, Screen, Truss } from '../types'
import { FIXTURE_INFO, screenColumns, screenStats, stageBounds, TRUSS_INFO } from '../lib/calc'

type Preset = 'audience' | 'last' | 'foh' | 'stage' | 'drone'

export function Viz3DWorkspace() {
  const project = useStore((s) => s.project)
  return <Viewer project={project} />
}

export function Viewer({ project, compact }: { project: Project; compact?: boolean }) {
  const [preset, setPreset] = useState<Preset>('audience')
  const [night, setNight] = useState(true)
  const [beams, setBeams] = useState(true)
  const [video, setVideo] = useState<string | null>(null)
  const [shotReq, setShotReq] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="relative h-full w-full" style={{ background: night ? '#000' : '#1c1c1c' }}>
      <Canvas shadows={false} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 50, near: 0.1, far: 2000 }}>
        <Scene project={project} preset={preset} night={night} beams={beams} video={video} shotReq={shotReq} />
      </Canvas>
      <div className={`absolute ${compact ? 'bottom-4' : 'top-4'} left-1/2 -translate-x-1/2 glass rounded-xl flex flex-wrap items-center justify-center gap-1 p-1 max-w-[95vw]`}>
        {(
          [
            ['audience', 'Audience'],
            ['last', 'Last row'],
            ['foh', 'FOH'],
            ['stage', 'Stage POV'],
            ['drone', 'Drone'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`btn h-8 ${preset === k ? 'btn-on' : ''}`} onClick={() => setPreset(k)}>
            {l}
          </button>
        ))}
        <div className="w-px h-5 bg-line mx-1" />
        <button className="btn btn-icon h-8 w-8" title={night ? 'Day' : 'Night'} onClick={() => setNight(!night)}>
          {night ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <button className={`btn btn-icon h-8 w-8 ${beams ? 'btn-on' : ''}`} title="Light beams" onClick={() => setBeams(!beams)}>
          <Zap size={14} />
        </button>
        {!compact && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setVideo(URL.createObjectURL(f) + (f.type.startsWith('image') ? '#img' : ''))
              }}
            />
            <button className={`btn h-8 ${video ? 'btn-on' : ''}`} title="Play a video or image on every screen (stays on this computer)" onClick={() => (video ? setVideo(null) : fileRef.current?.click())}>
              <Film size={14} /> {video ? 'Stop content' : 'Play content'}
            </button>
            <button className="btn h-8" onClick={() => setShotReq((n) => n + 1)}>
              <Camera size={14} /> Render PNG
            </button>
          </>
        )}
      </div>
      {!compact && <div className="absolute left-4 bottom-4 text-[11px] text-mute">Drag to orbit · right-drag to pan · scroll to zoom · built live from your 2D plans</div>}
    </div>
  )
}

function Scene({ project, preset, night, beams, video, shotReq }: { project: Project; preset: Preset; night: boolean; beams: boolean; video: string | null; shotReq: number }) {
  const controls = useRef<OrbitImpl>(null)
  const { camera, gl, scene } = useThree()
  const sb = stageBounds(project)
  const W = project.venue.w
  const L = project.venue.l

  useEffect(() => {
    scene.background = new THREE.Color(night ? '#000000' : '#1c1c1c')
    scene.fog = new THREE.Fog(night ? '#000000' : '#1c1c1c', 60, 260)
  }, [night, scene])

  useEffect(() => {
    const cx = W / 2
    const front = sb ? sb.y + sb.l : 8
    const screenMid = Math.max(4, ...project.screens.map((s) => s.z + screenStats(s, project.customPanels).h / 2))
    const target = new THREE.Vector3(cx, preset === 'stage' ? 1.5 : screenMid * 0.8, preset === 'stage' ? L : (sb?.y ?? 2) + 1)
    const foh = project.ground.find((g) => g.kind === 'foh')
    const pos: Record<Preset, [number, number, number]> = {
      audience: [cx, 1.7, Math.min(L - 2, front + 12)],
      last: [cx, 1.7, L - 2],
      foh: [cx, 3, foh ? foh.y + foh.h / 2 : front + 25],
      stage: [cx, (sb?.h ?? 1) + 1.7, (sb?.y ?? 2) + 2],
      drone: [cx + W * 0.3, Math.max(W, L) * 0.32, Math.min(L, front + Math.max(W, L) * 0.4)],
    }
    camera.position.set(...pos[preset])
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [preset, W, L, sb?.y, sb?.l, sb?.h, camera, project.ground, project.screens, project.customPanels])

  useEffect(() => {
    if (!shotReq) return
    requestAnimationFrame(() => {
      const a = document.createElement('a')
      a.href = gl.domElement.toDataURL('image/png')
      a.download = `${project.name.replace(/\s+/g, '-')}-render.png`
      a.click()
    })
  }, [shotReq, gl, project.name])

  const content = useContent(video)

  return (
    <>
      <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} />
      <ambientLight intensity={night ? 0.25 : 0.9} />
      <directionalLight position={[W, 40, L]} intensity={night ? 0.35 : 1.2} />
      <hemisphereLight args={['#ffffff', '#111111', night ? 0.2 : 0.5]} />
      {/* Ground */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0, L / 2]}>
        <planeGeometry args={[W + 200, L + 200]} />
        <meshStandardMaterial color={night ? '#070707' : '#2a2a2a'} roughness={1} />
      </mesh>
      <lineSegments position={[W / 2, 0.01, L / 2]} rotation-x={-Math.PI / 2}>
        <edgesGeometry args={[new THREE.PlaneGeometry(W, L)]} />
        <lineBasicMaterial color="#555" />
      </lineSegments>
      <gridHelper args={[Math.max(W, L), Math.max(W, L), '#1a1a1a', '#121212']} position={[W / 2, 0.005, L / 2]} />
      <GroundItems project={project} />
      <Crowd project={project} />
      {project.decks.map((d) => (
        <mesh key={d.id} position={[d.x + d.w / 2, d.h / 2, d.y + d.l / 2]}>
          <boxGeometry args={[d.w, d.h, d.l]} />
          <meshStandardMaterial color="#2a2a2a" roughness={0.8} />
          <Edges color="#555" />
        </mesh>
      ))}
      {project.truss.map((t) => (
        <TrussMesh key={t.id} t={t} />
      ))}
      {project.hoists.map((h) => {
        const t = project.truss.find((tt) => distToSeg(tt, h.x, h.y) < 0.5)
        const y = t?.height ?? 8
        return (
          <group key={h.id} position={[h.x, y + 0.5, h.y]}>
            <mesh>
              <boxGeometry args={[0.3, 0.4, 0.3]} />
              <meshStandardMaterial color="#888" />
            </mesh>
            <mesh position={[0, 3, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 6]} />
              <meshBasicMaterial color="#666" />
            </mesh>
          </group>
        )
      })}
      {project.screens.map((s) => (
        <ScreenMesh key={s.id} s={s} project={project} content={content} />
      ))}
      <Fixtures project={project} beams={beams && night} />
    </>
  )
}

function distToSeg(t: Truss, px: number, py: number) {
  const dx = t.x2 - t.x1
  const dy = t.y2 - t.y1
  const L2 = dx * dx + dy * dy || 1
  const u = Math.min(1, Math.max(0, ((px - t.x1) * dx + (py - t.y1) * dy) / L2))
  return Math.hypot(px - (t.x1 + u * dx), py - (t.y1 + u * dy))
}

function useContent(src: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!src) return setTex(null)
    if (src.endsWith('#img')) {
      const t = new THREE.TextureLoader().load(src.replace('#img', ''))
      t.colorSpace = THREE.SRGBColorSpace
      setTex(t)
      return () => t.dispose()
    }
    const v = document.createElement('video')
    v.src = src
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.play()
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

// Generated test pattern: panel grid, centre cross, name and resolution.
export function testPattern(s: Screen, pxW: number, pxH: number, cols: number, rows: number, virtual: number[] = []) {
  const scale = Math.min(1, 2048 / Math.max(pxW, pxH))
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(pxW * scale))
  c.height = Math.max(2, Math.round(pxH * scale))
  const g = c.getContext('2d')!
  const cw = c.width / cols
  const ch = c.height / rows
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const v = 18 + ((r + k) % 2) * 14
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(k * cw, r * ch, cw, ch)
    }
  const grad = g.createLinearGradient(0, 0, c.width, 0)
  grad.addColorStop(0, s.color + '55')
  grad.addColorStop(0.5, s.color + 'aa')
  grad.addColorStop(1, s.color + '55')
  g.fillStyle = grad
  g.fillRect(0, c.height * 0.38, c.width, c.height * 0.24)
  g.strokeStyle = '#ffffff40'
  g.lineWidth = Math.max(1, c.width / 800)
  for (let k = 0; k <= cols; k++) (g.beginPath(), g.moveTo(k * cw, 0), g.lineTo(k * cw, c.height), g.stroke())
  for (let r = 0; r <= rows; r++) (g.beginPath(), g.moveTo(0, r * ch), g.lineTo(c.width, r * ch), g.stroke())
  g.strokeStyle = '#ffffffaa'
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(c.width, c.height)
  g.moveTo(c.width, 0)
  g.lineTo(0, c.height)
  g.stroke()
  g.beginPath()
  g.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.42, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const fs = Math.min(c.height * 0.14, c.width / Math.max(4, s.name.length) * 1.2)
  g.font = `700 ${fs}px "Inter Tight", Inter, sans-serif`
  g.fillText(s.name, c.width / 2, c.height / 2 - fs * 0.15)
  g.font = `500 ${fs * 0.38}px "JetBrains Mono", monospace`
  g.fillText(`${pxW} × ${pxH}`, c.width / 2, c.height / 2 + fs * 0.6)
  g.fillStyle = '#000'
  for (const i of virtual) g.fillRect((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch)
  return c
}

function ScreenMesh({ s, project, content }: { s: Screen; project: Project; content: THREE.Texture | null }) {
  const st = screenStats(s, project.customPanels)
  const cols = screenColumns(s, st.panel)
  const cw = st.panel.w / 1000
  const [img, setImg] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!s.image) return setImg(null)
    const t = new THREE.TextureLoader().load(s.image)
    t.colorSpace = THREE.SRGBColorSpace
    setImg(t)
    return () => t.dispose()
  }, [s.image])
  const pattern = useMemo(() => {
    const t = new THREE.CanvasTexture(testPattern(s, st.pxW, st.pxH, s.cols, s.rows))
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [s, st.pxW, st.pxH])
  const base = content ?? img ?? pattern
  // One texture clone per column so each shows its slice of the image.
  const texes = useMemo(
    () =>
      cols.map((_, i) => {
        const t = base.clone()
        t.needsUpdate = true
        t.repeat.set(1 / s.cols, 1)
        t.offset.set(i / s.cols, 0)
        return t
      }),
    [base, cols.length, s.cols],
  )
  const virtual = new Set(s.virtual)
  return (
    <group>
      {cols.map((c, i) => (
        <group key={i} position={[c.x, s.z + st.h / 2, c.y]} rotation-y={-c.angle}>
          <mesh position={[0, 0, -0.06]}>
            <boxGeometry args={[cw, st.h, 0.1]} />
            <meshStandardMaterial color="#0d0d0d" />
          </mesh>
          <mesh>
            <planeGeometry args={[cw * 0.995, st.h]} />
            <meshBasicMaterial map={texes[i]} toneMapped={false} />
          </mesh>
          {Array.from({ length: s.rows }, (_, r) =>
            virtual.has(r * s.cols + i) ? (
              <mesh key={r} position={[0, st.h / 2 - (r + 0.5) * (st.panel.h / 1000), 0.005]}>
                <planeGeometry args={[cw, st.panel.h / 1000]} />
                <meshBasicMaterial color="#000" />
              </mesh>
            ) : null,
          )}
        </group>
      ))}
    </group>
  )
}

function TrussMesh({ t }: { t: Truss }) {
  const size = TRUSS_INFO[t.type].size
  const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
  const ang = Math.atan2(t.y2 - t.y1, t.x2 - t.x1)
  const geom = useMemo(() => trussGeometry(len, size), [len, size])
  const towerGeom = useMemo(() => trussGeometry(t.height, size), [t.height, size])
  return (
    <group>
      <group position={[t.x1, t.height + size / 2, t.y1]} rotation-y={-ang}>
        <lineSegments geometry={geom}>
          <lineBasicMaterial color="#cfcfcf" />
        </lineSegments>
      </group>
      {t.legs &&
        [
          [t.x1, t.y1],
          [t.x2, t.y2],
        ].map(([x, y], i) => (
          <group key={i} position={[x, 0, y]} rotation-z={Math.PI / 2}>
            <lineSegments geometry={towerGeom}>
              <lineBasicMaterial color="#9a9a9a" />
            </lineSegments>
          </group>
        ))}
    </group>
  )
}

// Box-truss lattice as line segments along +X, centred on the chord axis.
function trussGeometry(len: number, s: number) {
  const h = s / 2
  const corners = [
    [-h, -h],
    [-h, h],
    [h, h],
    [h, -h],
  ]
  const pts: number[] = []
  for (const [y, z] of corners) pts.push(0, y, z, len, y, z)
  const n = Math.max(1, Math.round(len / s))
  for (let i = 0; i < n; i++) {
    const a = (i * len) / n
    const b = ((i + 1) * len) / n
    for (let k = 0; k < 4; k++) {
      const [y1, z1] = corners[k]
      const [y2, z2] = corners[(k + 1) % 4]
      pts.push(i % 2 ? a : b, y1, z1, i % 2 ? b : a, y2, z2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  return g
}

function GroundItems({ project }: { project: Project }) {
  return (
    <>
      {project.ground
        .filter((g) => !['crowd', 'seating', 'label'].includes(g.kind))
        .map((g) => {
          const tall = ['foh', 'greenroom', 'washroom', 'food', 'generator', 'delay', 'camera'].includes(g.kind)
          const h = g.kind === 'barricade' ? 1.1 : g.kind === 'delay' ? 6 : tall ? 2.6 : 0.05
          return (
            <mesh key={g.id} position={[g.x + g.w / 2, h / 2, g.y + g.h / 2]} rotation-y={(-g.rotation * Math.PI) / 180}>
              <boxGeometry args={[g.w, h, g.h]} />
              <meshStandardMaterial color={g.kind === 'exit' ? '#ffffff' : g.kind === 'vip' ? '#1d1d1d' : '#202020'} transparent opacity={tall || g.kind === 'barricade' ? 0.9 : 0.6} />
              <Edges color="#444" />
            </mesh>
          )
        })}
    </>
  )
}

function Crowd({ project }: { project: Project }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const positions = useMemo(() => {
    const out: [number, number, number][] = []
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const zones = project.ground.filter((g) => g.kind === 'crowd' || g.kind === 'vip' || g.kind === 'seating')
    const total = zones.reduce((a, g) => a + g.w * g.h, 0) || 1
    const budget = Math.min(2500, project.audience || 1000)
    for (const z of zones) {
      const n = Math.round((budget * z.w * z.h) / total)
      for (let i = 0; i < n; i++) out.push([z.x + rnd() * z.w, 0.85, z.y + rnd() * z.h])
    }
    return out
  }, [project.ground, project.audience])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    positions.forEach((p, i) => {
      o.position.set(...p)
      o.scale.setScalar(0.85 + ((i * 37) % 30) / 100)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [positions])
  if (!positions.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]}>
      <capsuleGeometry args={[0.18, 1.1, 2, 6]} />
      <meshStandardMaterial color="#4a4a4a" />
    </instancedMesh>
  )
}

function Fixtures({ project, beams }: { project: Project; beams: boolean }) {
  return (
    <>
      {project.fixtures.map((f, i) => {
        if (f.kind === 'sub')
          return (
            <mesh key={f.id} position={[f.x, 0.4, f.y]}>
              <boxGeometry args={[0.8, 0.8, 0.8]} />
              <meshStandardMaterial color="#151515" />
              <Edges color="#333" />
            </mesh>
          )
        if (f.kind === 'line-array')
          return (
            <mesh key={f.id} position={[f.x, f.z - 0.6, f.y]}>
              <boxGeometry args={[1.1, 0.32, 0.6]} />
              <meshStandardMaterial color="#141414" />
              <Edges color="#3a3a3a" />
            </mesh>
          )
        const beamLen = Math.max(2, f.z)
        const tilt = ((i % 5) - 2) * 0.18
        return (
          <group key={f.id} position={[f.x, f.z - 0.2, f.y]}>
            <mesh>
              <cylinderGeometry args={[0.15, 0.2, 0.35, 12]} />
              <meshStandardMaterial color="#222" />
            </mesh>
            {beams && FIXTURE_INFO[f.kind].watts > 0 && (
              <mesh position={[Math.sin(tilt) * beamLen * 0.5, -beamLen / 2, 2 + Math.cos(tilt) * 0.5]} rotation={[0.25, 0, tilt]}>
                <coneGeometry args={[f.kind === 'beam' ? 0.25 : 0.9, beamLen, 16, 1, true]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={f.kind === 'par' ? 0.035 : 0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}
