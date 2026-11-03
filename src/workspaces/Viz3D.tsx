import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Environment, Html, Lightformer, MeshReflectorMaterial, OrbitControls, Sky, Stars } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { Camera, Clapperboard, Eye, Film, Orbit, Tag, Users, Waves, X } from 'lucide-react'
import { useStore } from '../store'
import type { Fixture, GroundItem, Project, Screen, Truss } from '../types'
import { fmt, screenColumns, screenStats, stageBounds, TRUSS_INFO, trussLength } from '../lib/calc'
import { GROUND_LABELS } from '../lib/export/labels'

RectAreaLightUniformsLib.init()

type Preset = 'audience' | 'last' | 'foh' | 'stage' | 'drone' | 'side'
export type Look = 'show' | 'day' | 'tech'
export type Palette = 'white' | 'warm' | 'ice' | 'duo' | 'rainbow'
type RecordReq = { aspect: '16:9' | '9:16'; seconds: number; id: number }
type Info = { title: string; lines: string[] }

const PRESETS: [Preset, string][] = [
  ['audience', 'Audience'],
  ['last', 'Last row'],
  ['foh', 'FOH'],
  ['side', 'Side'],
  ['stage', 'Stage POV'],
  ['drone', 'Drone'],
]

const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: 'white', label: 'White', swatch: '#ffffff' },
  { id: 'warm', label: 'Warm', swatch: '#ffb36b' },
  { id: 'ice', label: 'Ice', swatch: '#8fd3ff' },
  { id: 'duo', label: 'Magenta / blue', swatch: 'linear-gradient(135deg,#ff2bd6 50%,#4b5bff 50%)' },
  { id: 'rainbow', label: 'Colour chase', swatch: 'conic-gradient(#f33,#fd3,#3f6,#3cf,#a3f,#f33)' },
]

export function Viz3DWorkspace() {
  const project = useStore((s) => s.project)
  return <Viewer project={project} />
}

