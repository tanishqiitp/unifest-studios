import { useGlCreated } from '../components/Safe3D'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, PerformanceMonitor, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { create } from 'zustand'
import {
  Box as BoxIcon,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  Folder,
  Group as GroupIcon,
  ImageIcon,
  Lock,
  Magnet,
  Maximize2,
  Move3d,
  Rotate3d,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react'
import { useStore } from '../store'
import type { Part, PartArray, PartKind, Vec3 } from '../types'
import { ASSEMBLIES, buildAssembly, childrenOf, duplicate, EXTRUDE_PRESETS, groupParts, LATHE_PRESETS, MAT_PRESETS, newPart, PART_KINDS, partArea, removeParts, ungroup } from '../lib/parts'
import { setLine } from '../lib/setpieces'
import { useTheme } from '../lib/theme'
import { fmt } from '../lib/calc'
import { Check, Num, Section, Sel, Stat } from '../components/ui'
import { PartsScene, fromThree, rotFromThree, type Shading } from './Parts3D'
import { SetItems } from './Set3D'
import { Things } from './SetCad3D'
import { readImage } from './Decor'

const NO_PARTS: Part[] = []

// ---------------------------------------------------------------- editor state

type Mode = 'translate' | 'rotate' | 'scale'
type Axis = 'x' | 'y' | 'z' | null
type View = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top'
type Quality = 'auto' | 'draft' | 'show' | 'best'

interface ModelUI {
  sel: string[] // last one is active
  mode: Mode
  axis: Axis
  local: boolean
  shading: Shading
  context: boolean
  view: { v: View; n: number }
  frame: number
  objs: Record<string, THREE.Object3D>
  set: (p: Partial<ModelUI>) => void
}
export const useModel = create<ModelUI>((set) => ({
  sel: [],
  mode: 'translate',
  axis: null,
  local: false,
  shading: 'material',
  context: true,
  view: { v: 'iso', n: 0 },
  frame: 0,
  objs: {},
  set: (p) => set(p),
}))

const parts = () => useStore.getState().project.parts ?? []
const editParts = (fn: (ps: Part[]) => Part[]) => useStore.getState().mutate((p) => void (p.parts = fn(p.parts ?? [])))
const updatePart = (id: string, patch: Partial<Part>) => editParts((ps) => ps.map((x) => (x.id === id ? { ...x, ...patch } : x)))

// Clicking selects the outermost group (like picking an object); double-click picks the exact part.
function topOf(all: Part[], id: string) {
  let p = all.find((x) => x.id === id)
  while (p?.parent) {
    const up = all.find((x) => x.id === p!.parent)
    if (!up) break
    p = up
  }
  return p?.id ?? id
}

function addPart(kind: PartKind) {
  const p = useStore.getState().project
  const L = setLine(p)
  const n = newPart(kind, [L.cx, L.front + 2, kind === 'text' ? 4 : 0])
  editParts((ps) => [...ps, n])
  useModel.getState().set({ sel: [n.id] })
}

// ---------------------------------------------------------------- workspace

export function ModelWorkspace() {
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const sel = useModel((s) => s.sel)
  const active = all.find((p) => p.id === sel[sel.length - 1])
  const root = useRef<THREE.Group>(null)
  useShortcuts()
  // Drop selections of parts that no longer exist (undo, delete).
  useEffect(() => {
    const ids = new Set(all.map((p) => p.id))
    if (sel.some((id) => !ids.has(id))) useModel.getState().set({ sel: sel.filter((id) => ids.has(id)) })
  }, [all, sel])
  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <AddPanel />
        <Outliner />
      </aside>
      <div className="relative flex-1 min-w-0 bg-canvas">
        <Viewport root={root} />
        <Toolbar root={root} />
        <div className="absolute left-4 bottom-4 text-[11px] text-mute pointer-events-none hidden lg:block">
          G move · R rotate · S scale · X/Y/Z lock axis · Shift+D duplicate · Ctrl+G group · H hide · F frame · Numpad 1/3/7 views · M snap
        </div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">{active ? <Props p={active} /> : <Overview />}</aside>
    </div>
  )
}

// ---------------------------------------------------------------- left: add + outliner

