import { useGlCreated } from '../components/Safe3D'
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { PartsScene } from './Parts3D'
import { useContent } from '../lib/useContent'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Environment, Html, Lightformer, MeshReflectorMaterial, OrbitControls, PerformanceMonitor, Sky, Stars } from '@react-three/drei'
import { useDevice } from '../lib/device'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import type { OrbitControls as OrbitImpl } from 'three-stdlib'
import { Zap, Camera, ChevronDown, ChevronUp, Clapperboard, Compass, Crosshair, Eye, Film, Hand, Maximize, Orbit, Rotate3d, RotateCcw, RotateCw, Tag, Users, Waves, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useStore } from '../store'
import type { Fixture, GroundItem, Project, Screen, Table, Truss } from '../types'
import { fmt, screenColumns, screenStats, stageBounds, TRUSS_INFO, trussLength } from '../lib/calc'
import { GROUND_LABELS } from '../lib/export/labels'
import { CHAIR, isSeated, seatPositions } from '../lib/seating'
import { DecorItems } from './Decor3D'
import { SetItems } from './Set3D'

RectAreaLightUniformsLib.init()

type Preset = 'audience' | 'last' | 'foh' | 'stage' | 'drone' | 'side'
export type Look = 'show' | 'day' | 'tech'
// Draft: fastest, for big rigs on basic laptops. Show: default. Best: sharpest, with shadows.
export type Quality = 'draft' | 'show' | 'best'
type QualityPref = 'auto' | Quality
const QKEY = 'unifest:quality'
export type Palette = 'white' | 'warm' | 'ice' | 'duo' | 'rainbow'
type RecordReq = { aspect: '16:9' | '9:16'; seconds: number; id: number }
export type ViewCmd = { kind: 'rotate' | 'tilt' | 'zoom' | 'set-az' | 'set-el' | 'view' | 'reset' | 'pan' | 'fit'; value: number | string | [number, number]; n: number }
// Orbit: left-drag turns the view. Grab: left-drag slides across the ground like a map.
export type Nav = 'orbit' | 'grab'
export type Angles = { az: number; el: number }
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
  const glCreated = useGlCreated()
  const [preset, setPreset] = useState<Preset>('audience')
  const [camReq, setCamReq] = useState(0)
  const [look, setLook] = useState<Look>('show')
  const [palette, setPalette] = useState<Palette>('duo')
  // Reduced-motion users start with still lights and no auto-orbit; both can be switched on.
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [motion, setMotion] = useState(!calm)
  const [crowd, setCrowd] = useState(true)
  const [labels, setLabels] = useState(false)
  const [showcase, setShowcase] = useState(!!compact && !calm)
  // Phones get lighter rendering so the 3D view stays smooth and the battery lasts.
  const lowPower = useDevice((d) => d.kind === 'phone') || !!compact
  const [qPref, setQPref] = useState<QualityPref>(() => {
    try {
      return (localStorage.getItem(QKEY) as QualityPref) || 'auto'
    } catch {
      return 'auto'
    }
  })
  // Auto starts at Show (Draft on phones) and drops to Draft if the frame rate stays low.
  const [slow, setSlow] = useState(false)
  const quality: Quality = qPref === 'auto' ? (lowPower || slow ? 'draft' : 'show') : qPref
  const pickQuality = (q: QualityPref) => {
    setQPref(q)
    setSlow(false)
    try {
      localStorage.setItem(QKEY, q)
    } catch {
      /* private mode */
    }
  }
  const [video, setVideo] = useState<string | null>(null)
  const [shotReq, setShotReq] = useState(0)
  const [rec, setRec] = useState<RecordReq | null>(null)
  const [recProgress, setRecProgress] = useState(0)
  const [recMenu, setRecMenu] = useState(false)
  const [info, setInfo] = useState<Info | null>(null)
  const [dropAt, setDropAt] = useState(0)
  const [viewCmd, setViewCmd] = useState<ViewCmd | null>(null)
  const [angles, setAngles] = useState<Angles>({ az: 0, el: 20 })
  const [navPref, setNavPref] = useState<Nav>('orbit')
  const [spaceGrab, setSpaceGrab] = useState(false)
  const nav: Nav = spaceGrab ? 'grab' : navPref
  const view = (kind: ViewCmd['kind'], value: ViewCmd['value'] = 0) => {
    setShowcase(false)
    setViewCmd({ kind, value, n: Date.now() + Math.random() })
  }
  // Arrow keys turn and tilt the view; + and - zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || e.ctrlKey || e.metaKey) return
      const step = e.shiftKey ? 45 : 15
      const map: Record<string, [ViewCmd['kind'], number]> = {
        ArrowLeft: ['rotate', -THREE.MathUtils.degToRad(step)],
        ArrowRight: ['rotate', THREE.MathUtils.degToRad(step)],
        ArrowUp: ['tilt', THREE.MathUtils.degToRad(10)],
        ArrowDown: ['tilt', -THREE.MathUtils.degToRad(10)],
        '+': ['zoom', 0.8],
        '=': ['zoom', 0.8],
        '-': ['zoom', 1.25],
      }
      const m = map[e.key]
      if (!m) return
      e.preventDefault()
      setShowcase(false)
      setViewCmd({ kind: m[0], value: m[1], n: Date.now() + Math.random() })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Move across the ground: W/A/S/D (Shift for bigger steps). H = grab, V = orbit, hold Space to grab.
  // Runs before the app-wide shortcuts so D does not switch on the 2D measure tool.
  useEffect(() => {
    if (compact) return
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el?.isContentEditable
    }
    const moves: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] }
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.code === 'Space') {
        if (e.target instanceof HTMLButtonElement) return
        e.preventDefault()
        if (!e.repeat) setSpaceGrab(true)
        return
      }
      const m = moves[k]
      if (m) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setShowcase(false)
        const big = e.shiftKey ? 3 : 1
        setViewCmd({ kind: 'pan', value: [m[0] * big, m[1] * big], n: Date.now() + Math.random() })
        return
      }
      if (k === 'h') setNavPref('grab')
      if (k === 'v') setNavPref('orbit')
      if (k === 'f') {
        e.stopImmediatePropagation()
        setShowcase(false)
        setViewCmd({ kind: 'fit', value: 0, n: Date.now() + Math.random() })
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceGrab(false)
    const blur = () => setSpaceGrab(false)
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [compact])
  const fileRef = useRef<HTMLInputElement>(null)
  const notify = useStore((s) => s.notify)
  // Free the local file when content stops, is replaced or the view closes.
  const videoRef = useRef<string | null>(null)
  const changeVideo = (next: string | null) => {
    const old = videoRef.current
    videoRef.current = next
    setVideo(next)
    // Let the screens drop the old file before it is released.
    if (old && old !== next) setTimeout(() => URL.revokeObjectURL(old.replace('#img', '')), 1000)
  }
  useEffect(() => () => void (videoRef.current && URL.revokeObjectURL(videoRef.current.replace('#img', ''))), [])

  const go = (p: Preset) => {
    setPreset(p)
    setCamReq((n) => n + 1)
    setShowcase(false)
  }
  const bg = look === 'tech' ? '#ededed' : look === 'day' ? '#b9c6d3' : '#000'

  return (
    <div className={`relative h-full w-full overflow-hidden ${nav === 'grab' ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ background: bg }}>
      <Canvas
        onCreated={glCreated}
        shadows={quality === 'best' || (quality === 'show' && !lowPower)}
        dpr={quality === 'draft' ? 1 : quality === 'show' ? [1, 1.25] : [1, 2]}
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
          viewCmd={viewCmd}
          nav={nav}
          onContentError={() => {
            changeVideo(null)
            notify('This file cannot be played here. Try an MP4 (H.264) video or a JPG/PNG image.')
          }}
          onAngles={setAngles}
          dropAt={dropAt}
          quality={quality}
          onSlow={() => qPref === 'auto' && setSlow(true)}
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
                e.target.value = ''
                if (!f) return
                const isImg = f.type.startsWith('image') || /\.(jpe?g|png|webp|gif)$/i.test(f.name)
                if (!isImg && f.type && !document.createElement('video').canPlayType(f.type)) {
                  notify('This video format cannot play in the browser. Export it as MP4 (H.264) and try again.')
                  return
                }
                changeVideo(URL.createObjectURL(f) + (isImg ? '#img' : ''))
              }}
            />
            <select className="h-8 rounded-lg border border-line bg-raised px-2 text-xs" style={{ width: 'auto' }} title="Draft is fastest for big rigs on basic laptops; Best is sharpest. Auto drops to Draft if the view gets slow." value={qPref} onChange={(e) => pickQuality(e.target.value as QualityPref)}>
              <option value="auto">Auto{qPref === 'auto' ? ` (${quality})` : ''}</option>
              <option value="draft">Draft</option>
              <option value="show">Show</option>
              <option value="best">Best</option>
            </select>
            <button className="btn h-8" title="Fire every effect at once: pyro, CO₂, flames, a strobe flash and the LED flash" onClick={() => (setDropAt(performance.now()), setShowcase(false))}>
              <Zap size={14} /> Drop
            </button>
            <button className={`btn h-8 ${video ? 'btn-on' : ''}`} title="Play your own video or image on every screen (stays on this computer)" onClick={() => (video ? changeVideo(null) : fileRef.current?.click())}>
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

      <ViewPad angles={angles} view={view} compact={!!compact} nav={nav} setNav={setNavPref} />

      {info && (
        <div className="absolute right-[176px] top-20 z-10 glass rounded-xl p-4 w-64 fade-in">
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
          <Eye size={12} />
          {nav === 'grab' ? 'Drag to grab and move · right-drag to orbit' : 'Drag to orbit · right-drag to grab'} · scroll zooms to the pointer · double-click to fly there · W A S D move · F whole ground
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

// ---------------------------------------------------------------- view controls

const VIEWS = [
  ['top', 'Top'],
  ['front', 'Front'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['back', 'Back'],
] as const

function NavToggle({ nav, setNav }: { nav: Nav; setNav: (n: Nav) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Mouse mode">
      <button className={`btn h-7 px-0 justify-center text-[10px] ${nav === 'orbit' ? 'btn-on' : ''}`} title="Orbit (V): drag to turn the view" onClick={() => setNav('orbit')}>
        <Rotate3d size={12} /> Orbit
      </button>
      <button className={`btn h-7 px-0 justify-center text-[10px] ${nav === 'grab' ? 'btn-on' : ''}`} title="Grab (H, or hold Space): drag to move across the ground" onClick={() => setNav('grab')}>
        <Hand size={12} /> Grab
      </button>
    </div>
  )
}

function ViewPad({ angles, view, compact, nav, setNav }: { angles: Angles; view: (k: ViewCmd['kind'], v?: ViewCmd['value']) => void; compact: boolean; nav: Nav; setNav: (n: Nav) => void }) {
  const [open, setOpen] = useState(!compact && useDevice.getState().kind !== 'phone')
  const deg = THREE.MathUtils.degToRad
  const btn = 'btn btn-icon h-8 w-8'
  const pos = compact ? 'top-28' : 'top-1/2 -translate-y-1/2'
  if (!open)
    return (
      <div className={`absolute right-4 ${pos} z-10 flex flex-col gap-1.5 items-end`}>
        <button className="glass rounded-xl btn h-9" onClick={() => setOpen(true)} title="Turn and tilt the view">
          <Compass size={14} /> View
        </button>
        <button className={`glass rounded-xl btn btn-icon h-9 w-9 ${nav === 'grab' ? 'btn-on' : ''}`} onClick={() => setNav(nav === 'grab' ? 'orbit' : 'grab')} title={nav === 'grab' ? 'Grab is on: one finger or drag moves across the ground' : 'Grab: drag to move across the ground'} aria-pressed={nav === 'grab'}>
          <Hand size={14} />
        </button>
        <button className="glass rounded-xl btn btn-icon h-9 w-9" onClick={() => view('fit')} title="Show the whole ground">
          <Maximize size={14} />
        </button>
      </div>
    )
  return (
    <div className={`absolute right-4 ${pos} z-10 glass rounded-xl p-2 w-[156px] fade-in select-none`} aria-label="View controls">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="label">View angle</span>
        <button className="text-mute hover:text-white" onClick={() => setOpen(false)} aria-label="Hide view controls">
          <X size={12} />
        </button>
      </div>
      <NavToggle nav={nav} setNav={setNav} />
      <button className="btn h-7 w-full justify-center text-[10px] mt-1 mb-2" onClick={() => view('fit')} title="Frame the whole ground (F)">
        <Maximize size={12} /> Whole ground
      </button>
      {/* Compass: the needle points from the stage towards the camera (F = front of house) */}
      <div className="relative mx-auto h-[72px] w-[72px] rounded-full border border-line-hi">
        {['F', 'R', 'B', 'L'].map((l, i) => (
          <span key={l} className="absolute text-[9px] mono text-mute" style={{ left: `${50 + Math.sin((i * Math.PI) / 2) * 38}%`, top: `${50 + Math.cos((i * Math.PI) / 2) * 38}%`, transform: 'translate(-50%,-50%)' }}>
            {l}
          </span>
        ))}
        <div className="absolute left-1/2 top-1/2 h-[26px] w-[2px] origin-top rounded bg-white" style={{ transform: `translateX(-50%) rotate(${-angles.az}deg)` }} />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>
      <div className="grid grid-cols-3 gap-1 mt-2 justify-items-center">
        <span />
        <button className={btn} title="Look from higher (↑)" onClick={() => view('tilt', deg(10))}>
          <ChevronUp size={14} />
        </button>
        <span />
        <button className={btn} title="Turn left (←)" onClick={() => view('rotate', -deg(15))}>
          <RotateCcw size={14} />
        </button>
        <button className={btn} title="Back to the chosen camera" onClick={() => view('reset')}>
          <Crosshair size={14} />
        </button>
        <button className={btn} title="Turn right (→)" onClick={() => view('rotate', deg(15))}>
          <RotateCw size={14} />
        </button>
        <button className={btn} title="Zoom out (−)" onClick={() => view('zoom', 1.25)}>
          <ZoomOut size={14} />
        </button>
        <button className={btn} title="Look from lower (↓)" onClick={() => view('tilt', -deg(10))}>
          <ChevronDown size={14} />
        </button>
        <button className={btn} title="Zoom in (+)" onClick={() => view('zoom', 0.8)}>
          <ZoomIn size={14} />
        </button>
      </div>
      <label className="block mt-2 px-1">
        <span className="flex justify-between text-[10px] text-mute">
          Turn <span className="mono text-white">{angles.az}°</span>
        </span>
        <input type="range" min={0} max={359} value={angles.az} onChange={(e) => view('set-az', Number(e.target.value))} className="w-full accent-white" aria-label="Turn angle" />
      </label>
      <label className="block px-1">
        <span className="flex justify-between text-[10px] text-mute">
          Height <span className="mono text-white">{angles.el}°</span>
        </span>
        <input type="range" min={2} max={88} value={angles.el} onChange={(e) => view('set-el', Number(e.target.value))} className="w-full accent-white" aria-label="Viewing height angle" />
      </label>
      <div className="grid grid-cols-3 gap-1 mt-1.5">
        {VIEWS.map(([k, l]) => (
          <button key={k} className="btn h-7 px-0 justify-center text-[9px]" onClick={() => view('view', k)} title={`${l} view`}>
            {l}
          </button>
        ))}
      </div>
      {!compact && <p className="text-[9px] mt-1.5 px-1 leading-snug text-mute">Arrows turn and tilt · W A S D move · double-click the ground to fly there</p>}
    </div>
  )
}

// ---------------------------------------------------------------- scene

interface SceneProps {
  dropAt: number
  quality: Quality
  onSlow: () => void
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
  viewCmd: ViewCmd | null
  nav: Nav
  onContentError: () => void
  onAngles: (a: Angles) => void
}

// The point the camera looks at stays over the venue (plus a margin) and between the floor and 40 m up.
function clampTarget(v: THREE.Vector3, W: number, L: number) {
  const m = Math.max(10, Math.max(W, L) * 0.15)
  v.x = THREE.MathUtils.clamp(v.x, -m, W + m)
  v.z = THREE.MathUtils.clamp(v.z, -m, L + m)
  v.y = THREE.MathUtils.clamp(v.y, 0, 40)
  return v
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
  const { project, preset, camReq, look, palette, motion, crowd, labels, showcase, video, shotReq, rec, compact, onInfo, dropAt, quality } = props
  const controls = useRef<OrbitImpl>(null)
  const { camera, gl, scene, size, setSize, setDpr, viewport } = useThree()
  const f = useMemo(() => focusOf(project), [project])
  const { W, L, sb } = f
  // A camera move in progress: straight to a point, or around the target along a sphere.
  const fly = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; sph?: THREE.Spherical } | null>(null)
  const show = look === 'show'
  // ?debug3d in the address exposes the renderer for performance checks.
  useEffect(() => {
    if (location.search.includes('debug3d')) (window as unknown as { __u3d: unknown }).__u3d = { gl, scene, camera, controls }
  }, [gl, scene, camera])

  useEffect(() => {
    if (look === 'tech') {
      scene.background = new THREE.Color('#ededed')
      scene.fog = null
    } else if (look === 'day') {
      scene.background = null
      scene.fog = new THREE.Fog('#c3ced8', 120, 700)
    } else {
      scene.background = new THREE.Color('#000000')
      scene.fog = new THREE.FogExp2('#000000', 0.0065 * (1 + (project.look?.haze ?? 0.3) * 1.5))
    }
  }, [look, scene, project.look?.haze])

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

  // Manual view controls: rotate, tilt, zoom and fixed views, all relative to the current target.
  useEffect(() => {
    const cmd = props.viewCmd
    const ctl = controls.current
    if (!cmd || !ctl) return
    if (cmd.kind === 'reset') {
      fly.current = cameraFor(preset)
      return
    }
    const big = Math.max(W, L)
    if (cmd.kind === 'pan' && Array.isArray(cmd.value)) {
      // Slide across the ground relative to where the camera faces.
      const fwd = ctl.target.clone().sub(camera.position).setY(0)
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize()
      const step = THREE.MathUtils.clamp(camera.position.distanceTo(ctl.target) * 0.18, 1, big * 0.25)
      const d = right.multiplyScalar(cmd.value[0] * step).add(fwd.multiplyScalar(cmd.value[1] * step))
      const base = fly.current ?? { pos: camera.position.clone(), target: ctl.target.clone() }
      const target = clampTarget(base.target.clone().add(d), W, L)
      fly.current = { pos: base.pos.clone().add(target.clone().sub(base.target)), target }
      return
    }
    if (cmd.kind === 'fit') {
      // The whole ground, from a high three-quarter angle, keeping the current direction.
      const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(ctl.target))
      const aspect = size.width / Math.max(1, size.height)
      const sph = new THREE.Spherical(big * (aspect < 1 ? 1.6 : 1.05), 0.75, cur.theta)
      const target = new THREE.Vector3(W / 2, 0, L / 2)
      fly.current = { pos: new THREE.Vector3().setFromSpherical(sph).add(target), target, sph }
      return
    }
    const t = ctl.target.clone()
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t))
    const v = Number(cmd.value)
    const minPhi = 0.02
    const maxPhi = Math.PI / 2 - 0.02
    if (cmd.kind === 'rotate') sph.theta += v
    if (cmd.kind === 'tilt') sph.phi -= v
    if (cmd.kind === 'zoom') sph.radius *= v
    if (cmd.kind === 'set-az') sph.theta = THREE.MathUtils.degToRad(v)
    if (cmd.kind === 'set-el') sph.phi = Math.PI / 2 - THREE.MathUtils.degToRad(v)
    if (cmd.kind === 'view') {
      const views: Record<string, [number, number]> = { top: [0, minPhi], front: [0, 1.3], back: [Math.PI, 1.3], left: [-Math.PI / 2, 1.3], right: [Math.PI / 2, 1.3] }
      const [theta, phi] = views[String(cmd.value)] ?? views.front
      sph.theta = theta
      sph.phi = phi
      if (cmd.value === 'top') {
        // Look straight down on the middle of the venue.
        t.set(W / 2, 0, L / 2)
        sph.radius = Math.max(W, L) * 1.15
      }
    }
    sph.phi = THREE.MathUtils.clamp(sph.phi, minPhi, maxPhi)
    sph.radius = THREE.MathUtils.clamp(sph.radius, 1, Math.max(W, L) * 3)
    fly.current = { pos: new THREE.Vector3().setFromSpherical(sph).add(t), target: t, sph }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.viewCmd])

  // Double-click anywhere on the ground (or on an object) to fly in close to that spot.
  useEffect(() => {
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const onDbl = (e: MouseEvent) => {
      const ctl = controls.current
      if (!ctl || rec) return
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      let hit: THREE.Vector3 | null = null
      // Real objects first (stage, screens, truss), skipping sky, stars and the big floor.
      for (const h of ray.intersectObjects(scene.children, true)) {
        const o = h.object as THREE.Mesh
        if (!o.isMesh || !o.visible || h.distance > 2000) continue
        const m = o.material as THREE.Material
        if (m?.side === THREE.BackSide || (o.geometry as THREE.BufferGeometry)?.type === 'PlaneGeometry') continue
        hit = h.point.clone()
        break
      }
      if (!hit) hit = ray.ray.intersectPlane(floor, new THREE.Vector3())
      if (!hit) return
      setShowcase()
      const target = clampTarget(hit, W, L)
      const cur = new THREE.Spherical().setFromVector3(camera.position.clone().sub(ctl.target))
      const sph = new THREE.Spherical(THREE.MathUtils.clamp(cur.radius * 0.45, 4, 30), THREE.MathUtils.clamp(cur.phi, 0.35, 1.35), cur.theta)
      fly.current = { pos: new THREE.Vector3().setFromSpherical(sph).add(target), target, sph }
    }
    const setShowcase = () => showcase && props.onShowcaseStop()
    el.addEventListener('dblclick', onDbl)
    return () => el.removeEventListener('dblclick', onDbl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene, W, L, rec, showcase])

  const tmpSph = useMemo(() => new THREE.Spherical(), [])
  const lastAngles = useRef({ az: -1, el: -1, at: 0 })
  useFrame(({ clock }, dt) => {
    const ctl = controls.current
    if (!ctl || rec) return
    if (fly.current) {
      const k = 1 - Math.exp(-dt * 3.2)
      ctl.target.lerp(fly.current.target, k)
      if (fly.current.sph) {
        // Travel around the target, taking the short way round.
        const cur = tmpSph.setFromVector3(camera.position.clone().sub(ctl.target))
        const goal = fly.current.sph
        const dTheta = Math.atan2(Math.sin(goal.theta - cur.theta), Math.cos(goal.theta - cur.theta))
        cur.theta += dTheta * k
        cur.phi += (goal.phi - cur.phi) * k
        cur.radius += (goal.radius - cur.radius) * k
        camera.position.setFromSpherical(cur).add(ctl.target)
      } else camera.position.lerp(fly.current.pos, k)
      if (camera.position.distanceTo(fly.current.pos) < 0.05 && ctl.target.distanceTo(fly.current.target) < 0.05) fly.current = null
    }
    ctl.update()
    // Keep the view over the venue so nobody gets lost in empty space.
    const t0 = ctl.target
    const tc = clampTarget(t0.clone(), W, L)
    if (tc.distanceToSquared(t0) > 1e-8) {
      const d = tc.sub(t0)
      t0.add(d)
      camera.position.add(d)
    }
    if (camera.position.y < 0.3) camera.position.y = 0.3
    // Report the viewing angle a few times a second for the on-screen readout.
    if (clock.elapsedTime - lastAngles.current.at > 0.15) {
      const s = tmpSph.setFromVector3(camera.position.clone().sub(ctl.target))
      const az = Math.round(((THREE.MathUtils.radToDeg(s.theta) % 360) + 360) % 360)
      const el = Math.round(90 - THREE.MathUtils.radToDeg(s.phi))
      if (az !== lastAngles.current.az || el !== lastAngles.current.el) props.onAngles({ az, el })
      lastAngles.current = { az, el, at: clock.elapsedTime }
    }
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

  const content = useContent(video, props.onContentError)

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate={showcase}
        autoRotateSpeed={0.6}
        minPolarAngle={0.02}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={1}
        maxDistance={Math.max(W, L) * 3}
        zoomToCursor
        screenSpacePanning={false}
        panSpeed={1.2}
        mouseButtons={props.nav === 'grab' ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={props.nav === 'grab' ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        onStart={() => {
          fly.current = null
          if (showcase) props.onShowcaseStop()
        }}
      />
      {rec && <Recorder req={rec} focus={f} setSize={setSize} size={size} setDpr={setDpr} dpr={viewport.dpr} onProgress={props.onRecProgress} onDone={props.onRecDone} controls={controls} />}

      <Lighting look={look} W={W} L={L} />
      <Ground project={project} look={look} compact={compact} reflect={quality === 'best' || (quality === 'show' && project.fixtures.length <= 150)} />
      <GroundItems project={project} look={look} />
      {crowd && <Crowd project={project} look={look} motion={motion} compact={compact || quality === 'draft'} />}
      <Furniture project={project} look={look} onInfo={onInfo} />
      <StageDecks project={project} look={look} onInfo={onInfo} />
      {project.truss.map((t) => (
        <TrussMesh key={t.id} t={t} onInfo={onInfo} />
      ))}
      <Hoists project={project} />
      {project.screens.map((s) => (
        <ScreenMesh key={s.id} s={s} project={project} content={content} look={look} onInfo={onInfo} />
      ))}
      <Fixtures project={project} look={look} palette={palette} motion={motion} quality={quality} />
      <PerformanceMonitor onDecline={props.onSlow} flipflops={2} />
      <SetItems project={project} show={show} dropAt={dropAt} onInfo={onInfo} />
      <PartsScene project={project} shadows={quality === 'best'} />
      <DecorItems project={project} show={show} motion={motion} dropAt={dropAt} onInfo={onInfo} />
      <DropFlash dropAt={dropAt} />
      {labels && <Labels project={project} look={look} />}

      {show && (
        <EffectComposer multisampling={quality === 'draft' || useDevice.getState().kind === 'phone' || compact ? 0 : quality === 'best' ? 8 : 2}>
          <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={1.1} radius={0.75} />
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  )
}

// The drop: a strobe burst of white light for a second.
function DropFlash({ dropAt }: { dropAt: number }) {
  const l = useRef<THREE.AmbientLight>(null)
  useFrame(() => {
    if (!l.current) return
    const t = (performance.now() - dropAt) / 1000
    l.current.intensity = dropAt && t >= 0 && t < 1 ? (Math.sin(t * 50) > 0 ? 6 * (1 - t) : 0) : 0
  })
  return <ambientLight ref={l} intensity={0} color="#ffffff" />
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

// The mirror-like floor re-draws the whole scene, so big rigs only get it in Best quality.
function Ground({ project, look, compact, reflect }: { project: Project; look: Look; compact: boolean; reflect: boolean }) {
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
        {look === 'show' && !compact && reflect ? (
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
          <meshStandardMaterial color={look === 'tech' ? '#e4e4e4' : look === 'day' ? '#55584f' : '#080808'} roughness={look === 'show' ? 0.35 : 1} metalness={look === 'show' ? 0.5 : 0} />
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
  const img = useContent(s.image ? (s.image.startsWith('data:') ? s.image : s.image + '#img') : null)
  const pattern = useMemo(() => {
    const t = new THREE.CanvasTexture(testPattern(s, st.pxW, st.pxH, s.cols, s.rows))
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [s, st.pxW, st.pxH])
  const own = useContent(s.video ? s.video : null)
  const base = own ?? content ?? img ?? pattern
  // One texture per column sharing the same image, so each column shows its slice.
  const texes = useMemo(
    () =>
      cols.map((_, i) => {
        const t = new THREE.Texture(base.image)
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 8
        if (base.image instanceof HTMLVideoElement) {
          // Video frames change every frame: skip mipmaps so uploads stay cheap.
          t.generateMipmaps = false
          t.minFilter = THREE.LinearFilter
        }
        t.repeat.set(1 / s.cols, 1)
        t.offset.set(i / s.cols, 0)
        t.needsUpdate = true
        return t
      }),
    [base, cols.length, s.cols],
  )
  useEffect(() => () => texes.forEach((t) => t.dispose()), [texes])
  const isVideo = base.image instanceof HTMLVideoElement
  const lastFrame = useRef(-1)
  useFrame(() => {
    if (!isVideo) return
    const v = base.image as HTMLVideoElement
    // Upload only when the video has moved on to a new frame.
    if (v.readyState >= 2 && v.currentTime !== lastFrame.current) {
      lastFrame.current = v.currentTime
      for (const t of texes) t.needsUpdate = true
    }
  })
  const virtual = new Set(s.virtual)
  const glow = (look === 'show' ? 1.6 : look === 'day' ? 1.15 : 1) * (s.brightness ?? 1)
  const tilt = THREE.MathUtils.degToRad(s.tilt ?? 0)
  const frameColor = s.frame === 'silver' ? '#c9ccd1' : s.frame === 'brand' ? (project.brand?.color ?? '#ffffff') : '#050505'
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
        <group key={i} position={[c.x, s.z + st.h / 2, c.y]} rotation={[tilt, -c.angle, 0, 'YXZ']}>
          {s.frame && s.frame !== 'none' && (
            <mesh position={[0, 0, -0.14]}>
              <boxGeometry args={[cw + (i === 0 || i === cols.length - 1 ? 0.3 : 0.001), st.h + 0.3, 0.04]} />
              <meshStandardMaterial color={frameColor} metalness={s.frame === 'silver' ? 0.9 : 0.3} roughness={0.35} />
            </mesh>
          )}
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
        <mesh key={d.id} position={[d.x + d.w / 2, d.h / 2, d.y + d.l / 2]} material={d.color || d.skirt ? deckMats(d.color, d.skirt, mats) : mats} castShadow receiveShadow>
          <boxGeometry args={[d.w, d.h, d.l]} />
          {look === 'tech' && <Edges color="#888" />}
        </mesh>
      ))}
      {/* LED edge strip along the downstage edge */}
      {look === 'show' &&
        project.decks
          .filter((d) => Math.abs(d.y + d.l - frontY) < 0.05 && d.edgeLight !== false)
          .map((d) => (
            <mesh key={`e-${d.id}`} position={[d.x + d.w / 2, d.h - 0.02, d.y + d.l + 0.006]}>
              <planeGeometry args={[d.w, 0.025]} />
              <meshBasicMaterial color={[3, 3, 3]} toneMapped={false} />
            </mesh>
          ))}
    </group>
  )
}

// Decks with their own top or skirt colour share materials by colour.
const deckMatCache = new Map<string, THREE.Material[]>()
function deckMats(top: string | undefined, skirt: string | undefined, def: THREE.Material[]) {
  const key = `${top}|${skirt}`
  if (!deckMatCache.has(key)) {
    const t = top ? new THREE.MeshStandardMaterial({ color: top, roughness: 0.5 }) : def[2]
    const k = skirt ? new THREE.MeshStandardMaterial({ color: skirt, roughness: 0.95 }) : def[0]
    deckMatCache.set(key, [k, k, t, k, k, k])
  }
  return deckMatCache.get(key)!
}

// ---------------------------------------------------------------- truss

const aluminium = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.95, roughness: 0.32 })
const blackMetal = new THREE.MeshStandardMaterial({ color: '#1b1b1b', metalness: 0.7, roughness: 0.45 })
const blackTruss = new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.6, roughness: 0.5 })
const whiteTruss = new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 0.3, roughness: 0.4 })

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
  const metal = t.finish === 'black' ? blackTruss : t.finish === 'white' ? whiteTruss : aluminium
  const geom = useMemo(() => trussGeometry(len, size, tri), [len, size, tri])
  const towerGeom = useMemo(() => trussGeometry(t.height, size, tri), [t.height, size, tri])
  useEffect(() => () => (geom.dispose(), towerGeom.dispose()), [geom, towerGeom])
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onInfo({ title: info.name, lines: [`${fmt(trussLength(t), 2)} m long`, `Trim height ${fmt(t.height, 2)} m`, `${Math.round(trussLength(t) * info.kgPerM)} kg self-weight`, t.legs ? 'Ground-support towers' : 'Flown from hoists'] })
  }
  return (
    <group onClick={click} onPointerOver={() => pointer(true)} onPointerOut={() => pointer(false)}>
      <mesh geometry={geom} material={metal} position={[t.x1, t.height + size / 2, t.y1]} rotation-y={-ang} castShadow />
      {t.legs &&
        [
          [t.x1, t.y1],
          [t.x2, t.y2],
        ].map(([x, y], i) => (
          <group key={i} position={[x, 0, y]}>
            <mesh geometry={towerGeom} material={metal} rotation-z={Math.PI / 2} castShadow />
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

// ---------------------------------------------------------------- tables and chairs

const chairGeom = (() => {
  const seat = new THREE.BoxGeometry(CHAIR * 0.9, 0.05, CHAIR * 0.9)
  seat.translate(0, 0.46, 0)
  const back = new THREE.BoxGeometry(CHAIR * 0.9, 0.5, 0.05)
  back.translate(0, 0.72, -CHAIR * 0.42)
  const legs = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5).translate((sx * CHAIR) / 2.4, 0.225, (sz * CHAIR) / 2.4)))
  ;[seat, back, ...legs].forEach((g) => g.deleteAttribute('uv'))
  return mergeGeometries([seat, back, ...legs])!
})()

function Furniture({ project, look, onInfo }: { project: Project; look: Look; onInfo: (i: Info) => void }) {
  const tables = project.tables ?? []
  const chairs = useRef<THREE.InstancedMesh>(null)
  const seats = useMemo(() => tables.filter((t) => isSeated(t.kind) && t.kind !== 'lounge').flatMap(seatPositions), [tables])
  useEffect(() => {
    const m = chairs.current
    if (!m) return
    const o = new THREE.Object3D()
    seats.forEach((s, i) => {
      o.position.set(s.x, 0, s.y)
      // Chairs face the table: the chair front is local +z, the back -z.
      o.rotation.set(0, -s.angle, 0)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [seats])
  const cloth = look === 'tech' ? '#f2f2f2' : '#e9e6df'
  const info = (t: Table) => {
    const at = project.guests?.filter((g) => g.tableId === t.id).length ?? 0
    onInfo({ title: t.kind === 'row' ? t.label : `Table ${t.label}`, lines: [`${t.kind} · ${t.seats} seats`, `${at} guests seated`, t.kind === 'round' || t.kind === 'cocktail' ? `${t.w.toFixed(2)} m diameter` : `${t.w.toFixed(2)} × ${t.l.toFixed(2)} m`] })
  }
  if (!tables.length) return null
  return (
    <>
      {tables.map((t) => (
        <group key={t.id} position={[t.x, 0, t.y]} rotation-y={(-t.rotation * Math.PI) / 180} onClick={(e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), info(t))} onPointerOver={() => pointer(true)} onPointerOut={() => pointer(false)}>
          <TableMesh t={t} cloth={cloth} />
        </group>
      ))}
      {seats.length > 0 && (
        <instancedMesh ref={chairs} args={[chairGeom, undefined, seats.length]} castShadow={look !== 'show'} receiveShadow>
          <meshStandardMaterial color={look === 'tech' ? '#9a9a9a' : '#c9b37e'} metalness={look === 'tech' ? 0 : 0.6} roughness={0.4} />
        </instancedMesh>
      )}
    </>
  )
}

function TableMesh({ t, cloth }: { t: Table; cloth: string }) {
  switch (t.kind) {
    case 'row':
      return null
    case 'round':
      return (
        <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
          {/* Floor-length cloth flares slightly at the bottom */}
          <cylinderGeometry args={[t.w / 2, t.w / 2 + 0.08, 0.76, 40]} />
          <meshStandardMaterial color={cloth} roughness={0.85} />
        </mesh>
      )
    case 'cocktail':
      return (
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[t.w / 2, t.w / 2 + 0.06, 1.1, 28]} />
          <meshStandardMaterial color={cloth} roughness={0.85} />
        </mesh>
      )
    case 'dance':
      return (
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[t.w, 0.04, t.l]} />
          <meshStandardMaterial color="#111" metalness={0.6} roughness={0.15} />
        </mesh>
      )
    case 'lounge':
      return (
        <>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.sin((k * Math.PI) / 2) * (t.w / 2 - 0.4), 0.22, Math.cos((k * Math.PI) / 2) * (t.l / 2 - 0.4)]} rotation-y={(k * Math.PI) / 2} castShadow>
              <boxGeometry args={[t.w * 0.7, 0.44, 0.8]} />
              <meshStandardMaterial color="#d9d4ca" roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[0.8, 0.4, 0.8]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
        </>
      )
    default: {
      const h = t.kind === 'bar' ? 1.1 : 0.76
      return (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[t.w, h, t.l]} />
          <meshStandardMaterial color={t.kind === 'bar' ? '#1c1c1c' : cloth} roughness={0.8} />
        </mesh>
      )
    }
  }
}

// ---------------------------------------------------------------- crowd

function personGeometry() {
  // Low-poly on purpose: thousands are drawn at once and nobody sees facets at crowd distance.
  const body = new THREE.CapsuleGeometry(0.19, 0.8, 2, 6)
  body.translate(0, 0.6 + 0.19, 0)
  const head = new THREE.SphereGeometry(0.11, 6, 4)
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
    const out: { x: number; z: number; s: number; ph: number; seated: boolean; face?: number }[] = []
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    // With real tables, guests sit on chairs instead of being scattered over seating zones.
    const seatsList = (project.tables ?? []).filter((t) => isSeated(t.kind)).flatMap(seatPositions)
    const hasTables = seatsList.length > 0
    const zones = project.ground.filter((g) => g.kind === 'crowd' || (!hasTables && (g.kind === 'vip' || g.kind === 'seating')))
    const total = zones.reduce((a, g) => a + g.w * g.h, 0) || 1
    const budget = Math.max(0, Math.min(compact ? 1200 : 3000, project.audience || 1000) - seatsList.length)
    const filled = project.guests?.length ? Math.min(seatsList.length, project.guests.length) : Math.round(seatsList.length * 0.85)
    seatsList.forEach((st, i) => {
      if ((i * 7919) % seatsList.length >= filled) return
      out.push({ x: st.x, z: st.y, s: 0.95 + rnd() * 0.1, ph: rnd() * Math.PI * 2, seated: true, face: st.angle })
    })
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
  }, [project.ground, project.audience, project.tables, project.guests, compact])
  const phoneIdx = useMemo(() => people.map((_, i) => i).filter((i) => i % 23 === 0), [people])

  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    people.forEach((p, i) => {
      o.position.set(p.x, p.seated ? -0.45 : 0, p.z)
      o.scale.setScalar(p.s)
      o.rotation.y = p.face != null ? -p.face : Math.sin(p.ph) * 0.4
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

function Fixtures({ project, look, palette, motion, quality }: { project: Project; look: Look; palette: Palette; motion: boolean; quality: Quality }) {
  const cx = project.venue.w / 2
  const lights = useMemo(() => project.fixtures.filter((f) => f.kind !== 'sub' && f.kind !== 'line-array'), [project.fixtures])
  return (
    <>
      {project.fixtures.map((f) => {
        if (f.kind === 'sub') return <Sub key={f.id} f={f} />
        if (f.kind === 'line-array') return <LineArray key={f.id} f={f} cx={cx} />
        return null
      })}
      <Rig lights={lights} on={look === 'show'} palette={palette} motion={motion} haze={project.look?.haze ?? 0.3} quality={quality} />
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

// All lights drawn as instanced meshes: one draw call per part (base, head, lens, beam, floor pool)
// for the whole rig, so a festival rig with hundreds of fixtures stays smooth on ordinary laptops.
const beamInstVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  void main() {
    vAlong = -position.y;
    vCol = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #endif
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }
`
const beamInstFragment = /* glsl */ `
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0);
    float fall = pow(clamp(1.0 - vAlong, 0.0, 1.0), 1.4);
    gl_FragColor = vec4(vCol * edge * fall, 1.0);
  }
`
const headGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.34, 12)
const baseGeo = new THREE.BoxGeometry(0.32, 0.1, 0.24)
const lensGeo = new THREE.CircleGeometry(0.12, 16)
const blinderGeo = new THREE.BoxGeometry(0.5, 0.1, 0.5)
const blinderLensGeo = new THREE.PlaneGeometry(0.42, 0.42)
const poolGeo = new THREE.PlaneGeometry(1, 1)
const BEAM_OPACITY: Partial<Record<Fixture['kind'], number>> = { par: 0.12, beam: 0.75, 'moving-head': 0.32 }
type IRef = { current: THREE.InstancedMesh | null }

function Rig({ lights, on, palette, motion, haze, quality }: { lights: Fixture[]; on: boolean; palette: Palette; motion: boolean; haze: number; quality: Quality }) {
  const heads = useMemo(() => lights.filter((f) => f.kind !== 'blinder'), [lights])
  const blinders = useMemo(() => lights.filter((f) => f.kind === 'blinder'), [lights])
  // Draft quality draws every second beam on very big rigs.
  const beamEvery = quality === 'draft' && heads.length > 120 ? 2 : 1
  const beamMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: beamInstVertex, fragmentShader: beamInstFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), [])
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  const lensMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }), [])
  useEffect(() => () => (beamMat.dispose(), poolMat.dispose(), lensMat.dispose()), [beamMat, poolMat, lensMat])
  const meshes = useMemo(() => {
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, color: boolean) => {
      if (!n) return null
      const m = new THREE.InstancedMesh(geo, mat, n)
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3)
      return m
    }
    return {
      base: mk(baseGeo, blackMetal, lights.length, false),
      head: mk(headGeo, blackMetal, heads.length, false),
      lens: mk(lensGeo, lensMat, heads.length, true),
      beam: mk(beamGeom, beamMat, heads.length, true),
      pool: mk(poolGeo, poolMat, heads.length, true),
      bBody: mk(blinderGeo, blackMetal, blinders.length, false),
      bLens: mk(blinderLensGeo, lensMat, blinders.length, true),
    }
  }, [lights.length, heads.length, blinders.length, beamMat, poolMat, lensMat])
  if (meshes.pool) meshes.pool.renderOrder = 2
  const base = { current: meshes.base }
  const head = { current: meshes.head }
  const lens = { current: meshes.lens }
  const beam = { current: meshes.beam }
  const pool = { current: meshes.pool }
  const bBody = { current: meshes.bBody }
  const bLens = { current: meshes.bLens }
  const all = [base, head, lens, beam, pool, bBody, bLens]
  const own = useMemo(() => new Map(lights.map((f) => [f.id, f.color ? new THREE.Color(f.color) : null])), [lights])
  const index = useMemo(() => new Map(lights.map((f, i) => [f.id, i])), [lights])
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      sc: new THREE.Vector3(),
      d: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      c: new THREE.Color(),
      c2: new THREE.Color(),
      down: new THREE.Vector3(0, -1, 0),
      one: new THREE.Vector3(1, 1, 1),
      flat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
      lensRot: new THREE.Matrix4().makeRotationX(Math.PI / 2),
    }),
    [],
  )

  // Bases never move.
  useEffect(() => {
    const b = base.current
    if (b) {
      lights.forEach((f, i) => b.setMatrixAt(i, tmp.m.makeTranslation(f.x, f.z - 0.07, f.y)))
      b.instanceMatrix.needsUpdate = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lights, meshes])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const aim = (f: Fixture, i: number) => {
      const ph = i * 1.37
      const fan = ((i % 7) - 3) * 0.2
      let pan: number
      let tilt: number
      if (f.aim === 'fixed') {
        pan = THREE.MathUtils.degToRad(f.pan ?? 0)
        tilt = THREE.MathUtils.degToRad(f.tilt ?? 35)
      } else if (f.kind === 'par') {
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
    }
    const colorOf = (f: Fixture, i: number) => {
      const o = own.get(f.id)
      if (o) tmp.c.copy(o)
      else paletteColor(palette, i, t, tmp.c)
      return tmp.c.multiplyScalar(f.intensity ?? 1)
    }

    heads.forEach((f, k) => {
      const i = index.get(f.id)!
      aim(f, i)
      tmp.p.set(f.x, f.z - 0.15, f.y)
      tmp.m.compose(tmp.p, tmp.q, tmp.one).multiply(tmp.m2.makeTranslation(0, -0.18, 0))
      head.current?.setMatrixAt(k, tmp.m)
      tmp.m.compose(tmp.p, tmp.q, tmp.one).multiply(tmp.m2.makeTranslation(0, -0.355, 0)).multiply(tmp.lensRot)
      lens.current?.setMatrixAt(k, tmp.m)
      const col = colorOf(f, i)
      lens.current?.setColorAt(k, tmp.c2.copy(col).multiplyScalar(4))
      if (!on) return
      const half = f.beam ? THREE.MathUtils.degToRad(f.beam / 2) : HALF_ANGLE[f.kind]
      const reach = f.reach ?? 45
      const len = Math.min(reach, tmp.d.y < -0.05 ? (f.z - 0.3) / -tmp.d.y : reach)
      const r = Math.max(0.06, len * Math.tan(half))
      const shown = k % beamEvery === 0
      tmp.m.compose(tmp.p, tmp.q, tmp.one).multiply(tmp.m2.makeTranslation(0, -0.36, 0)).multiply(tmp.m2.makeScale(shown ? r : 0, shown ? len : 0, shown ? r : 0))
      beam.current?.setMatrixAt(k, tmp.m)
      const op = (BEAM_OPACITY[f.kind] ?? 0.3) * (0.4 + haze * 1.2) * beamEvery
      beam.current?.setColorAt(k, tmp.c2.copy(col).multiplyScalar(op))
      if (tmp.d.y < -0.05 && len < reach - 0.5) {
        const pr = Math.max(0.5, r * 1.3)
        tmp.m.compose(tmp.p2.set(f.x + tmp.d.x * len, 0.04, f.y + tmp.d.z * len), tmp.flat, tmp.sc.set(pr * 2, pr * 2, 1))
        pool.current?.setColorAt(k, tmp.c2.copy(col).multiplyScalar(f.kind === 'par' ? 0.25 : 0.6))
      } else tmp.m.makeScale(0, 0, 0)
      pool.current?.setMatrixAt(k, tmp.m)
    })
    blinders.forEach((f, k) => {
      const i = index.get(f.id)!
      aim(f, i)
      tmp.p.set(f.x, f.z - 0.15, f.y)
      tmp.m.compose(tmp.p, tmp.q, tmp.one).multiply(tmp.m2.makeTranslation(0, -0.15, 0))
      bBody.current?.setMatrixAt(k, tmp.m)
      tmp.m.compose(tmp.p, tmp.q, tmp.one).multiply(tmp.m2.makeTranslation(0, -0.21, 0)).multiply(tmp.lensRot)
      bLens.current?.setMatrixAt(k, tmp.m)
      const flash = motion ? Math.pow(Math.max(0, Math.sin(t * 3.3 + i * 1.37)), 12) : 0.3
      bLens.current?.setColorAt(k, tmp.c2.setRGB(1 + flash * 5, 0.85 + flash * 4, 0.6 + flash * 3))
    })
    for (const r of all) {
      const im = (r as IRef).current
      if (!im) continue
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      {meshes.base && <primitive object={meshes.base} />}
      {meshes.head && <primitive object={meshes.head} />}
      {meshes.lens && <primitive object={meshes.lens} />}
      {on && meshes.beam && <primitive object={meshes.beam} />}
      {on && meshes.pool && <primitive object={meshes.pool} />}
      {meshes.bBody && <primitive object={meshes.bBody} />}
      {meshes.bLens && <primitive object={meshes.bLens} />}
    </group>
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