export function Viewer({ project, compact }: { project: Project; compact?: boolean }) {
  const [preset, setPreset] = useState<Preset>('audience')
  const [camReq, setCamReq] = useState(0)
  const [look, setLook] = useState<Look>('show')
  const [palette, setPalette] = useState<Palette>('duo')
  const [motion, setMotion] = useState(true)
  const [crowd, setCrowd] = useState(true)
  const [labels, setLabels] = useState(false)
  const [showcase, setShowcase] = useState(!!compact)
  const [video, setVideo] = useState<string | null>(null)
  const [shotReq, setShotReq] = useState(0)
  const [rec, setRec] = useState<RecordReq | null>(null)
  const [recProgress, setRecProgress] = useState(0)
  const [recMenu, setRecMenu] = useState(false)
  const [info, setInfo] = useState<Info | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const notify = useStore((s) => s.notify)

  const go = (p: Preset) => {
    setPreset(p)
    setCamReq((n) => n + 1)
    setShowcase(false)
  }
  const bg = look === 'tech' ? '#ededed' : look === 'day' ? '#b9c6d3' : '#000'

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: bg }}>
      <Canvas
        shadows
        dpr={[1, compact ? 1.5 : 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 50, near: 0.1, far: 3000, position: [0, 20, 60] }}
        onPointerMissed={() => setInfo(null)}
      >
        <Scene
          project={project}
          preset={preset}
          camReq={camReq}
          look={look}
          palette={palette}
          motion={motion}
          crowd={crowd}
          labels={labels || look === 'tech'}
          showcase={showcase}
          video={video}
          shotReq={shotReq}
          rec={rec}
          compact={!!compact}
          onInfo={setInfo}
          onRecProgress={setRecProgress}
          onRecDone={(ok) => {
            setRec(null)
            setRecProgress(0)
            notify(ok ? 'Walkthrough video downloaded' : 'This browser cannot record video. Try Chrome or Edge.')
          }}
          onShowcaseStop={() => setShowcase(false)}
        />
      </Canvas>

      {/* Camera bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-max glass rounded-xl flex flex-wrap items-center justify-center gap-1 p-1 max-w-[95vw] z-10">
        {PRESETS.filter(([k]) => !compact || k !== 'stage').map(([k, l]) => (
          <button key={k} className={`btn h-8 ${preset === k && !showcase ? 'btn-on' : ''}`} onClick={() => go(k)}>
            {l}
          </button>
        ))}
        <div className="w-px h-5 bg-line mx-1" />
        <button className={`btn h-8 ${showcase ? 'btn-on' : ''}`} title="Slowly orbit the stage" onClick={() => setShowcase(!showcase)}>
          <Orbit size={14} /> Showcase
        </button>
      </div>

      {/* Look bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-max glass rounded-xl flex flex-wrap items-center justify-center gap-1 p-1 max-w-[95vw] z-10">
        {(
          [
            ['show', 'Night show'],
            ['day', 'Daylight'],
            ['tech', 'Technical'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`btn h-8 ${look === k ? 'btn-on' : ''}`} onClick={() => setLook(k)}>
            {l}
          </button>
        ))}
        {look === 'show' && (
          <>
            <div className="w-px h-5 bg-line mx-1" />
            {PALETTES.map((p) => (
              <button
                key={p.id}
                title={`Lights: ${p.label}`}
                aria-label={`Lights: ${p.label}`}
                onClick={() => setPalette(p.id)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${palette === p.id ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
                style={{ background: p.swatch }}
              />
            ))}
            <button className={`btn btn-icon h-8 w-8 ${motion ? 'btn-on' : ''}`} title="Moving lights" onClick={() => setMotion(!motion)}>
              <Waves size={14} />
            </button>
          </>
        )}
        <div className="w-px h-5 bg-line mx-1" />
        <button className={`btn btn-icon h-8 w-8 ${crowd ? 'btn-on' : ''}`} title="Show audience" onClick={() => setCrowd(!crowd)}>
          <Users size={14} />
        </button>
        {look !== 'tech' && (
          <button className={`btn btn-icon h-8 w-8 ${labels ? 'btn-on' : ''}`} title="Dimension labels" onClick={() => setLabels(!labels)}>
            <Tag size={14} />
          </button>
        )}
        {!compact && (
          <>
            <div className="w-px h-5 bg-line mx-1" />
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) setVideo(URL.createObjectURL(f) + (f.type.startsWith('image') ? '#img' : ''))
                e.target.value = ''
              }}
            />
            <button className={`btn h-8 ${video ? 'btn-on' : ''}`} title="Play your own video or image on every screen (stays on this computer)" onClick={() => (video ? setVideo(null) : fileRef.current?.click())}>
              <Film size={14} /> {video ? 'Stop content' : 'Play content'}
            </button>
            <button className="btn h-8" title="High-resolution still from this camera" onClick={() => setShotReq((n) => n + 1)}>
              <Camera size={14} /> Render
            </button>
            <div className="relative">
              <button className="btn h-8" onClick={() => setRecMenu(!recMenu)} disabled={!!rec}>
                <Clapperboard size={14} /> Video
              </button>
              {recMenu && (
                <div className="absolute bottom-10 right-0 card p-1 w-56 fade-in" onMouseLeave={() => setRecMenu(false)}>
                  {(
                    [
                      ['16:9', 'Walkthrough 16:9', 'For presentations · 1920×1080'],
                      ['9:16', 'Social reel 9:16', 'For Instagram / WhatsApp · 1080×1920'],
                    ] as const
                  ).map(([a, t, s]) => (
                    <button
                      key={a}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-lift"
                      onClick={() => {
                        setRecMenu(false)
                        setShowcase(false)
                        setRec({ aspect: a, seconds: 12, id: Date.now() })
                      }}
                    >
                      <div className="text-xs font-medium">{t}</div>
                      <div className="text-[10px] text-mute">{s}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {info && (
        <div className="absolute right-4 top-20 z-10 glass rounded-xl p-4 w-64 fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold">{info.title}</div>
            <button className="text-mute hover:text-white" onClick={() => setInfo(null)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {info.lines.map((l) => (
              <div key={l} className="mono text-[11px] text-dim">
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && !rec && (
        <div className={`absolute left-4 bottom-4 text-[11px] hidden xl:flex items-center gap-1.5 ${look === 'show' ? 'text-mute' : 'text-black/50'}`}>
          <Eye size={12} /> Drag to orbit · right-drag to pan · scroll to zoom · click anything for details
        </div>
      )}

      {rec && (
        <div className="absolute inset-0 z-20 bg-black/85 flex items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-3 w-3 rounded-full bg-err animate-pulse" />
            <div className="font-display text-lg font-semibold mt-3">Recording {rec.aspect} walkthrough</div>
            <div className="text-xs text-dim mt-1">Keep this tab open. The video downloads when it finishes.</div>
            <div className="w-64 h-1 bg-line rounded-full mt-4 overflow-hidden mx-auto">
              <div className="h-full bg-white transition-all" style={{ width: `${Math.round(recProgress * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- scene

interface SceneProps {
  project: Project
  preset: Preset
  camReq: number
  look: Look
  palette: Palette
  motion: boolean
  crowd: boolean
  labels: boolean
  showcase: boolean
  video: string | null
  shotReq: number
  rec: RecordReq | null
  compact: boolean
  onInfo: (i: Info) => void
  onRecProgress: (p: number) => void
  onRecDone: (ok: boolean) => void
  onShowcaseStop: () => void
}

function focusOf(project: Project) {
  const sb = stageBounds(project)
  const W = project.venue.w
  const L = project.venue.l
  const screenTop = Math.max(4, ...project.screens.map((s) => s.z + screenStats(s, project.customPanels).h))
  const front = sb ? sb.y + sb.l : 8
  return { sb, W, L, front, screenTop, target: new THREE.Vector3(W / 2, screenTop * 0.45, (sb?.y ?? 2) + 1.5) }
}

function Scene(props: SceneProps) {
  const { project, preset, camReq, look, palette, motion, crowd, labels, showcase, video, shotReq, rec, compact, onInfo } = props
  const controls = useRef<OrbitImpl>(null)
  const { camera, gl, scene, size, setSize, setDpr, viewport } = useThree()
  const f = useMemo(() => focusOf(project), [project])
  const { W, L, sb } = f
  const fly = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const show = look === 'show'

  useEffect(() => {
    if (look === 'tech') {
      scene.background = new THREE.Color('#ededed')
      scene.fog = null
    } else if (look === 'day') {
      scene.background = null
      scene.fog = new THREE.Fog('#c3ced8', 120, 700)
    } else {
      scene.background = new THREE.Color('#000000')
      scene.fog = new THREE.FogExp2('#000000', 0.0065)
    }
  }, [look, scene])

  // Smooth camera moves between presets.
  const cameraFor = (p: Preset) => {
    const { target, front, screenTop } = f
    const cx = W / 2
    const foh = project.ground.find((g) => g.kind === 'foh')
    const big = Math.max(W, L)
    const pos: Record<Preset, [number, number, number]> = {
      audience: [cx + 2, 1.7, Math.min(L - 2, front + 12)],
      last: [cx, 1.8, L - 2],
      foh: [cx, 3.2, foh ? foh.y + foh.h / 2 : front + 25],
      side: [cx + W * 0.55, screenTop * 0.8, front + 4],
      stage: [cx, (sb?.h ?? 1) + 1.7, (sb?.y ?? 2) + 1.5],
      drone: [cx + big * 0.35, big * 0.38, Math.min(L + 10, front + big * 0.45)],
    }
    const t = p === 'stage' ? new THREE.Vector3(cx, 2, L * 0.7) : target.clone()
    const at = new THREE.Vector3(...pos[p])
    // Portrait screens (phones) see less width, so step back to keep the stage in frame.
    const aspect = size.width / Math.max(1, size.height)
    if (aspect > 0.1 && aspect < 1 && p !== 'stage') {
      const k = Math.min(1.6, 1 / aspect)
      const dist = at.distanceTo(t)
      // Step back and up so the crowd doesn't block the view.
      at.sub(t).multiplyScalar(k).add(t)
      at.y += (k - 1) * dist * 0.22
    }
    return { pos: at, target: t }
  }

  const first = useRef(true)
  useEffect(() => {
    const c = cameraFor(preset)
    if (first.current) {
      // Start a little further out and glide in.
      first.current = false
      camera.position.copy(c.pos.clone().add(new THREE.Vector3(W * 0.2, Math.max(W, L) * 0.25, 20)))
      controls.current?.target.copy(f.target)
    }
    fly.current = c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camReq, preset, W, L, size.width < size.height])

  // A wider lens on portrait screens.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = size.width < size.height ? 64 : 50
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height])

  useFrame((_, dt) => {
    const ctl = controls.current
    if (!ctl || rec) return
    if (fly.current) {
      const k = 1 - Math.exp(-dt * 3.2)
      camera.position.lerp(fly.current.pos, k)
      ctl.target.lerp(fly.current.target, k)
      if (camera.position.distanceTo(fly.current.pos) < 0.05) fly.current = null
    }
    ctl.update()
  })

  // High-resolution PNG still.
  useEffect(() => {
    if (!shotReq) return
    const prev = viewport.dpr
    setDpr(Math.min(4, Math.max(prev, 3840 / size.width)))
    const t = setTimeout(() => {
      const a = document.createElement('a')
      a.href = gl.domElement.toDataURL('image/png')
      a.download = `${project.name.replace(/\s+/g, '-')}-render.png`
      a.click()
      setDpr(prev)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotReq])

  const content = useContent(video)

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={showcase}
        autoRotateSpeed={0.6}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={2}
        maxDistance={Math.max(W, L) * 3}
        onStart={() => {
          fly.current = null
          if (showcase) props.onShowcaseStop()
        }}
      />
      {rec && <Recorder req={rec} focus={f} setSize={setSize} size={size} setDpr={setDpr} dpr={viewport.dpr} onProgress={props.onRecProgress} onDone={props.onRecDone} controls={controls} />}

      <Lighting look={look} W={W} L={L} />
      <Ground project={project} look={look} compact={compact} />
      <GroundItems project={project} look={look} />
      {crowd && <Crowd project={project} look={look} motion={motion} compact={compact} />}
      <StageDecks project={project} look={look} onInfo={onInfo} />
      {project.truss.map((t) => (
        <TrussMesh key={t.id} t={t} onInfo={onInfo} />
      ))}
      <Hoists project={project} />
      {project.screens.map((s) => (
        <ScreenMesh key={s.id} s={s} project={project} content={content} look={look} onInfo={onInfo} />
      ))}
      <Fixtures project={project} look={look} palette={palette} motion={motion} />
      {labels && <Labels project={project} look={look} />}

      {show && (
        <EffectComposer multisampling={compact ? 0 : 4}>
          <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={1.1} radius={0.75} />
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  )
}

function Lighting({ look, W, L }: { look: Look; W: number; L: number }) {
  const show = look === 'show'
  const big = Math.max(W, L)
  return (
    <>
      <ambientLight intensity={show ? 0.12 : look === 'tech' ? 0.9 : 0.45} />
      <hemisphereLight args={[look === 'day' ? '#cfe3ff' : '#ffffff', '#202020', show ? 0.15 : 0.55]} />
      <directionalLight
        castShadow={!show}
        position={[W / 2 + big * 0.4, big * 0.8, L * 0.9]}
        intensity={show ? 0.25 : look === 'day' ? 2.2 : 1.4}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-big}
        shadow-camera-right={big}
        shadow-camera-top={big}
        shadow-camera-bottom={-big}
        shadow-camera-far={big * 4}
        shadow-bias={-0.0004}
      >
        <object3D attach="target" position={[W / 2, 0, L / 2]} />
      </directionalLight>
      {look === 'day' && <Sky distance={2500} sunPosition={[W / 2 + big, big * 0.7, L * 2]} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} />}
      {show && <Stars radius={600} depth={80} count={2500} factor={8} fade speed={0.4} />}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={show ? 0.6 : 2} position={[0, 6, -10]} scale={[20, 4, 1]} />
        <Lightformer form="rect" intensity={show ? 0.3 : 1} position={[-12, 4, 6]} rotation-y={Math.PI / 2} scale={[20, 2, 1]} />
        <Lightformer form="rect" intensity={show ? 0.3 : 1} position={[12, 4, 6]} rotation-y={-Math.PI / 2} scale={[20, 2, 1]} />
      </Environment>
    </>
  )
}

function Ground({ project, look, compact }: { project: Project; look: Look; compact: boolean }) {
  const W = project.venue.w
  const L = project.venue.l
  const tex = useVenueImage(project)
  const grid = useMemo(() => {
    const g = new THREE.GridHelper(Math.max(W, L), Math.round(Math.max(W, L)), look === 'tech' ? '#bdbdbd' : '#262626', look === 'tech' ? '#d6d6d6' : '#141414')
    ;(g.material as THREE.Material).transparent = true
    ;(g.material as THREE.Material).opacity = look === 'show' ? 0.5 : 0.8
    return g
  }, [W, L, look])
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.01, L / 2]} receiveShadow>
        <planeGeometry args={[W + 400, L + 400]} />
        {look === 'show' && !compact ? (
          <MeshReflectorMaterial
            blur={[400, 120]}
            resolution={512}
            mixBlur={1}
            mixStrength={4}
            roughness={0.9}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#0a0a0a"
            metalness={0.6}
            mirror={0}
          />
        ) : (
          <meshStandardMaterial color={look === 'tech' ? '#e4e4e4' : look === 'day' ? '#55584f' : '#080808'} roughness={1} />
        )}
      </mesh>
      {/* Venue floor */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0, L / 2]} receiveShadow>
        <planeGeometry args={[W, L]} />
        {tex ? (
          <meshStandardMaterial map={tex} roughness={1} transparent opacity={look === 'show' ? 0.35 : 0.9} />
        ) : (
          <meshStandardMaterial color={look === 'tech' ? '#f6f6f6' : look === 'day' ? '#6b6b66' : '#0c0c0c'} roughness={look === 'show' ? 0.6 : 1} transparent opacity={look === 'show' ? 0.6 : 1} />
        )}
      </mesh>
      <primitive object={grid} position={[W / 2, 0.01, L / 2]} />
      <lineSegments position={[W / 2, 0.02, L / 2]} rotation-x={-Math.PI / 2}>
        <edgesGeometry args={[new THREE.PlaneGeometry(W, L)]} />
        <lineBasicMaterial color={look === 'tech' ? '#888' : '#555'} />
      </lineSegments>
    </>
  )
}