function AddPanel() {
  const kinds = Object.keys(PART_KINDS) as Exclude<PartKind, 'group'>[]
  return (
    <>
      <Section title="Add">
        {(['Basic', 'Stage', 'Advanced'] as const).map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wider text-mute mb-1">{g}</div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {kinds
                .filter((k) => PART_KINDS[k].group === g)
                .map((k) => (
                  <button key={k} className="rounded-lg border border-line px-1.5 py-2 text-[11px] hover:border-line-hi hover:bg-raised" title={PART_KINDS[k].tip} onClick={() => addPart(k)}>
                    {PART_KINDS[k].name}
                  </button>
                ))}
            </div>
          </div>
        ))}
        <button className="btn w-full justify-center" onClick={() => addPart('group')} title="An empty group: drag parts into it from the list with Ctrl+G">
          <Folder size={13} /> Empty group
        </button>
      </Section>
      <Section title="Ready-made">
        <div className="grid gap-1.5">
          {ASSEMBLIES.map((a) => (
            <button
              key={a.id}
              className="rounded-lg border border-line px-2.5 py-2 text-left hover:border-line-hi hover:bg-raised"
              onClick={() => {
                const add = buildAssembly(useStore.getState().project, a.id)
                editParts((ps) => [...ps, ...add])
                useModel.getState().set({ sel: [add[0].id] })
              }}
            >
              <div className="text-xs font-medium">{a.name}</div>
              <div className="text-[10px] text-mute leading-snug">{a.blurb}</div>
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

function Outliner() {
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const rows: { p: Part; depth: number }[] = []
  const walk = (pid: string | undefined, depth: number) =>
    childrenOf(all, pid).forEach((p) => {
      rows.push({ p, depth })
      if (p.kind === 'group' && !closed.has(p.id)) walk(p.id, depth + 1)
    })
  walk(undefined, 0)
  return (
    <Section title={`Outliner · ${all.length}`}>
      {!rows.length && <p className="text-[11px] text-mute">Nothing yet. Add a shape or a ready-made piece above.</p>}
      <ul className="-mx-1" role="tree" aria-label="Parts">
        {rows.map(({ p, depth }) => (
          <OutlinerRow
            key={p.id}
            p={p}
            depth={depth}
            open={!closed.has(p.id)}
            toggle={() => {
              const n = new Set(closed)
              if (n.has(p.id)) n.delete(p.id)
              else n.add(p.id)
              setClosed(n)
            }}
          />
        ))}
      </ul>
    </Section>
  )
}

function OutlinerRow({ p, depth, open, toggle }: { p: Part; depth: number; open: boolean; toggle: () => void }) {
  const sel = useModel((s) => s.sel)
  const on = sel.includes(p.id)
  const active = sel[sel.length - 1] === p.id
  const [edit, setEdit] = useState(false)
  return (
    <li
      role="treeitem"
      aria-selected={on}
      className={`flex items-center gap-1 rounded-md px-1 h-7 text-xs cursor-pointer ${active ? 'bg-white text-black' : on ? 'bg-lift' : 'hover:bg-raised'} ${p.hidden ? 'opacity-50' : ''}`}
      style={{ paddingLeft: 4 + depth * 14 }}
      onClick={(e) => {
        const s = useModel.getState().sel
        useModel.getState().set({ sel: e.shiftKey || e.ctrlKey || e.metaKey ? (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]) : [p.id] })
      }}
      onDoubleClick={() => setEdit(true)}
    >
      {p.kind === 'group' ? (
        <button className="shrink-0" aria-label={open ? 'Collapse' : 'Expand'} onClick={(e) => (e.stopPropagation(), toggle())}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      ) : (
        <BoxIcon size={11} className="shrink-0 opacity-60 ml-0.5" />
      )}
      {edit ? (
        <input
          autoFocus
          className="field h-6 text-xs"
          defaultValue={p.name}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => (updatePart(p.id, { name: e.target.value.trim() || p.name }), setEdit(false))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEdit(false)
            e.stopPropagation()
          }}
        />
      ) : (
        <span className="flex-1 truncate" title="Double-click to rename">
          {p.name}
          {p.array && p.array.count > 1 ? ` ×${p.array.count}` : ''}
        </span>
      )}
      <button className="shrink-0 opacity-70 hover:opacity-100" aria-label={p.hidden ? 'Show' : 'Hide'} onClick={(e) => (e.stopPropagation(), updatePart(p.id, { hidden: !p.hidden }))}>
        {p.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button className="shrink-0 opacity-70 hover:opacity-100" aria-label={p.locked ? 'Unlock' : 'Lock'} onClick={(e) => (e.stopPropagation(), updatePart(p.id, { locked: !p.locked }))}>
        {p.locked ? <Lock size={12} /> : <Unlock size={12} className="opacity-40" />}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------- actions

export function duplicateSel() {
  const { sel, set } = useModel.getState()
  if (!sel.length) return
  const add = duplicate(parts(), sel)
  editParts((ps) => [...ps, ...add])
  set({ sel: add.filter((a) => !add.some((b) => b.id === a.parent)).map((a) => a.id), mode: 'translate' })
}
function groupSel() {
  const { sel, set } = useModel.getState()
  if (!sel.length) return
  const r = groupParts(parts(), sel)
  editParts(() => r.parts)
  if (r.group) set({ sel: [r.group.id] })
}
function ungroupSel() {
  const { sel, set } = useModel.getState()
  const g = parts().find((p) => p.id === sel[sel.length - 1] && p.kind === 'group')
  if (!g) return
  const kids = childrenOf(parts(), g.id).map((k) => k.id)
  editParts((ps) => ungroup(ps, g.id))
  set({ sel: kids })
}
function deleteSel() {
  const { sel, set } = useModel.getState()
  if (!sel.length) return
  editParts((ps) => removeParts(ps, sel))
  set({ sel: [] })
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el?.isContentEditable) return
      const m = useModel.getState()
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      const take = () => (e.preventDefault(), e.stopImmediatePropagation())
      if (e.code === 'Numpad1') return (take(), m.set({ view: { v: mod ? 'back' : 'front', n: m.view.n + 1 } }))
      if (e.code === 'Numpad3') return (take(), m.set({ view: { v: mod ? 'left' : 'right', n: m.view.n + 1 } }))
      if (e.code === 'Numpad7') return (take(), m.set({ view: { v: 'top', n: m.view.n + 1 } }))
      if (e.code === 'Numpad0' || e.code === 'Numpad5') return (take(), m.set({ view: { v: 'iso', n: m.view.n + 1 } }))
      if (e.code === 'NumpadDecimal' || (!mod && k === 'f')) return (take(), m.set({ frame: m.frame + 1 }))
      if (mod && k === 'g') return (take(), e.shiftKey ? ungroupSel() : groupSel())
      if (e.shiftKey && k === 'd') return (take(), duplicateSel())
      if (mod) return
      if (k === 'g') return (take(), m.set({ mode: 'translate', axis: null }))
      if (k === 'r') return (take(), m.set({ mode: 'rotate', axis: null }))
      if (k === 's') return (take(), m.set({ mode: 'scale', axis: null }))
      if (k === 'x' || k === 'y' || k === 'z') return (take(), m.set({ axis: m.axis === k ? null : k }))
      if (k === 'delete' || k === 'backspace') return (take(), deleteSel())
      if (k === 'h' && e.altKey) return (take(), editParts((ps) => ps.map((p) => (p.hidden ? { ...p, hidden: false } : p))))
      if (k === 'h') return (take(), editParts((ps) => ps.map((p) => (m.sel.includes(p.id) ? { ...p, hidden: true } : p))))
      if (k === 'a' && e.altKey) return (take(), m.set({ sel: [] }))
      if (k === 'a') return (take(), m.set({ sel: childrenOf(parts(), undefined).filter((p) => !p.hidden).map((p) => p.id) }))
      if (k === 'escape') m.set({ sel: [], axis: null })
    }
    // Capture phase, so the editor's own keys win over the app-wide shortcuts while this workspace is open.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

// ---------------------------------------------------------------- toolbar

const QKEY = 'unifest:quality'
function useQuality() {
  const [q, setQ] = useState<Quality>(() => {
    try {
      return (localStorage.getItem(QKEY) as Quality) || 'auto'
    } catch {
      return 'auto'
    }
  })
  const pick = (v: Quality) => {
    setQ(v)
    try {
      localStorage.setItem(QKEY, v)
    } catch {
      /* private mode */
    }
  }
  return [q, pick] as const
}

function Toolbar({ root }: { root: React.RefObject<THREE.Group | null> }) {
  const m = useModel()
  const magnet = useStore((s) => s.ui.magnet)
  const { setUI, notify } = useStore.getState()
  const name = useStore((s) => s.project.name)
  const bar = 'glass rounded-xl flex items-center gap-0.5 p-1'
  const b = (on: boolean) => `btn h-8 px-2 text-[11px] ${on ? 'btn-on' : ''}`
  const exportGlb = async () => {
    const r = root.current
    if (!r || !parts().length) return notify('Nothing to export yet. Add some parts first.')
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
    const copy = r.clone(true)
    const drop: THREE.Object3D[] = []
    copy.traverse((o) => (o as THREE.LineSegments).isLineSegments && drop.push(o))
    drop.forEach((o) => o.removeFromParent())
    new GLTFExporter().parse(
      copy,
      (out) => {
        const blob = new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${(name || 'unifest-model').replace(/[^\w-]+/g, '-')}.glb`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
        notify('Exported .glb: opens in Blender, Unreal, Cinema 4D and most 3D tools')
      },
      () => notify('Could not export the model'),
      { binary: true },
    )
  }
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex sm:flex-wrap items-start gap-2 pointer-events-none max-sm:pointer-events-auto max-sm:overflow-x-auto no-scrollbar [&>*]:shrink-0">
      <div className={`${bar} pointer-events-auto`}>
        <button className={b(m.mode === 'translate')} title="Move (G)" onClick={() => m.set({ mode: 'translate' })}>
          <Move3d size={13} />
          <span className="hidden xl:inline">Move</span>
        </button>
        <button className={b(m.mode === 'rotate')} title="Rotate (R)" onClick={() => m.set({ mode: 'rotate' })}>
          <Rotate3d size={13} />
          <span className="hidden xl:inline">Rotate</span>
        </button>
        <button className={b(m.mode === 'scale')} title="Scale (S)" onClick={() => m.set({ mode: 'scale' })}>
          <Maximize2 size={13} />
          <span className="hidden xl:inline">Scale</span>
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        {(['x', 'y', 'z'] as const).map((a) => (
          <button key={a} className={`${b(m.axis === a)} w-8 justify-center uppercase`} title={`Lock to ${a.toUpperCase()} (${a === 'x' ? 'across' : a === 'y' ? 'depth' : 'up'}), key ${a.toUpperCase()}`} onClick={() => m.set({ axis: m.axis === a ? null : a })}>
            {a}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <button className={b(magnet)} title="Snap to grid and 15° steps (M)" onClick={() => setUI({ magnet: !magnet })}>
          <Magnet size={13} />
        </button>
        <button className={b(m.local)} title="Handles follow the part's own rotation (Local) or the venue (Global)" onClick={() => m.set({ local: !m.local })}>
          {m.local ? 'Local' : 'Global'}
        </button>
      </div>
      <div className={`${bar} pointer-events-auto`}>
        {(['solid', 'material', 'wire', 'xray'] as Shading[]).map((s) => (
          <button key={s} className={`${b(m.shading === s)} capitalize`} title={{ solid: 'Plain grey: fastest, easiest to read shapes', material: 'Colours, metal, glow and LED content', wire: 'Wireframe', xray: 'See through everything' }[s]} onClick={() => m.set({ shading: s })}>
            {s === 'xray' ? 'X-ray' : s}
          </button>
        ))}
      </div>
      <div className={`${bar} pointer-events-auto`}>
        {(['iso', 'front', 'right', 'top'] as View[]).map((v) => (
          <button key={v} className={`${b(false)} capitalize`} title={{ iso: '3D (Numpad 0)', front: 'Front (Numpad 1)', right: 'Side (Numpad 3)', top: 'Top (Numpad 7)' }[v as 'iso']} onClick={() => m.set({ view: { v, n: m.view.n + 1 } })}>
            {v === 'iso' ? '3D' : v === 'right' ? 'Side' : v}
          </button>
        ))}
        <button className={b(false)} title="Frame the selection (F)" onClick={() => m.set({ frame: m.frame + 1 })}>
          <Focus size={13} />
        </button>
      </div>
      <div className={`${bar} pointer-events-auto`}>
        <button className={b(m.context)} title="Show the stage, truss, screens, set and decor around your parts" onClick={() => m.set({ context: !m.context })}>
          Stage & set
        </button>
        <QualityPick />
        <button className={b(false)} title="Download the parts as .glb for Blender and other 3D tools" onClick={exportGlb}>
          <Download size={13} />
          <span className="hidden xl:inline">.glb</span>
        </button>
      </div>
    </div>
  )
}

function QualityPick() {
  const [q, setQ] = useQuality()
  return (
    <select className="field h-8 w-auto text-[11px]" aria-label="Quality" title="Draft is fastest on basic laptops and phones; Best adds shadows. Auto lowers the sharpness when things slow down." value={q} onChange={(e) => (setQ(e.target.value as Quality), window.dispatchEvent(new Event('unifest:quality')))}>
      <option value="auto">Auto</option>
      <option value="draft">Draft</option>
      <option value="show">Show</option>
      <option value="best">Best</option>
    </select>
  )
}

// ---------------------------------------------------------------- viewport

function Viewport({ root }: { root: React.RefObject<THREE.Group | null> }) {
  const glCreated = useGlCreated()
  const project = useStore((s) => s.project)
  const m = useModel()
  const light = useTheme((t) => t.theme === 'light')
  const [q, setQ] = useState<Quality>(() => (localStorage.getItem(QKEY) as Quality) || 'auto')
  useEffect(() => {
    const f = () => setQ((localStorage.getItem(QKEY) as Quality) || 'auto')
    window.addEventListener('unifest:quality', f)
    return () => window.removeEventListener('unifest:quality', f)
  }, [])
  const phone = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const max = q === 'draft' ? 1 : q === 'best' ? Math.min(2, window.devicePixelRatio || 1) : phone ? 1.25 : 1.5
  const [dpr, setDpr] = useState(max)
  useEffect(() => setDpr(max), [max])
  const shadows = q === 'best'
  const L = setLine(project)
  const selSet = useMemo(() => new Set(m.sel), [m.sel])
  const all = project.parts ?? []
  const video = !!project.setContent && !project.setContent.startsWith('data:') && all.some((p) => p.mat.led)
  const register = useCallback((id: string, o: THREE.Object3D | null) => {
    const objs = useModel.getState().objs
    if (o && objs[id] !== o) useModel.getState().set({ objs: { ...objs, [id]: o } })
  }, [])
  const pick = useCallback((id: string, e: ThreeEvent<MouseEvent>) => {
    const ps = parts()
    const target = e.detail >= 2 ? id : topOf(ps, id)
    const s = useModel.getState().sel
    useModel.getState().set({ sel: e.shiftKey || e.ctrlKey || e.metaKey ? (s.includes(target) ? s.filter((x) => x !== target) : [...s, target]) : [target] })
  }, [])
  return (
    <Canvas
      onCreated={glCreated}
      frameloop={video ? 'always' : 'demand'}
      dpr={dpr}
      shadows={shadows}
      gl={{ antialias: q !== 'draft', preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ position: [L.cx + 18, 14, L.front + 22], fov: 40, near: 0.05, far: 3000 }}
      onPointerMissed={(e) => e.button === 0 && !e.shiftKey && useModel.getState().set({ sel: [] })}
    >
      {q === 'auto' && <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))} onIncline={() => setDpr((d) => Math.min(max, d + 0.25))} flipflops={4} />}
      <color attach="background" args={[light ? '#eeeeee' : '#0b0b0b']} />
      <hemisphereLight args={['#ffffff', light ? '#a0a0a0' : '#1c1c1c', light ? 1.6 : 1.2]} />
      <directionalLight position={[L.cx + 25, 40, L.front + 30]} intensity={1.8} castShadow={shadows} shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
      <directionalLight position={[L.cx - 30, 20, L.front - 20]} intensity={0.5} />
      {shadows && (
        <mesh rotation-x={-Math.PI / 2} position={[L.cx, -0.002, L.front]} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      )}
      <Grid position={[L.cx, 0.001, L.front]} args={[300, 300]} cellSize={1} sectionSize={5} cellColor={light ? '#d0d0d0' : '#1d1d1d'} sectionColor={light ? '#a8a8a8' : '#353535'} fadeDistance={180} infiniteGrid />
      {m.context && (
        <group>
          <Things project={project} pick={() => undefined} />
          <SetItems project={project} show={false} dropAt={0} onInfo={() => undefined} />
        </group>
      )}
      <group ref={root}>
        <PartsScene project={project} shading={m.shading} onPick={pick} register={register} selected={selSet} shadows={shadows} />
      </group>
      <Gizmo />
      {import.meta.env.DEV && <DevHook />}
      <CamRig cx={L.cx} cy={L.front} />
      <GizmoHelper alignment="bottom-right" margin={[80, 120]}>
        <GizmoViewport axisColors={['#e5484d', '#46a758', '#3e63dd']} labels={['X', 'Z', 'Y']} labelColor="#000" />
      </GizmoHelper>
    </Canvas>
  )
}

// Development only: lets automated checks reach the camera.
function DevHook() {
  const { camera, gl } = useThree()
  useEffect(() => void ((window as unknown as Record<string, unknown>).__model = { camera, gl, ui: useModel }), [camera, gl])
  return null
}

function CamRig({ cx, cy }: { cx: number; cy: number }) {
  const { camera, controls, invalidate } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null; invalidate: () => void }
  const view = useModel((s) => s.view)
  const frame = useModel((s) => s.frame)
  useEffect(() => {
    if (!view.n || !controls) return
    const t = controls.target.clone()
    const dist = Math.max(10, camera.position.distanceTo(t))
    const dir = { iso: [0.6, 0.45, 0.65], front: [0, 0.08, 1], back: [0, 0.08, -1], right: [1, 0.08, 0], left: [-1, 0.08, 0], top: [0, 1, 0.001] }[view.v]
    const d = new THREE.Vector3(...dir).normalize().multiplyScalar(dist)
    camera.position.copy(t).add(d)
    controls.update()
    invalidate()
  }, [view, camera, controls, invalidate])
  useEffect(() => {
    if (!frame || !controls) return
    const { sel, objs } = useModel.getState()
    const box = new THREE.Box3()
    for (const id of sel) if (objs[id]) box.expandByObject(objs[id])
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const r = Math.max(1, box.getSize(new THREE.Vector3()).length())
    const dir = camera.position.clone().sub(controls.target).normalize()
    controls.target.copy(c)
    camera.position.copy(c).add(dir.multiplyScalar(r * 1.6))
    controls.update()
    invalidate()
  }, [frame, camera, controls, invalidate])
  return <OrbitControls makeDefault target={[cx, 2, cy]} maxPolarAngle={Math.PI - 0.01} />
}

// Move / rotate / scale handle. Drags every selected part together; one undo step on release.
function Gizmo() {
  const sel = useModel((s) => s.sel)
  const objs = useModel((s) => s.objs)
  const { mode, axis, local } = useModel()
  const magnet = useStore((s) => s.ui.magnet)
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const active = sel[sel.length - 1]
  const part = all.find((p) => p.id === active)
  const obj = active ? objs[active] : undefined
  const start = useRef<Map<string, { p: THREE.Vector3; r: THREE.Euler; s: THREE.Vector3 }>>(new Map())
  if (!part || !obj || part.locked || !obj.parent) return null
  const snapshot = () => {
    start.current = new Map(sel.filter((id) => objs[id]).map((id) => [id, { p: objs[id].position.clone(), r: objs[id].rotation.clone(), s: objs[id].scale.clone() }]))
  }
  const follow = () => {
    const a = start.current.get(active)
    if (!a) return
    const dp = obj.position.clone().sub(a.p)
    const dr = [obj.rotation.x - a.r.x, obj.rotation.y - a.r.y, obj.rotation.z - a.r.z]
    const ds = [obj.scale.x / (a.s.x || 1), obj.scale.y / (a.s.y || 1), obj.scale.z / (a.s.z || 1)]
    for (const [id, s0] of start.current) {
      if (id === active) continue
      const o = objs[id]
      if (!o) continue
      o.position.copy(s0.p).add(dp)
      o.rotation.set(s0.r.x + dr[0], s0.r.y + dr[1], s0.r.z + dr[2])
      o.scale.set(s0.s.x * ds[0], s0.s.y * ds[1], s0.s.z * ds[2])
    }
  }
  const commit = () => {
    const ids = [...start.current.keys()]
    const r2 = (n: number, k = 1000) => Math.round(n * k) / k
    editParts((ps) =>
      ps.map((p) => {
        if (!ids.includes(p.id) || !objs[p.id]) return p
        const o = objs[p.id]
        return {
          ...p,
          pos: fromThree(o.position).map((n) => r2(n)) as Vec3,
          rot: rotFromThree(o.rotation).map((n) => r2(n, 10)) as Vec3,
          scl: fromThree(o.scale).map((n) => r2(Math.abs(n) < 0.01 ? 0.01 * Math.sign(n || 1) : n)) as Vec3,
        }
      }),
    )
  }
  // Venue axes: x across = three X, y depth = three Z, z up = three Y.
  const show = axis ? { showX: axis === 'x', showY: axis === 'z', showZ: axis === 'y' } : {}
  return (
    <TransformControls
      object={obj}
      mode={mode}
      space={local ? 'local' : 'world'}
      size={0.85}
      translationSnap={magnet ? 0.25 : null}
      rotationSnap={magnet ? THREE.MathUtils.degToRad(15) : null}
      scaleSnap={magnet ? 0.1 : null}
      {...show}
      onMouseDown={snapshot}
      onObjectChange={follow}
      onMouseUp={commit}
    />
  )
}

// ---------------------------------------------------------------- right: properties

function Overview() {
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const area = all.reduce((a, p) => a + partArea(p), 0)
  return (
    <Section title="3D model">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Parts" value={all.filter((p) => p.kind !== 'group').length} />
        <Stat label="Groups" value={all.filter((p) => p.kind === 'group').length} />
        <Stat label="Surface" value={`${fmt(area, 0)} m²`} sub="for the quote" />
        <Stat label="Copies" value={all.reduce((a, p) => a + (p.array?.count ?? 1) * (p.mirror ? 2 : 1), 0)} />
      </div>
      <p className="text-[11px] text-mute leading-relaxed">
        Build anything: add shapes on the left, then move, rotate and scale them with the handles (G, R, S). Spin a profile into columns and chandeliers, extrude outlines into portals and logos, repeat parts in rows or circles with Array, and
        mirror them across the stage. Everything shows in the 3D Visualizer, the client link and the quote.
      </p>
      <p className="text-[11px] text-mute leading-relaxed">Click selects a whole group; double-click picks one part inside it. Shift-click adds to the selection.</p>
    </Section>
  )
}

function Props({ p }: { p: Part }) {
  const sel = useModel((s) => s.sel)
  const up = (patch: Partial<Part>) => updatePart(p.id, patch)
  const upMat = (patch: Partial<Part['mat']>) => up({ mat: { ...p.mat, ...patch } })
  const v3 = (k: 'pos' | 'rot' | 'scl', i: number, n: number) => {
    const v = [...p[k]] as Vec3
    v[i] = n
    up({ [k]: v })
  }
  const file = useRef<HTMLInputElement>(null)
  const isGroup = p.kind === 'group'
  return (
    <>
      <Section
        title={sel.length > 1 ? `${sel.length} selected` : isGroup ? 'Group' : PART_KINDS[p.kind as Exclude<PartKind, 'group'>].name}
        right={
          <div className="flex gap-1">
            <IconBtn title="Duplicate (Shift+D)" onClick={duplicateSel}>
              <Copy size={13} />
            </IconBtn>
            <IconBtn title="Group selected (Ctrl+G)" onClick={groupSel}>
              <GroupIcon size={13} />
            </IconBtn>
            {isGroup && (
              <IconBtn title="Ungroup (Ctrl+Shift+G)" onClick={ungroupSel}>
                <Ungroup size={13} />
              </IconBtn>
            )}
            <IconBtn title="Delete (Del)" onClick={deleteSel}>
              <Trash2 size={13} />
            </IconBtn>
          </div>
        }
      >
        <label className="block">
          <span className="label">Name</span>
          <input className="field mt-1" value={p.name} onChange={(e) => up({ name: e.target.value })} />
        </label>
        {!isGroup && <p className="text-[11px] text-mute">{PART_KINDS[p.kind as Exclude<PartKind, 'group'>].tip}</p>}
        {p.parent && (
          <button className="btn w-full justify-center text-[11px]" onClick={() => useModel.getState().set({ sel: [p.parent!] })}>
            Select the group it belongs to
          </button>
        )}
      </Section>

      <Section title="Transform">
        <Vec label="Location" unit="m" v={p.pos} step={0.25} onChange={(i, n) => v3('pos', i, n)} />
        <Vec label="Rotation" unit="°" v={p.rot} step={15} onChange={(i, n) => v3('rot', i, n)} />
        <Vec label="Scale" unit="×" v={p.scl} step={0.1} onChange={(i, n) => v3('scl', i, n)} />
        <div className="grid grid-cols-3 gap-1">
          <button className="btn justify-center px-1 text-[11px]" title="Sit the part on the floor" onClick={() => v3('pos', 2, 0)}>
            To floor
          </button>
          <button className="btn justify-center px-1 text-[11px]" title="Move to the stage centre line" onClick={() => !p.parent && v3('pos', 0, setLine(useStore.getState().project).cx)} disabled={!!p.parent}>
            Centre
          </button>
          <button
            className="btn justify-center px-1 text-[11px]"
            title="Bake the scale into the size, so Scale is 1 again (like Apply Scale)"
            disabled={isGroup}
            onClick={() => up({ w: +(p.w * Math.abs(p.scl[0])).toFixed(3), d: +(p.d * Math.abs(p.scl[1])).toFixed(3), h: +(p.h * Math.abs(p.scl[2])).toFixed(3), scl: [1, 1, 1] })}
          >
            Apply scale
          </button>
        </div>
      </Section>

      {!isGroup && (
        <Section title="Shape">
          <div className="grid grid-cols-3 gap-2">
            <Num label="Width" value={p.w} onChange={(w) => up({ w: Math.max(0.01, w) })} unit="m" step={0.1} />
            <Num label="Depth" value={p.d} onChange={(d) => up({ d: Math.max(0.01, d) })} unit="m" step={0.1} />
            <Num label="Height" value={p.h} onChange={(h) => up({ h: Math.max(0.01, h) })} unit="m" step={0.1} />
          </div>
          {(p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'sphere' || p.kind === 'dome' || p.kind === 'lathe' || p.kind === 'torus') && (
            <Num label="Smoothness (sides)" value={p.seg ?? 32} onChange={(seg) => up({ seg: Math.round(Math.max(3, Math.min(128, seg))) })} step={1} int tip="3 = triangle, 4 = square, 6 = hexagon, 32+ = round." />
          )}
          {(p.kind === 'box' || p.kind === 'extrude') && <Num label="Bevel (rounded edges)" value={p.bevel ?? 0} onChange={(bevel) => up({ bevel: Math.max(0, bevel) })} unit="m" step={0.01} />}
          {p.kind === 'stairs' && <Num label="Steps" value={p.steps ?? 6} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(60, steps))) })} step={1} int />}
          {(p.kind === 'torus' || p.kind === 'dome') && <Num label="Sweep" value={p.arc ?? (p.kind === 'dome' ? 180 : 360)} onChange={(arc) => up({ arc: Math.max(1, Math.min(p.kind === 'dome' ? 180 : 360, arc)) })} unit="°" step={15} tip="Less than full makes an arch or partial dome." />}
          {p.kind === 'torus' && <Num label="Tube thickness" value={p.thick ?? 0.25} onChange={(thick) => up({ thick: Math.max(0.01, thick) })} unit="m" step={0.05} />}
          {p.kind === 'text' && (
            <label className="block">
              <span className="label">Text</span>
              <input className="field mt-1" value={p.text ?? ''} maxLength={60} onChange={(e) => up({ text: e.target.value })} />
            </label>
          )}
          {(p.kind === 'lathe' || p.kind === 'extrude') && <ProfileEditor p={p} />}
        </Section>
      )}

      {!isGroup && (
        <Section title="Material">
          <div className="grid grid-cols-5 gap-1">
            {Object.entries(MAT_PRESETS).map(([n, mt]) => (
              <button key={n} title={n} aria-label={`${n} material`} className="h-8 rounded-md border border-line hover:border-line-hi" style={{ background: mt.led ? 'linear-gradient(135deg,#2b0a5a,#ff4d8d,#ffb347)' : mt.color, boxShadow: mt.glow ? `0 0 10px ${mt.color}` : undefined, opacity: mt.opacity ?? 1 }} onClick={() => up({ mat: { ...mt, map: undefined } })} />
            ))}
          </div>
          <label className="flex items-center justify-between text-xs">
            <span className="label">Colour</span>
            <input type="color" value={p.mat.color} onChange={(e) => upMat({ color: e.target.value })} className="h-7 w-14 bg-transparent border border-line rounded" />
          </label>
          <Slider label="Metal" value={p.mat.metal} onChange={(metal) => upMat({ metal })} />
          <Slider label="Roughness" value={p.mat.rough} onChange={(rough) => upMat({ rough })} />
          <Slider label="Glow" value={p.mat.glow ?? 0} max={3} onChange={(glow) => upMat({ glow })} />
          <Slider label="Opacity" value={p.mat.opacity ?? 1} min={0.05} onChange={(opacity) => upMat({ opacity })} />
          <Check label="Show the set's LED content" checked={!!p.mat.led} onChange={(led) => upMat({ led })} tip="Uses the picture or video from Set Design → LED content." />
          <Check label="Wireframe" checked={!!p.mat.wire} onChange={(wire) => upMat({ wire })} />
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) upMat({ map: await readImage(f, 1024) })
              e.target.value = ''
            }}
          />
          <div className="flex gap-1">
            <button className="btn flex-1 justify-center" onClick={() => file.current?.click()}>
              <ImageIcon size={13} /> {p.mat.map ? 'Replace texture' : 'Image texture'}
            </button>
            {p.mat.map && (
              <button className="btn" onClick={() => upMat({ map: undefined })}>
                Remove
              </button>
            )}
          </div>
        </Section>
      )}

      <Section title="Modifiers">
        <Sel
          label="Array (repeat)"
          value={p.array && p.array.count > 1 ? p.array.mode : 'none'}
          onChange={(v) => up({ array: v === 'none' ? undefined : ({ mode: v, count: p.array?.count && p.array.count > 1 ? p.array.count : 4, offset: p.array?.offset ?? [Math.max(1, p.w * 1.5), 0, 0], radius: p.array?.radius ?? 3, angle: p.array?.angle ?? 360 } as PartArray) })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'linear', label: 'In a row' },
            { value: 'radial', label: 'In a circle' },
          ]}
          tip="Repeat this part (and everything in a group): rows of columns, circles of bulbs, staircases of lights."
        />
        {p.array && p.array.count > 1 && (
          <>
            <Num label="Copies" value={p.array.count} onChange={(count) => up({ array: { ...p.array!, count: Math.round(Math.max(2, Math.min(200, count))) } })} step={1} int />
            {p.array.mode === 'linear' ? (
              <Vec label="Step between copies" unit="m" v={p.array.offset} step={0.25} onChange={(i, n) => up({ array: { ...p.array!, offset: p.array!.offset.map((x, j) => (j === i ? n : x)) as Vec3 } })} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Radius" value={p.array.radius ?? 3} onChange={(radius) => up({ array: { ...p.array!, radius: Math.max(0, radius) } })} unit="m" step={0.25} />
                <Num label="Sweep" value={p.array.angle ?? 360} onChange={(angle) => up({ array: { ...p.array!, angle: Math.max(1, Math.min(360, angle)) } })} unit="°" step={15} />
              </div>
            )}
          </>
        )}
        {!p.parent && <Check label="Mirror across the stage centre" checked={!!p.mirror} onChange={(mirror) => up({ mirror })} tip="A live copy on the other side that follows every change." />}
        <div className="grid grid-cols-2 gap-1">
          <button className="btn justify-center text-[11px]" onClick={() => up({ hidden: !p.hidden })}>
            {p.hidden ? <Eye size={12} /> : <EyeOff size={12} />} {p.hidden ? 'Show' : 'Hide (H)'}
          </button>
          <button className="btn justify-center text-[11px]" onClick={() => up({ locked: !p.locked })}>
            {p.locked ? <Unlock size={12} /> : <Lock size={12} />} {p.locked ? 'Unlock' : 'Lock'}
          </button>
        </div>
      </Section>
    </>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="btn btn-icon h-7 w-7" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  )
}

function Vec({ label, v, unit, step, onChange }: { label: string; v: Vec3; unit: string; step: number; onChange: (i: number, n: number) => void }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {(['X', 'Y', 'Z'] as const).map((a, i) => (
          <Num key={a} label={a} value={+v[i].toFixed(3)} onChange={(n) => onChange(i, n)} unit={unit} step={step} />
        ))}
      </div>
    </div>
  )
}

function Slider({ label, value, onChange, min = 0, max = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[11px] text-dim">
        {label} <span className="mono text-mute">{value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-white" />
    </label>
  )
}

// Draw the side profile (spin) or the outline (extrude): drag points, click a line to add one, double-click a point to remove it.
function ProfileEditor({ p }: { p: Part }) {
  const pts = p.profile ?? []
  const lathe = p.kind === 'lathe'
  const S = 200
  const pad = 10
  const toPx = ([u, v]: [number, number]) => [pad + u * (S - 2 * pad), S - pad - v * (S - 2 * pad)]
  const toUv = (x: number, y: number): [number, number] => [Math.round(Math.min(1, Math.max(0, (x - pad) / (S - 2 * pad))) * 100) / 100, Math.round(Math.min(1, Math.max(0, (S - pad - y) / (S - 2 * pad))) * 100) / 100]
  const svg = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const set = (profile: [number, number][]) => updatePart(p.id, { profile })
  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S]
  }
  const presets = lathe ? LATHE_PRESETS : EXTRUDE_PRESETS
  return (
    <div className="space-y-2">
      <Sel label={lathe ? 'Profile' : 'Outline'} value="" onChange={(k) => k && set(presets[k])} options={[{ value: '', label: 'Pick a preset…' }, ...Object.keys(presets).map((k) => ({ value: k, label: k }))]} />
      <svg
        ref={svg}
        viewBox={`0 0 ${S} ${S}`}
        className="w-full aspect-square rounded-lg border border-line bg-ink touch-none"
        role="img"
        aria-label={lathe ? 'Side profile editor: the left edge is the spin axis' : 'Outline editor'}
        onPointerMove={(e) => {
          if (drag === null) return
          const [x, y] = local(e)
          const n = [...pts]
          n[drag] = toUv(x, y)
          set(n)
        }}
        onPointerUp={() => setDrag(null)}
        onClick={(e) => {
          if (drag !== null || (e.target as Element).tagName === 'circle') return
          const [x, y] = local(e)
          // Insert the new point on the nearest segment.
          let best = 0
          let bd = Infinity
          const n = lathe ? pts.length - 1 : pts.length
          for (let i = 0; i < n; i++) {
            const [ax, ay] = toPx(pts[i])
            const [bx, by] = toPx(pts[(i + 1) % pts.length])
            const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / Math.max(1, (bx - ax) ** 2 + (by - ay) ** 2)))
            const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)))
            if (d < bd) (bd = d), (best = i)
          }
          const c = [...pts]
          c.splice(best + 1, 0, toUv(x, y))
          set(c)
        }}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g} stroke="currentColor" className="text-line" strokeWidth={0.5}>
            <line x1={pad + g * (S - 2 * pad)} y1={pad} x2={pad + g * (S - 2 * pad)} y2={S - pad} />
            <line x1={pad} y1={pad + g * (S - 2 * pad)} x2={S - pad} y2={pad + g * (S - 2 * pad)} />
          </g>
        ))}
        {lathe && <line x1={pad} y1={0} x2={pad} y2={S} stroke="#e5484d" strokeDasharray="3 3" strokeWidth={1} />}
        <polyline points={[...pts, ...(lathe ? [] : pts.slice(0, 1))].map((q) => toPx(q).join(',')).join(' ')} fill={lathe ? 'none' : 'currentColor'} fillOpacity={0.12} stroke="currentColor" strokeWidth={1.5} className="text-fg" />
        {pts.map((q, i) => {
          const [x, y] = toPx(q)
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={5}
              className="fill-ink stroke-current text-fg cursor-grab"
              strokeWidth={1.5}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                setDrag(i)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (pts.length > 3) set(pts.filter((_, j) => j !== i))
              }}
            />
          )
        })}
      </svg>
      <p className="text-[10px] text-mute">{lathe ? 'The red line is the spin axis. ' : ''}Drag points · click a line to add a point · double-click a point to remove it.</p>
    </div>
  )
}