function useVenueImage(project: Project) {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!project.venue.image) return setTex(null)
    const t = new THREE.TextureLoader().load(project.venue.image)
    t.colorSpace = THREE.SRGBColorSpace
    setTex(t)
    return () => t.dispose()
  }, [project.venue.image])
  return tex
}

// ---------------------------------------------------------------- video recorder

function Recorder({
  req,
  focus,
  setSize,
  size,
  setDpr,
  dpr,
  onProgress,
  onDone,
  controls,
}: {
  req: RecordReq
  focus: ReturnType<typeof focusOf>
  setSize: (w: number, h: number) => void
  size: { width: number; height: number }
  setDpr: (d: number) => void
  dpr: number
  onProgress: (p: number) => void
  onDone: (ok: boolean) => void
  controls: RefObject<OrbitImpl | null>
}) {
  const { gl, camera } = useThree()
  const start = useRef<number | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const done = useRef(false)

  useEffect(() => {
    const prev = { w: size.width, h: size.height, dpr }
    const [w, h] = req.aspect === '16:9' ? [1920, 1080] : [1080, 1920]
    setDpr(1)
    setSize(w, h)
    const types = ['video/mp4;codecs=avc3.640028', 'video/mp4;codecs=avc1.640028', 'video/webm;codecs=vp9', 'video/webm']
    const mime = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
    if (!mime || !gl.domElement.captureStream) {
      onDone(false)
      return
    }
    const stream = gl.domElement.captureStream(30)
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 14_000_000 })
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mime })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `walkthrough-${req.aspect.replace(':', 'x')}.${mime.includes('mp4') ? 'mp4' : 'webm'}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      onDone(true)
    }
    // Give the resized canvas a frame before recording.
    const t = setTimeout(() => {
      start.current = performance.now()
      mr.start(250)
    }, 300)
    recorder.current = mr
    return () => {
      clearTimeout(t)
      if (mr.state !== 'inactive') mr.stop()
      const parent = gl.domElement.parentElement?.getBoundingClientRect()
      setSize(parent?.width ?? prev.w, parent?.height ?? prev.h)
      setDpr(prev.dpr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.id])

  useFrame(() => {
    if (start.current == null || done.current) return
    const t = Math.min(1, (performance.now() - start.current) / (req.seconds * 1000))
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    const { W, L, front, target, screenTop } = focus
    const big = Math.max(W, L)
    const portrait = req.aspect === '9:16' ? 1.5 : 1
    const ang = THREE.MathUtils.lerp(-1.0, 0.75, e)
    const r = THREE.MathUtils.lerp(big * 0.7, Math.max(10, front - target.z + 12), e) * portrait
    const hgt = THREE.MathUtils.lerp(big * 0.42, 2.2 + screenTop * 0.08, Math.pow(e, 0.8))
    camera.position.set(target.x + Math.sin(ang) * r, hgt, target.z + Math.cos(ang) * r)
    camera.lookAt(target)
    controls.current?.target.copy(target)
    onProgress(t)
    if (t >= 1) {
      done.current = true
      recorder.current?.stop()
    }
  })
  return null
}

// ---------------------------------------------------------------- content and screens

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
  const fs = Math.min(c.height * 0.14, (c.width / Math.max(4, s.name.length)) * 1.2)
  g.font = `700 ${fs}px "Inter Tight", Inter, sans-serif`
  g.fillText(s.name, c.width / 2, c.height / 2 - fs * 0.15)
  g.font = `500 ${fs * 0.38}px "JetBrains Mono", monospace`
  g.fillText(`${pxW} × ${pxH}`, c.width / 2, c.height / 2 + fs * 0.6)
  g.fillStyle = '#000'
  for (const i of virtual) g.fillRect((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch)
  return c
}

function pointer(on: boolean) {
  document.body.style.cursor = on ? 'pointer' : ''
}

function ScreenMesh({ s, project, content, look, onInfo }: { s: Screen; project: Project; content: THREE.Texture | null; look: Look; onInfo: (i: Info) => void }) {
  const st = screenStats(s, project.customPanels)
  const cols = screenColumns(s, st.panel)
  const cw = st.panel.w / 1000
  const ch = st.panel.h / 1000
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
    t.anisotropy = 8
    return t
  }, [s, st.pxW, st.pxH])
  const base = content ?? img ?? pattern
  // One texture per column sharing the same image, so each column shows its slice.
  const texes = useMemo(
    () =>
      cols.map((_, i) => {
        const t = new THREE.Texture(base.image)
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 8
        t.repeat.set(1 / s.cols, 1)
        t.offset.set(i / s.cols, 0)
        t.needsUpdate = true
        return t
      }),
    [base, cols.length, s.cols],
  )
  useEffect(() => () => texes.forEach((t) => t.dispose()), [texes])
  const isVideo = base.image instanceof HTMLVideoElement
  useFrame(() => {
    if (!isVideo) return
    const v = base.image as HTMLVideoElement
    if (v.readyState >= 2) for (const t of texes) t.needsUpdate = true
  })
  const virtual = new Set(s.virtual)
  const glow = look === 'show' ? 1.6 : look === 'day' ? 1.15 : 1
  const mid = cols[Math.floor(cols.length / 2)]
  const info = () =>
    onInfo({
      title: s.name,
      lines: [
        `${fmt(st.w, 2)} × ${fmt(st.h, 2)} m · ${s.cols}×${s.rows} cabinets`,
        `${st.pxW} × ${st.pxH} px · ${st.panel.pitch} mm pitch`,
        `${Math.round(st.weight)} kg · ${fmt(st.maxW / 1000, 1)} kW max`,
        `Bottom at ${fmt(s.z, 2)} m · ${s.mount}`,
        s.shape === 'flat' ? 'Flat' : `${s.shape} ${s.curveDeg}° per column`,
      ],
    })
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), info())}
      onPointerOver={(e) => (e.stopPropagation(), pointer(true))}
      onPointerOut={() => pointer(false)}
    >
      {cols.map((c, i) => (
        <group key={i} position={[c.x, s.z + st.h / 2, c.y]} rotation-y={-c.angle}>
          <mesh position={[0, 0, -0.07]} castShadow>
            <boxGeometry args={[cw, st.h, 0.12]} />
            <meshStandardMaterial color="#0b0b0b" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh>
            <planeGeometry args={[cw * 0.997, st.h]} />
            <meshBasicMaterial map={texes[i]} color={[glow, glow, glow]} toneMapped={false} />
          </mesh>
          {Array.from({ length: s.rows }, (_, r) =>
            virtual.has(r * s.cols + i) ? (
              <mesh key={r} position={[0, st.h / 2 - (r + 0.5) * ch, 0.005]}>
                <planeGeometry args={[cw * 1.002, ch]} />
                <meshBasicMaterial color="#000" />
              </mesh>
            ) : null,
          )}
        </group>
      ))}
      {/* Light the stage with the screen's glow at night */}
      {look === 'show' && mid && (
        <rectAreaLight
          width={st.w}
          height={st.h}
          intensity={0.9}
          color={s.color}
          position={[mid.x, s.z + st.h / 2, mid.y + 0.05]}
          rotation={[0, -mid.angle, 0]}
          onUpdate={(l: THREE.RectAreaLight) => l.lookAt(mid.x - Math.sin(mid.angle) * 10, s.z + st.h / 2, mid.y + Math.cos(mid.angle) * 10)}
        />
      )}
      {s.mount === 'ground' && s.z > 0.05 && (
        <mesh position={[mid.x, s.z / 2, mid.y - 0.3]} castShadow>
          <boxGeometry args={[st.w * 0.9, s.z, 0.08]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.5} roughness={0.6} />
        </mesh>
      )}
    </group>
  )
}

// ---------------------------------------------------------------- stage

function StageDecks({ project, look, onInfo }: { project: Project; look: Look; onInfo: (i: Info) => void }) {
  const sb = stageBounds(project)
  const top = useMemo(() => new THREE.MeshStandardMaterial({ color: look === 'tech' ? '#3a3a3a' : '#151515', roughness: 0.55, metalness: 0.05 }), [look])
  const skirt = useMemo(() => new THREE.MeshStandardMaterial({ color: look === 'tech' ? '#2a2a2a' : '#060606', roughness: 1 }), [look])
  const mats = useMemo(() => [skirt, skirt, top, skirt, skirt, skirt], [top, skirt])
  if (!sb) return null
  const frontY = sb.y + sb.l
  const info = () =>
    onInfo({
      title: 'Stage',
      lines: [`${fmt(sb.w)} × ${fmt(sb.l)} m`, `Height up to ${fmt(sb.h, 2)} m`, `${project.decks.length} decks`, `${fmt(project.decks.reduce((a, d) => a + d.w * d.l, 0), 1)} m² of deck`],
    })
  return (
    <group onClick={(e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), info())} onPointerOver={() => pointer(true)} onPointerOut={() => pointer(false)}>
      {project.decks.map((d) => (
        <mesh key={d.id} position={[d.x + d.w / 2, d.h / 2, d.y + d.l / 2]} material={mats} castShadow receiveShadow>
          <boxGeometry args={[d.w, d.h, d.l]} />
          {look === 'tech' && <Edges color="#888" />}
        </mesh>
      ))}
      {/* LED edge strip along the downstage edge */}
      {look === 'show' &&
        project.decks
          .filter((d) => Math.abs(d.y + d.l - frontY) < 0.05)
          .map((d) => (
            <mesh key={`e-${d.id}`} position={[d.x + d.w / 2, d.h - 0.02, d.y + d.l + 0.006]}>
              <planeGeometry args={[d.w, 0.025]} />
              <meshBasicMaterial color={[3, 3, 3]} toneMapped={false} />
            </mesh>
          ))}
    </group>
  )
}

// ---------------------------------------------------------------- truss

const aluminium = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.95, roughness: 0.32 })
const blackMetal = new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.7, roughness: 0.45 })

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1, true)
  g.deleteAttribute('uv')
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))
  return g
}

// Truss section along +X, centred on its axis: chords plus zig-zag lacing on every face.
function trussGeometry(len: number, s: number, tri: boolean) {
  const h = s / 2
  const corners: [number, number][] = tri
    ? [
        [h, 0],
        [-h * 0.75, -h * 0.87],
        [-h * 0.75, h * 0.87],
      ]
    : [
        [-h, -h],
        [-h, h],
        [h, h],
        [h, -h],
      ]
  const parts: THREE.BufferGeometry[] = []
  for (const [y, z] of corners) parts.push(rod(new THREE.Vector3(0, y, z), new THREE.Vector3(len, y, z), 0.024))
  const n = Math.max(1, Math.round(len / s))
  for (let i = 0; i < n; i++) {
    const a = (i * len) / n
    const b = ((i + 1) * len) / n
    for (let k = 0; k < corners.length; k++) {
      const [y1, z1] = corners[k]
      const [y2, z2] = corners[(k + 1) % corners.length]
      const [x1, x2] = i % 2 ? [a, b] : [b, a]
      parts.push(rod(new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2), 0.01))
    }
  }
  const g = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  return g
}

function TrussMesh({ t, onInfo }: { t: Truss; onInfo: (i: Info) => void }) {
  const info = TRUSS_INFO[t.type]
  const size = info.size
  const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
  const ang = Math.atan2(t.y2 - t.y1, t.x2 - t.x1)
  const tri = t.type === 'tri30'
  const geom = useMemo(() => trussGeometry(len, size, tri), [len, size, tri])
  const towerGeom = useMemo(() => trussGeometry(t.height, size, tri), [t.height, size, tri])
  useEffect(() => () => (geom.dispose(), towerGeom.dispose()), [geom, towerGeom])
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onInfo({ title: info.name, lines: [`${fmt(trussLength(t), 2)} m long`, `Trim height ${fmt(t.height, 2)} m`, `${Math.round(trussLength(t) * info.kgPerM)} kg self-weight`, t.legs ? 'Ground-support towers' : 'Flown from hoists'] })
  }
  return (
    <group onClick={click} onPointerOver={() => pointer(true)} onPointerOut={() => pointer(false)}>
      <mesh geometry={geom} material={aluminium} position={[t.x1, t.height + size / 2, t.y1]} rotation-y={-ang} castShadow />
      {t.legs &&
        [
          [t.x1, t.y1],
          [t.x2, t.y2],
        ].map(([x, y], i) => (
          <group key={i} position={[x, 0, y]}>
            <mesh geometry={towerGeom} material={aluminium} rotation-z={Math.PI / 2} castShadow />
            <mesh position={[0, 0.02, 0]} material={blackMetal} receiveShadow>
              <boxGeometry args={[1.2, 0.04, 1.2]} />
            </mesh>
            <mesh position={[0, t.height + size + 0.15, 0]} material={blackMetal}>
              <boxGeometry args={[size + 0.2, 0.3, size + 0.2]} />
            </mesh>
          </group>
        ))}
    </group>
  )
}

function distToSeg(t: Truss, px: number, py: number) {
  const dx = t.x2 - t.x1
  const dy = t.y2 - t.y1
  const L2 = dx * dx + dy * dy || 1
  const u = Math.min(1, Math.max(0, ((px - t.x1) * dx + (py - t.y1) * dy) / L2))
  return Math.hypot(px - (t.x1 + u * dx), py - (t.y1 + u * dy))
}

function Hoists({ project }: { project: Project }) {
  return (
    <>
      {project.hoists.map((h) => {
        const t = project.truss.find((tt) => distToSeg(tt, h.x, h.y) < 0.5)
        const y = (t?.height ?? 8) + TRUSS_INFO[t?.type ?? 'box30'].size
        const chain = t?.legs ? 0.5 : 6
        return (
          <group key={h.id} position={[h.x, y, h.y]}>
            <mesh position={[0, 0.25, 0]} material={blackMetal} castShadow>
              <boxGeometry args={[0.28, 0.42, 0.24]} />
            </mesh>
            <mesh position={[0, 0.46 + chain / 2, 0]}>
              <cylinderGeometry args={[0.012, 0.012, chain, 4]} />
              <meshStandardMaterial color="#777" metalness={0.9} roughness={0.4} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------- ground items

function GroundItems({ project, look }: { project: Project; look: Look }) {
  const tech = look === 'tech'
  const base = tech ? '#cfcfcf' : '#1d1d1d'
  const tent = tech ? '#f9f9f9' : '#2a2a2a'
  return (
    <>
      {project.ground.map((g) => (
        <group key={g.id} position={[g.x + g.w / 2, 0, g.y + g.h / 2]} rotation-y={(-g.rotation * Math.PI) / 180}>
          <GroundItemMesh g={g} base={base} tent={tent} tech={tech} />
        </group>
      ))}
    </>
  )
}

function GroundItemMesh({ g, base, tent, tech }: { g: GroundItem; base: string; tent: string; tech: boolean }) {
  const { w, h } = g
  const tentBox = (height: number) => (
    <>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, height, h]} />
        <meshStandardMaterial color={base} roughness={0.9} />
        {tech && <Edges color="#777" />}
      </mesh>
      <mesh position={[0, height + 0.25, 0]} rotation-y={Math.PI / 4} scale={[w / Math.SQRT2, 1, h / Math.SQRT2]} castShadow>
        <coneGeometry args={[1.05, 0.5, 4]} />
        <meshStandardMaterial color={tent} roughness={0.8} />
      </mesh>
    </>
  )
  const floor = (color: string, opacity = 1) => (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={color} roughness={1} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
  switch (g.kind) {
    case 'crowd':
      return floor(tech ? '#e9e9e9' : '#141414', 0.7)
    case 'seating':
      return floor(tech ? '#dedede' : '#171717', 0.8)
    case 'vip':
      return (
        <>
          {floor(tech ? '#d4d4d4' : '#1f1a14')}
          <lineSegments position={[0, 0.9, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(w, 0.02, h)]} />
            <lineBasicMaterial color="#b89b5e" />
          </lineSegments>
        </>
      )
    case 'barricade':
      return (
        <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 1.1, Math.min(h, 1)]} />
          <meshStandardMaterial color={tech ? '#9a9a9a' : '#3d3f42'} metalness={0.7} roughness={0.4} />
        </mesh>
      )
    case 'foh':
      return (
        <>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, 0.4, h]} />
            <meshStandardMaterial color={base} />
          </mesh>
          <mesh position={[0, 0.85, h * 0.15]} castShadow>
            <boxGeometry args={[w * 0.7, 0.9, 0.9]} />
            <meshStandardMaterial color="#111" roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.33, h * 0.15 - 0.1]} rotation-x={-0.6}>
            <planeGeometry args={[w * 0.6, 0.5]} />
            <meshBasicMaterial color={[0.6, 0.7, 0.8]} toneMapped={false} />
          </mesh>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} position={[(sx * w) / 2.1, 1.5, (sz * h) / 2.1]}>
                <cylinderGeometry args={[0.04, 0.04, 3]} />
                <meshStandardMaterial color="#555" metalness={0.8} />
              </mesh>
            )),
          )}
          <mesh position={[0, 3.05, 0]} castShadow>
            <boxGeometry args={[w + 0.4, 0.1, h + 0.4]} />
            <meshStandardMaterial color={tent} />
          </mesh>
        </>
      )
    case 'delay':
      return (
        <>
          <mesh position={[0, 3, 0]} castShadow>
            <boxGeometry args={[0.4, 6, 0.4]} />
            <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.35} wireframe />
          </mesh>
          <mesh position={[0, 5.4, 0.35]} castShadow>
            <boxGeometry args={[0.9, 1.6, 0.5]} />
            <meshStandardMaterial color="#141414" />
          </mesh>
        </>
      )
    case 'camera':
      return (
        <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 1.2, h]} />
          <meshStandardMaterial color={base} />
          {tech && <Edges color="#777" />}
        </mesh>
      )
    case 'generator':
      return (
        <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, 2.5, h]} />
          <meshStandardMaterial color={tech ? '#bdbdbd' : '#22262a'} metalness={0.4} roughness={0.6} />
          {tech && <Edges color="#777" />}
        </mesh>
      )
    case 'greenroom':
    case 'washroom':
    case 'food':
      return tentBox(2.5)
    case 'entry':
    case 'exit': {
      const span = Math.max(w, h)
      const exit = g.kind === 'exit'
      return (
        <group rotation-y={h > w ? Math.PI / 2 : 0}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[(sx * span) / 2, 1.5, 0]} castShadow>
              <boxGeometry args={[0.2, 3, 0.2]} />
              <meshStandardMaterial color="#333" />
            </mesh>
          ))}
          <mesh position={[0, 3.1, 0]}>
            <boxGeometry args={[span + 0.2, 0.45, 0.15]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0, 3.1, 0.08]}>
            <planeGeometry args={[Math.min(span, 2.4), 0.3]} />
            <meshBasicMaterial color={exit ? [0.2, 2.2, 0.5] : [2, 2, 2]} toneMapped={false} />
          </mesh>
        </group>
      )
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------- crowd

function personGeometry() {
  const body = new THREE.CapsuleGeometry(0.19, 0.8, 3, 8)
  body.translate(0, 0.6 + 0.19, 0)
  const head = new THREE.SphereGeometry(0.11, 10, 8)
  head.translate(0, 1.62, 0)
  const g = mergeGeometries([body, head])!
  body.dispose()
  head.dispose()
  return g
}

function Crowd({ project, look, motion, compact }: { project: Project; look: Look; motion: boolean; compact: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const phones = useRef<THREE.InstancedMesh>(null)
  const geom = useMemo(personGeometry, [])
  const people = useMemo(() => {
    const out: { x: number; z: number; s: number; ph: number; seated: boolean }[] = []
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const zones = project.ground.filter((g) => g.kind === 'crowd' || g.kind === 'vip' || g.kind === 'seating')
    const total = zones.reduce((a, g) => a + g.w * g.h, 0) || 1
    const budget = Math.min(compact ? 1200 : 3000, project.audience || 1000)
    for (const z of zones) {
      const n = Math.round((budget * z.w * z.h) / total)
      const cx = z.x + z.w / 2
      const cy = z.y + z.h / 2
      const rot = (z.rotation * Math.PI) / 180
      for (let i = 0; i < n; i++) {
        // Crowds pack towards the front of their zone.
        const lx = (rnd() - 0.5) * z.w
        const ly = (Math.pow(rnd(), z.kind === 'crowd' ? 1.5 : 1) - 0.5) * z.h
        out.push({
          x: cx + lx * Math.cos(rot) - ly * Math.sin(rot),
          z: cy + lx * Math.sin(rot) + ly * Math.cos(rot),
          s: 0.9 + rnd() * 0.2,
          ph: rnd() * Math.PI * 2,
          seated: z.kind === 'seating',
        })
      }
    }
    return out
  }, [project.ground, project.audience, compact])
  const phoneIdx = useMemo(() => people.map((_, i) => i).filter((i) => i % 23 === 0), [people])

  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    people.forEach((p, i) => {
      o.position.set(p.x, p.seated ? -0.45 : 0, p.z)
      o.scale.setScalar(p.s)
      o.rotation.y = Math.sin(p.ph) * 0.4
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      const v = look === 'tech' ? 0.55 + (i % 7) * 0.03 : 0.12 + ((i * 13) % 17) / 100
      c.setRGB(v, v * 0.97, v * 0.95)
      m.setColorAt(i, c)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [people, look])

  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    if (look !== 'show' || !motion) return
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    // Bounce to roughly 126 BPM.
    for (let i = 0; i < people.length; i++) {
      const p = people[i]
      if (p.seated) continue
      const b = Math.max(0, Math.sin(t * 6.6 + p.ph)) * 0.07
      o.position.set(p.x, b, p.z)
      o.scale.setScalar(p.s)
      o.rotation.y = Math.sin(p.ph) * 0.4
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    const ph = phones.current
    if (ph) {
      phoneIdx.forEach((pi, k) => {
        const p = people[pi]
        const b = Math.max(0, Math.sin(t * 6.6 + p.ph)) * 0.07
        o.position.set(p.x + 0.15, 1.95 * p.s + b + Math.sin(t * 1.3 + k) * 0.05, p.z)
        o.scale.setScalar(1)
        o.updateMatrix()
        ph.setMatrixAt(k, o.matrix)
      })
      ph.instanceMatrix.needsUpdate = true
    }
  })

  useEffect(() => {
    const ph = phones.current
    if (!ph) return
    phoneIdx.forEach((pi, k) => {
      const p = people[pi]
      o.position.set(p.x + 0.15, 1.95 * p.s, p.z)
      o.scale.setScalar(1)
      o.updateMatrix()
      ph.setMatrixAt(k, o.matrix)
    })
    ph.instanceMatrix.needsUpdate = true
  }, [phoneIdx, people, o, look])

  if (!people.length) return null
  return (
    <>
      <instancedMesh ref={ref} args={[geom, undefined, people.length]} castShadow={look !== 'show'} receiveShadow>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      {look === 'show' && phoneIdx.length > 0 && (
        <instancedMesh ref={phones} args={[undefined, undefined, phoneIdx.length]}>
          <boxGeometry args={[0.05, 0.09, 0.01]} />
          <meshBasicMaterial color={[2.5, 2.5, 2.4]} toneMapped={false} />
        </instancedMesh>
      )}
    </>
  )
}

// ---------------------------------------------------------------- lights and audio

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vAlong = -position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`
const beamFragment = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
    float fall = pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.4);
    gl_FragColor = vec4(color * opacity * edge * fall, 1.0);
  }
`
// Unit cone with its tip at the origin, opening down -Y to a radius of 1 at y = -1.
const beamGeom = (() => {
  const g = new THREE.ConeGeometry(1, 1, 32, 1, true)
  g.translate(0, -0.5, 0)
  return g
})()
const poolTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
})()

function paletteColor(p: Palette, i: number, t: number, out: THREE.Color) {
  switch (p) {
    case 'white':
      return out.setRGB(1, 1, 1)
    case 'warm':
      return out.set('#ffb36b')
    case 'ice':
      return out.set('#8fd3ff')
    case 'duo':
      return out.set(i % 2 ? '#4b5bff' : '#ff2bd6')
    case 'rainbow':
      return out.setHSL((i * 0.09 + t * 0.08) % 1, 1, 0.55)
  }
}

const HALF_ANGLE: Record<Fixture['kind'], number> = { 'moving-head': 0.14, beam: 0.035, par: 0.32, blinder: 0, 'line-array': 0, sub: 0 }

function Fixtures({ project, look, palette, motion }: { project: Project; look: Look; palette: Palette; motion: boolean }) {
  const cx = project.venue.w / 2
  return (
    <>
      {project.fixtures.map((f, i) => {
        if (f.kind === 'sub') return <Sub key={f.id} f={f} />
        if (f.kind === 'line-array') return <LineArray key={f.id} f={f} cx={cx} />
        return <Light key={f.id} f={f} i={i} on={look === 'show'} palette={palette} motion={motion} />
      })}
    </>
  )
}

function Sub({ f }: { f: Fixture }) {
  return (
    <group position={[f.x, 0, f.y]}>
      {[0, 1].map((k) => (
        <mesh key={k} position={[0, 0.31 + k * 0.62, 0]} material={blackMetal} castShadow>
          <boxGeometry args={[1.1, 0.6, 0.85]} />
        </mesh>
      ))}
    </group>
  )
}

function LineArray({ f, cx }: { f: Fixture; cx: number }) {
  const boxes = useMemo(() => {
    const splay = [0, 1, 1, 2, 3, 4, 6, 8, 10]
    const out: { y: number; z: number; a: number }[] = []
    let y = -0.3
    let z = 0
    let a = 0
    for (const s of splay) {
      a += (s * Math.PI) / 180
      out.push({ y, z, a })
      y -= 0.33 * Math.cos(a)
      z -= 0.33 * Math.sin(a)
    }
    return out
  }, [])
  // Angle the hang slightly in towards the centre of the audience.
  const yaw = Math.atan2(cx - f.x, 30) * 0.5
  return (
    <group position={[f.x, f.z, f.y]} rotation-y={yaw}>
      <mesh position={[0, -0.05, 0]} material={blackMetal}>
        <boxGeometry args={[1.25, 0.1, 0.7]} />
      </mesh>
      {boxes.map((b, k) => (
        <mesh key={k} position={[0, b.y - 0.16, b.z]} rotation-x={b.a} material={blackMetal} castShadow>
          <boxGeometry args={[1.1, 0.32, 0.6]} />
        </mesh>
      ))}
    </group>
  )
}

function Light({ f, i, on, palette, motion }: { f: Fixture; i: number; on: boolean; palette: Palette; motion: boolean }) {
  const head = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const pool = useRef<THREE.Mesh>(null)
  const lens = useRef<THREE.MeshBasicMaterial>(null)
  const half = HALF_ANGLE[f.kind]
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color() }, opacity: { value: f.kind === 'par' ? 0.12 : f.kind === 'beam' ? 0.75 : 0.32 } },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [f.kind],
  )
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  useEffect(() => () => (mat.dispose(), poolMat.dispose()), [mat, poolMat])

  const tmp = useMemo(() => ({ d: new THREE.Vector3(), q: new THREE.Quaternion(), c: new THREE.Color(), down: new THREE.Vector3(0, -1, 0) }), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const ph = i * 1.37
    const fan = ((i % 7) - 3) * 0.2
    let pan: number
    let tilt: number
    if (f.kind === 'par') {
      // Pars wash back towards the stage.
      pan = Math.PI + fan * 0.5
      tilt = 0.45
    } else if (motion && on) {
      const speed = f.kind === 'beam' ? 1.1 : 0.55
      pan = fan + Math.sin(t * speed + ph) * 0.7
      tilt = 0.55 + Math.sin(t * speed * 0.8 + ph * 1.3) * 0.35
    } else {
      pan = fan
      tilt = 0.6
    }
    tmp.d.set(Math.sin(pan) * Math.sin(tilt), -Math.cos(tilt), Math.cos(pan) * Math.sin(tilt)).normalize()
    tmp.q.setFromUnitVectors(tmp.down, tmp.d)
    head.current?.quaternion.copy(tmp.q)
    paletteColor(palette, i, t, tmp.c)
    if (f.kind === 'blinder') {
      const flash = motion ? Math.pow(Math.max(0, Math.sin(t * 3.3 + ph)), 12) : 0.3
      lens.current?.color.setRGB(1 + flash * 5, 0.85 + flash * 4, 0.6 + flash * 3)
      return
    }
    lens.current?.color.copy(tmp.c).multiplyScalar(4)
    mat.uniforms.color.value.copy(tmp.c)
    const len = Math.min(45, tmp.d.y < -0.05 ? (f.z - 0.3) / -tmp.d.y : 45)
    if (beam.current) beam.current.scale.set(Math.max(0.06, len * Math.tan(half)), len, Math.max(0.06, len * Math.tan(half)))
    if (pool.current) {
      const hits = tmp.d.y < -0.05 && len < 44
      pool.current.visible = hits
      if (hits) {
        const r = Math.max(0.5, len * Math.tan(half) * 1.3)
        pool.current.position.set(f.x + tmp.d.x * len, 0.04, f.y + tmp.d.z * len)
        pool.current.scale.set(r * 2, r * 2, 1)
        poolMat.color.copy(tmp.c).multiplyScalar(f.kind === 'par' ? 0.25 : 0.6)
      }
    }
  })
  return (
    <>
      <group position={[f.x, f.z - 0.15, f.y]}>
        {/* Clamp and base */}
        <mesh position={[0, 0.08, 0]} material={blackMetal}>
          <boxGeometry args={[0.32, 0.1, 0.24]} />
        </mesh>
        <group ref={head}>
          {f.kind === 'blinder' ? (
            <>
              <mesh position={[0, -0.15, 0]} rotation-x={Math.PI / 2} material={blackMetal}>
                <boxGeometry args={[0.5, 0.5, 0.1]} />
              </mesh>
              <mesh position={[0, -0.21, 0]} rotation-x={Math.PI / 2}>
                <planeGeometry args={[0.42, 0.42]} />
                <meshBasicMaterial ref={lens} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
            </>
          ) : (
            <>
              <mesh position={[0, -0.18, 0]} material={blackMetal}>
                <cylinderGeometry args={[0.13, 0.16, 0.34, 16]} />
              </mesh>
              <mesh position={[0, -0.355, 0]} rotation-x={Math.PI / 2}>
                <circleGeometry args={[0.12, 20]} />
                <meshBasicMaterial ref={lens} toneMapped={false} side={THREE.DoubleSide} />
              </mesh>
              {on && <mesh ref={beam} geometry={beamGeom} material={mat} position={[0, -0.36, 0]} />}
            </>
          )}
        </group>
      </group>
      {on && f.kind !== 'blinder' && <mesh ref={pool} rotation-x={-Math.PI / 2} material={poolMat} visible={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
      </mesh>}
    </>
  )
}

// ---------------------------------------------------------------- labels

function Label({ position, children, dark }: { position: [number, number, number]; children: ReactNode; dark: boolean }) {
  return (
    <Html position={position} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className={`whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium mono shadow-lg ${dark ? 'bg-black/80 text-white border border-white/20' : 'bg-white text-black border border-black/10'}`}
      >
        {children}
      </div>
    </Html>
  )
}

function Labels({ project, look }: { project: Project; look: Look }) {
  const dark = look === 'show'
  const sb = stageBounds(project)
  return (
    <>
      {project.screens.map((s) => {
        const st = screenStats(s, project.customPanels)
        const c = screenColumns(s, st.panel)
        const mid = c[Math.floor(c.length / 2)]
        return (
          <Label key={s.id} position={[mid.x, s.z + st.h + 0.6, mid.y]} dark={dark}>
            {s.name} · {fmt(st.w, 1)}×{fmt(st.h, 1)} m · P{st.panel.pitch}
          </Label>
        )
      })}
      {sb && (
        <Label position={[sb.x + sb.w / 2, sb.h + 0.3, sb.y + sb.l + 0.5]} dark={dark}>
          Stage {fmt(sb.w)}×{fmt(sb.l)} m · {fmt(sb.h, 2)} m high
        </Label>
      )}
      {project.truss.filter((t) => trussLength(t) >= 4).map((t) => (
        <Label key={t.id} position={[(t.x1 + t.x2) / 2, t.height + 0.8, (t.y1 + t.y2) / 2]} dark={dark}>
          {fmt(trussLength(t), 1)} m truss @ {fmt(t.height, 1)} m
        </Label>
      ))}
      {project.ground
        .filter((g) => g.kind !== 'barricade')
        .map((g) => (
          <Label key={g.id} position={[g.x + g.w / 2, g.kind === 'crowd' || g.kind === 'seating' ? 2.6 : 3.6, g.y + g.h / 2]} dark={dark}>
            {g.label || GROUND_LABELS[g.kind]}
          </Label>
        ))}
    </>
  )
}
