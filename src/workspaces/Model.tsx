import { StudioEnv } from './StudioEnv'
import { CURVE_PRESETS } from '../lib/curvePresets'
import { fontState, subscribeFont } from '../lib/text3d'
import { CAGE_PRESETS, EMPTY_CAGE, hasCage } from '../lib/cage'
import { BRUSHES, SculptSession, hasMask, sculptAction, useSculpt } from './Sculpt'
import { useGlCreated } from '../components/Safe3D'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { guessMetres, rememberMesh, toUnit } from '../lib/meshImport'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, PerformanceMonitor, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { create } from 'zustand'
import {
  Box as BoxIcon,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  MapPin,
  Ruler,
  Scissors,
  Crosshair,
  ArrowDownToLine,
  Download,
  Eye,
  EyeOff,
  Focus,
  ScanEye,
  Folder,
  Group as GroupIcon,
  ImageIcon,
  Lock,
  Magnet,
  Maximize2,
  Move3d,
  Rotate3d,
  PersonStanding,
  Redo2,
  Trash2,
  Undo2,
  Video,
  Ungroup,
  Unlock,
} from 'lucide-react'
import { redo, undo, useStore } from '../store'
import type { Part, PartArray, PartKind, PartMat, SavedView, Vec3 } from '../types'
import { ASSEMBLIES, buildAssembly, childrenOf, descendants, duplicate, EXTRUDE_PRESETS, groupParts, LATHE_PRESETS, MAT_PRESETS, newPart, PART_KINDS, partArea, removeParts, ungroup } from '../lib/parts'
import { setLine } from '../lib/setpieces'
import { useTheme } from '../lib/theme'
import { fmt } from '../lib/calc'
import { Check, Num, Section, Sel, Stat } from '../components/ui'
import { PartsScene, fromThree, rotFromThree, type Shading } from './Parts3D'
import { alignMoves, boundsOf, distributeMoves, dropMove, gapBetween, matchScale, sizeOf, snapToParts, stackMove, type Axis3, type Box, type Edge } from '../lib/arrange'
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
  person: boolean // 1.75 m figure for scale
  snapParts: boolean // edges and centres catch nearby parts while moving
  isolate: string[] | null // show only these parts (and what's inside them)
  guides: [number, number, number][][] // snap lines while dragging, three.js coordinates
  dupOf: string[] // the copies made by the last duplicate
  dupBase: { pos: Vec3; rot: Vec3 } | null // where the copied part was, to learn the repeat step
  rep: { d: Vec3; r: Vec3 } | null // Ctrl+D: the move and turn to repeat on the next copy
  tool: 'ruler' | 'place' | 'draw' | null // click tools in the 3D view
  drawKind: PartKind | null // the shape to draw on the floor
  ruler: [number, number, number][] // measured points, three.js coordinates
  clip: { pos: Vec3; rot: Vec3; scl: Vec3 } | null // copied placement (position on stage)
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
  person: true,
  snapParts: true,
  isolate: null,
  guides: [],
  dupOf: [],
  dupBase: null,
  rep: null,
  tool: null,
  drawKind: null,
  ruler: [],
  clip: null,
  objs: {},
  set: (p) => set(p),
}))

const parts = () => useStore.getState().project.parts ?? []
const editParts = (fn: (ps: Part[]) => Part[]) => useStore.getState().mutate((p) => void (p.parts = fn(p.parts ?? [])))
// Whole-group colour schemes: parts take the palette's materials in turn; LED surfaces are left as they are.
const PALETTES: Record<string, PartMat[]> = {
  'Industrial silver': [MAT_PRESETS['Brushed steel'], MAT_PRESETS['Matte black'], MAT_PRESETS.Chrome],
  'Dark futuristic': [{ color: '#0b0b10', metal: 0.6, rough: 0.35 }, { color: '#00e5ff', metal: 0, rough: 0.4, glow: 2 }, { color: '#1a1a24', metal: 0.8, rough: 0.2 }],
  'White & gold': [MAT_PRESETS['Gloss white'], MAT_PRESETS.Gold, MAT_PRESETS['Gloss white']],
  'Black & hot pink': [MAT_PRESETS['Matte black'], MAT_PRESETS['Neon glow'], { color: '#2a0a1a', metal: 0.3, rough: 0.5 }],
}
function recolour(groupId: string, pal: PartMat[]) {
  editParts((ps) => {
    const ids = new Set(descendants(ps, groupId).map((x) => x.id))
    let i = 0
    return ps.map((x) => (ids.has(x.id) && x.kind !== 'group' && !x.mat.led ? { ...x, mat: { ...pal[i++ % pal.length], map: x.mat.map } } : x))
  })
}
const updatePart = (id: string, patch: Partial<Part>) => editParts((ps) => ps.map((x) => (x.id === id ? { ...x, ...patch } : x)))
const notify = (m: string) => useStore.getState().notify(m)

// ---------------------------------------------------------------- arranging (align, spread, drop, stack, snap)

/** The space a part takes up on stage (venue axes), measured from what is drawn. */
function boxOf(id: string | undefined): Box | null {
  const o = id ? useModel.getState().objs[id] : undefined
  if (!o?.parent) return null
  const b = new THREE.Box3().setFromObject(o)
  if (b.isEmpty()) return null
  return { min: [b.min.x, b.min.z, b.min.y], max: [b.max.x, b.max.z, b.max.y] }
}
function ancestorsOf(ps: Part[], id: string) {
  const out: string[] = []
  let p = ps.find((x) => x.id === id)
  while (p?.parent) {
    out.push(p.parent)
    p = ps.find((x) => x.id === p!.parent)
  }
  return out
}
/** Everything else to line up with: not the selection, what's inside it, or the groups it sits in. */
function otherBoxes(sel: string[]): Box[] {
  const ps = parts()
  const skip = new Set<string>()
  for (const id of sel) {
    skip.add(id)
    descendants(ps, id).forEach((d) => skip.add(d.id))
    ancestorsOf(ps, id).forEach((a) => skip.add(a))
  }
  return ps
    .filter((p) => !skip.has(p.id) && !p.hidden && p.array?.mode !== 'surface')
    .map((p) => boxOf(p.id))
    .filter((b): b is Box => !!b)
}
/** Selected parts that can move: unlocked, and not inside another selected group (it moves with it). */
function movable() {
  const { sel } = useModel.getState()
  const ps = parts()
  return sel
    .filter((id) => {
      const p = ps.find((x) => x.id === id)
      return p && !p.locked && !ancestorsOf(ps, id).some((a) => sel.includes(a))
    })
    .map((id) => ({ id, box: boxOf(id) }))
    .filter((x): x is { id: string; box: Box } => !!x.box)
}
/** Move parts by stage amounts in one undo step, whatever group they sit in. */
function moveParts(moves: Map<string, Vec3>) {
  const objs = useModel.getState().objs
  const pos = new Map<string, Vec3>()
  for (const [id, d] of moves) {
    const o = objs[id]
    if (!o?.parent || Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-6) continue
    o.parent.updateWorldMatrix(true, false)
    const w = o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(d[0], d[2], d[1]))
    pos.set(id, fromThree(o.parent.worldToLocal(w)).map((n) => Math.round(n * 1000) / 1000) as Vec3)
  }
  if (pos.size) editParts((ps) => ps.map((p) => (pos.has(p.id) ? { ...p, pos: pos.get(p.id)! } : p)))
  return pos.size
}
const AXIS_NAME = ['across', 'in depth', 'up'] as const
function alignSel(axis: Axis3, edge: Edge, toSelection: boolean) {
  const items = movable()
  const ref = toSelection ? boundsOf(items.map((x) => x.box)) : boxOf(useModel.getState().sel.at(-1))
  if (items.length < 2 || !ref) return notify('Select two or more parts to line up. The last one you pick stays put.')
  const m = alignMoves(items.map((x) => x.box), axis, edge, ref)
  moveParts(new Map(items.map((x, i) => [x.id, m[i]])))
}
function distributeSel(axis: Axis3, gap?: number) {
  const items = movable()
  if (items.length < (gap === undefined ? 3 : 2)) return notify(gap === undefined ? 'Select three or more parts to space evenly' : 'Select two or more parts to line up')
  const m = distributeMoves(items.map((x) => x.box), axis, gap)
  moveParts(new Map(items.map((x, i) => [x.id, m[i]])))
  notify(gap === undefined ? `Spaced ${items.length} parts evenly ${AXIS_NAME[axis]}` : `Lined up ${items.length} parts ${AXIS_NAME[axis]}, ${gap} m apart`)
}
/** Drop each selected part onto whatever is under it (another part, or the floor). Lowest first, so piles settle. */
export function dropSel() {
  const items = movable().sort((a, b) => a.box.min[2] - b.box.min[2])
  if (!items.length) return
  const support = otherBoxes(useModel.getState().sel)
  const moves = new Map<string, Vec3>()
  for (const x of items) {
    const d = dropMove(x.box, support)
    moves.set(x.id, d)
    support.push({ min: [x.box.min[0], x.box.min[1], x.box.min[2] + d[2]], max: [x.box.max[0], x.box.max[1], x.box.max[2] + d[2]] })
  }
  const n = moveParts(moves)
  notify(n ? `Dropped ${n === 1 ? 'onto what is below' : `${n} parts onto what is below`}` : 'Already resting on what is below')
}
/** Stack the other selected parts, centred, on top of the last one picked. */
function stackSel() {
  const { sel } = useModel.getState()
  let ref = boxOf(sel.at(-1))
  const items = movable().filter((x) => x.id !== sel.at(-1)).sort((a, b) => a.box.min[2] - b.box.min[2])
  if (!ref || !items.length) return notify('Select the parts to stack, then the one to stack them on last')
  const moves = new Map<string, Vec3>()
  for (const x of items) {
    const d = stackMove(x.box, ref)
    moves.set(x.id, d)
    ref = { min: [x.box.min[0] + d[0], x.box.min[1] + d[1], x.box.min[2] + d[2]], max: [x.box.max[0] + d[0], x.box.max[1] + d[1], x.box.max[2] + d[2]] }
  }
  moveParts(moves)
}
/** Scale the other selected parts to the size of the last one picked. */
function matchSel(axes: [boolean, boolean, boolean]) {
  const { sel } = useModel.getState()
  const ref = boxOf(sel.at(-1))
  const items = movable().filter((x) => x.id !== sel.at(-1))
  if (!ref || !items.length) return notify('Select the parts to resize, then the one whose size to copy last')
  const scl = new Map(items.map((x) => [x.id, x.box]))
  editParts((ps) => ps.map((p) => (scl.has(p.id) ? { ...p, scl: matchScale(scl.get(p.id)!, ref, p.scl, axes) } : p)))
}
/** Pick every part like the active one: same kind and colour. */
export function selectSimilar() {
  const { sel, set } = useModel.getState()
  const ps = parts()
  const a = ps.find((p) => p.id === sel.at(-1))
  if (!a) return
  const ids = ps.filter((p) => !p.hidden && p.kind === a.kind && (a.kind === 'group' || p.mat.color === a.mat.color) && p.array?.mode !== 'surface').map((p) => p.id)
  set({ sel: ids })
  notify(`Selected ${ids.length} similar ${ids.length === 1 ? 'part' : 'parts'}`)
}
/** Show only the selection (Blender's local view); press again to bring everything back. */
export function toggleIsolate() {
  const { isolate, sel, set } = useModel.getState()
  if (isolate) return set({ isolate: null })
  if (sel.length) set({ isolate: [...sel], frame: useModel.getState().frame + 1 })
}

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
        <ToolHint />
        <div className="absolute left-4 bottom-4 text-[11px] text-mute pointer-events-none hidden lg:block">
          G move · R rotate · S scale · X/Y/Z lock axis · Shift+D duplicate · Ctrl+D repeat · End drop · / isolate · Shift+G similar · Ctrl+G group · H hide · F frame · Shift+R ruler · P place on face · Alt free move
        </div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">{active ? <Props p={active} /> : <Overview />}</aside>
    </div>
  )
}

// ---------------------------------------------------------------- left: add + outliner

function AddPanel() {
  const kinds = Object.keys(PART_KINDS) as Exclude<PartKind, 'group'>[]
  const drawing = useModel((s) => (s.tool === 'draw' ? s.drawKind : null))
  const importRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={importRef}
        type="file"
        accept=".stl,.obj,.glb,.gltf,.fbx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importMesh(f)
          e.target.value = ''
        }}
      />
      <Section title="Add">
        {(['Basic', 'Stage', 'Advanced'] as const).map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-wider text-mute mb-1">{g}</div>
            <div className="grid grid-cols-3 gap-1 mb-2">
              {kinds
                .filter((k) => PART_KINDS[k].group === g && k !== 'mesh')
                .map((k) => (
                  <button
                    key={k}
                    className={`rounded-lg border px-1.5 py-2 text-[11px] hover:border-line-hi hover:bg-raised ${drawing === k ? 'border-fg bg-raised' : 'border-line'}`}
                    title={`${PART_KINDS[k].tip} Drag on the floor to draw it at any size, click once for the standard size, or double-click here to add it at the stage front.`}
                    onClick={() => startDraw(k)}
                    onDoubleClick={() => (useModel.getState().set({ tool: null, drawKind: null }), addPart(k))}
                  >
                    {PART_KINDS[k].name}
                  </button>
                ))}
              {g === 'Advanced' && (
                <button className="rounded-lg border border-dashed border-line px-1.5 py-2 text-[11px] hover:border-line-hi hover:bg-raised" title="Bring in your own STL, OBJ, GLB or FBX file (3D printing, CAD, Blender). It stays in this browser." onClick={() => importRef.current?.click()}>
                  Import STL / 3D
                </button>
              )}
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

// Duplicate. With repeat (Ctrl+D), like Tinkercad: copy, move or turn the copy, then Ctrl+D again places the
// next copy with the same step, so rows, stairs and circles take a few key presses.
export function duplicateSel(repeat = false) {
  const { sel, set, rep, dupOf } = useModel.getState()
  if (!sel.length) return
  const ps = parts()
  const step = repeat && rep && dupOf.length === sel.length && dupOf.every((id) => sel.includes(id)) ? rep : null
  const add = duplicate(ps, sel, step ? step.d : [1, 0, 0])
  const roots = add.filter((a) => !add.some((b) => b.id === a.parent))
  if (step) for (const r of roots) r.rot = r.rot.map((v, i) => Math.round((v + step.r[i]) * 10) / 10) as Vec3
  editParts((xs) => [...xs, ...add])
  const src = ps.find((p) => p.id === sel.at(-1))
  const ids = roots.map((a) => a.id)
  // The step is measured from the original, so the first move after a plain duplicate becomes the repeat.
  set({ sel: ids, mode: 'translate', dupOf: ids, dupBase: src ? { pos: [...src.pos] as Vec3, rot: [...src.rot] as Vec3 } : null, rep: step })
  if (step) notify('Repeated the last step. Keep pressing Ctrl+D for more.')
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
      if (mod && k === 'd') return (take(), duplicateSel(true))
      if (e.shiftKey && k === 'd') return (take(), duplicateSel())
      if (e.shiftKey && k === 'g') return (take(), selectSimilar())
      if (mod) return
      if (k === 'end') return (take(), dropSel())
      if (e.shiftKey && k === 'r') return (take(), m.set({ tool: m.tool === 'ruler' ? null : 'ruler', ruler: [] }))
      if (k === 'p') return (take(), m.sel.length ? m.set({ tool: m.tool === 'place' ? null : 'place' }) : undefined)
      if (k === 'escape' && m.tool) return (take(), m.set({ tool: null, ruler: [] }))
      if (k === '/' || e.code === 'NumpadDivide') return (take(), toggleIsolate())
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
    const alt = (e: KeyboardEvent) => (altDown = e.altKey)
    const off = () => (altDown = false)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keydown', alt)
    window.addEventListener('keyup', alt)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keydown', alt)
      window.removeEventListener('keyup', alt)
      window.removeEventListener('blur', off)
    }
  }, [])
}
// Hold Alt while dragging to move freely without snapping to other parts.
let altDown = false

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
  const canUndo = useSyncExternalStore(useStore.temporal.subscribe, () => useStore.temporal.getState().pastStates.length > 0)
  const canRedo = useSyncExternalStore(useStore.temporal.subscribe, () => useStore.temporal.getState().futureStates.length > 0)
  const b = (on: boolean) => `btn h-8 px-2 text-[11px] ${on ? 'btn-on' : ''}`
  const exportGlb = async () => {
    const r = root.current
    if (!r || !parts().length) return notify('Nothing to export yet. Add some parts first.')
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
    const copy = r.clone(true)
    const drop: THREE.Object3D[] = []
    copy.traverse((o) => ((o as THREE.LineSegments).isLineSegments || o.userData?.helper) && drop.push(o))
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
        <button className={`${b(false)} disabled:opacity-30`} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 size={13} />
        </button>
        <button className={`${b(false)} disabled:opacity-30`} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 size={13} />
        </button>
        <button className={`${b(false)} disabled:opacity-30`} title="Duplicate (Shift+D). Ctrl+D repeats your last move or turn on each new copy" aria-label="Duplicate selection" disabled={!m.sel.length} onClick={() => duplicateSel()}>
          <Copy size={13} />
        </button>
        <button className={`${b(false)} disabled:opacity-30 hover:text-err`} title="Delete (Del)" aria-label="Delete selection" disabled={!m.sel.length} onClick={deleteSel}>
          <Trash2 size={13} />
        </button>
      </div>
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
        <button className={b(m.snapParts)} title="Snap to other parts: edges and centres catch nearby parts and the floor while moving, with guide lines. Hold Alt to move freely" aria-pressed={m.snapParts} onClick={() => m.set({ snapParts: !m.snapParts })}>
          <Crosshair size={13} />
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
        <button className={b(!!m.isolate)} title="Show only the selected parts (/)" aria-pressed={!!m.isolate} disabled={!m.isolate && !m.sel.length} onClick={toggleIsolate}>
          <ScanEye size={13} />
        </button>
        <button className={b(m.tool === 'ruler')} title="Ruler: click two points to measure; corners and edges snap, hold Alt for anywhere (Shift+R)" aria-pressed={m.tool === 'ruler'} onClick={() => m.set({ tool: m.tool === 'ruler' ? null : 'ruler', ruler: [] })}>
          <Ruler size={13} />
        </button>
        <button className={b(m.tool === 'place')} title="Place on a face: click any surface to put the selected part on it, turned to match (P)" aria-pressed={m.tool === 'place'} disabled={!m.sel.length} onClick={() => m.set({ tool: m.tool === 'place' ? null : 'place' })}>
          <MapPin size={13} />
        </button>
        <button className={b(m.context)} title="Show the stage, truss, screens, set and decor around your parts" onClick={() => m.set({ context: !m.context })}>
          Stage & set
        </button>
        <QualityPick />
        <button className={b(false)} title="Download the parts as .glb for Blender and other 3D tools" onClick={exportGlb}>
          <Download size={13} />
          <span className="hidden xl:inline">.glb</span>
        </button>
        <button className={b(m.person)} title="Show a 1.75 m person for scale" onClick={() => m.set({ person: !m.person })} aria-pressed={m.person}>
          <PersonStanding size={13} />
        </button>
        <ViewsMenu />
        <RenderButton name={name} />
      </div>
    </div>
  )
}

// Live handles to the 3D view for one-off jobs started from the toolbar (still renders).
const view: { gl?: THREE.WebGLRenderer; scene?: THREE.Scene; camera?: THREE.PerspectiveCamera; invalidate?: () => void; controls?: { target: THREE.Vector3; update: () => void } } = {}
function ViewBridge() {
  const { gl, scene, camera, invalidate, controls } = useThree() as unknown as { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; invalidate: () => void; controls: ViewControls | null }
  useEffect(() => {
    Object.assign(view, { gl, scene, camera, invalidate, controls: controls ?? undefined })
    return () => void Object.assign(view, { gl: undefined, scene: undefined, camera: undefined, controls: undefined })
  }, [gl, scene, camera, invalidate, controls])
  return null
}
type ViewControls = { target: THREE.Vector3; update: () => void }

// Stable empty list: a fresh [] in a store selector would re-render forever.
const NO_VIEWS: SavedView[] = []

// Saved camera views: name the current view, come back to it later. Stored with the project.
function ViewsMenu() {
  const [open, setOpen] = useState(false)
  const views = useStore((s) => s.project.views ?? NO_VIEWS)
  const { mutate, notify } = useStore.getState()
  const save = () => {
    if (!view.camera || !view.controls) return
    const name = prompt('Name this view', `View ${views.length + 1}`)?.trim()
    if (!name) return
    const v = { id: Math.random().toString(36).slice(2, 9), name: name.slice(0, 40), pos: view.camera.position.toArray() as Vec3, target: view.controls.target.toArray() as Vec3 }
    mutate((p) => void (p.views = [...(p.views ?? []), v]))
    notify(`Saved view "${v.name}"`)
  }
  const go = (v: { pos: Vec3; target: Vec3 }) => {
    if (!view.camera || !view.controls) return
    view.camera.position.set(...v.pos)
    view.controls.target.set(...v.target)
    view.controls.update()
    view.invalidate?.()
    setOpen(false)
  }
  return (
    <div className="relative">
      <button className="btn h-8 px-2 text-[11px]" title="Save this camera view or go back to a saved one" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Video size={13} />
        <span className="hidden xl:inline">Views{views.length ? ` (${views.length})` : ''}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 card p-1 w-56 fade-in" onMouseLeave={() => setOpen(false)}>
          <button className="w-full text-left px-3 py-2 rounded-md hover:bg-lift text-xs font-medium" onClick={save}>
            + Save this view
          </button>
          {views.length > 0 && <div className="h-px bg-line my-1" />}
          {views.map((v) => (
            <div key={v.id} className="flex items-center gap-1">
              <button className="flex-1 text-left px-3 py-1.5 rounded-md hover:bg-lift text-xs truncate" onClick={() => go(v)}>
                {v.name}
              </button>
              <button className="btn btn-icon h-6 w-6" aria-label={`Delete view ${v.name}`} onClick={() => mutate((p) => void (p.views = (p.views ?? []).filter((x) => x.id !== v.id)))}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A 1.75 m person standing at the stage front, so sizes read at a glance (shown in renders too).
function ScaleFigure({ x, y, z }: { x: number; y: number; z: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a8f98', roughness: 0.7 }), [])
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <group position={[x, z, y]} userData={{ scaleFigure: true }}>
      <mesh material={mat} position={[-0.1, 0.43, 0]}>
        <capsuleGeometry args={[0.075, 0.7, 4, 12]} />
      </mesh>
      <mesh material={mat} position={[0.1, 0.43, 0]}>
        <capsuleGeometry args={[0.075, 0.7, 4, 12]} />
      </mesh>
      <mesh material={mat} position={[0, 1.15, 0]} scale={[1, 1, 0.62]}>
        <capsuleGeometry args={[0.2, 0.42, 4, 16]} />
      </mesh>
      <mesh material={mat} position={[-0.27, 1.12, 0]} rotation-z={0.08}>
        <capsuleGeometry args={[0.055, 0.55, 4, 10]} />
      </mesh>
      <mesh material={mat} position={[0.27, 1.12, 0]} rotation-z={-0.08}>
        <capsuleGeometry args={[0.055, 0.55, 4, 10]} />
      </mesh>
      <mesh material={mat} position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.115, 20, 16]} />
      </mesh>
    </group>
  )
}

function RenderButton({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const { notify } = useStore.getState()
  const go = async (w: number, h: number, passes: number) => {
    setOpen(false)
    if (!view.gl || !view.scene || !view.camera || progress !== null) return
    setProgress(0)
    try {
      const { renderStill } = await import('../lib/renderStill')
      const blob = await renderStill(view.gl, view.scene, view.camera, { width: w, height: h, passes, onProgress: setProgress })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(name || 'unifest-model').replace(/[^\w-]+/g, '-')}-render-${w}x${h}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 3000)
      notify(`Render saved: ${w} × ${h} PNG with soft shadows`)
    } catch {
      notify('Could not render: this device ran out of graphics memory. Try the HD size.')
    } finally {
      setProgress(null)
      view.invalidate?.()
    }
  }
  return (
    <div className="relative">
      <button className="btn h-8 px-2 text-[11px]" title="High-quality still image from this camera, with soft shadows" onClick={() => setOpen(!open)} disabled={progress !== null} aria-expanded={open}>
        <ImageIcon size={13} />
        <span className="hidden xl:inline">{progress === null ? 'Render' : `Rendering ${Math.round(progress * 100)}%`}</span>
        {progress !== null && <span className="xl:hidden mono">{Math.round(progress * 100)}%</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 card p-1 w-56 fade-in" onMouseLeave={() => setOpen(false)}>
          {(
            [
              ['HD still', '1920 × 1080 · quick', 1920, 1080, 16],
              ['4K still', '3840 × 2160 · for print and slides', 3840, 2160, 10],
              ['Square post', '1080 × 1080 · social media', 1080, 1080, 16],
            ] as const
          ).map(([t, sub, w, h, n]) => (
            <button key={t} className="w-full text-left px-3 py-2 rounded-md hover:bg-lift" onClick={() => go(w, h, n)}>
              <div className="text-xs font-medium">{t}</div>
              <div className="text-[10px] text-mute">{sub}</div>
            </button>
          ))}
        </div>
      )}
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
  // Isolate: everything outside the chosen parts is hidden for now (not saved, nothing to undo).
  const shown = useMemo(() => {
    if (!m.isolate) return project
    const ps = project.parts ?? []
    const keep = new Set<string>()
    for (const id of m.isolate) {
      keep.add(id)
      descendants(ps, id).forEach((d) => keep.add(d.id))
      ancestorsOf(ps, id).forEach((a) => keep.add(a))
    }
    return { ...project, parts: ps.map((p) => (keep.has(p.id) || p.hidden ? p : { ...p, hidden: true })) }
  }, [project, m.isolate])
  const video = !!project.setContent && !project.setContent.startsWith('data:') && all.some((p) => p.mat.led)
  const register = useCallback((id: string, o: THREE.Object3D | null) => {
    const objs = useModel.getState().objs
    if (o && objs[id] !== o) useModel.getState().set({ objs: { ...objs, [id]: o } })
  }, [])
  const pick = useCallback((id: string, e: ThreeEvent<MouseEvent>) => {
    if (useModel.getState().tool) return
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
      onPointerMissed={(e) => e.button === 0 && !e.shiftKey && !useModel.getState().tool && useModel.getState().set({ sel: [] })}
    >
      {q === 'auto' && <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.75, d - 0.25))} onIncline={() => setDpr((d) => Math.min(max, d + 0.25))} flipflops={4} />}
      <color attach="background" args={[light ? '#eeeeee' : '#0b0b0b']} />
      <hemisphereLight args={['#ffffff', light ? '#a0a0a0' : '#1c1c1c', light ? 1.6 : 1.2]} />
      <StudioEnv />
      <directionalLight position={[L.cx + 25, 40, L.front + 30]} intensity={1.8} castShadow={shadows} shadow-mapSize={[2048, 2048]} shadow-camera-left={-40} shadow-camera-right={40} shadow-camera-top={40} shadow-camera-bottom={-40} />
      <directionalLight position={[L.cx - 30, 20, L.front - 20]} intensity={0.5} />
      {shadows && (
        <mesh rotation-x={-Math.PI / 2} position={[L.cx, -0.002, L.front]} receiveShadow>
          <planeGeometry args={[300, 300]} />
          <shadowMaterial opacity={0.25} />
        </mesh>
      )}
      <Grid userData={{ helper: true }} position={[L.cx, 0.001, L.front]} args={[300, 300]} cellSize={1} sectionSize={5} cellColor={light ? '#d0d0d0' : '#1d1d1d'} sectionColor={light ? '#a8a8a8' : '#353535'} fadeDistance={180} infiniteGrid />
      {m.context && !m.isolate && (
        <group>
          <Things project={project} pick={() => undefined} />
          <SetItems project={project} show={false} dropAt={0} onInfo={() => undefined} />
        </group>
      )}
      <group ref={root}>
        <PartsScene project={shown} shading={m.shading} onPick={pick} register={register} selected={selSet} shadows={shadows} />
      </group>
      <Gizmo />
      <Guides />
      <PointerTools />
      <SizeBox />
      <RulerMarks />
      <ViewBridge />
      {m.person && <ScaleFigure x={L.cx + Math.min(6, L.w / 2 + 1.5)} y={L.front + 1.5} z={0} />}
      <SculptSession part={all.find((p) => p.id === m.sel[m.sel.length - 1])} objs={m.objs} />
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
  const { camera, gl, scene } = useThree()
  useEffect(() => void ((window as unknown as Record<string, unknown>).__model = { camera, gl, scene, ui: useModel }), [camera, gl, scene])
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
  const snap0 = useRef<{ w: THREE.Vector3; box: Box; others: Box[] } | null>(null)
  const sculpting = useSculpt((s) => s.on)
  const clickTool = useModel((s) => s.tool)
  // No move handles while sculpting, or on scattered copies (they always sit on their parent's surface).
  if (!part || !obj || part.locked || !obj.parent || clickTool || (sculpting && part.kind === 'sculpt') || part.array?.mode === 'surface') return null
  const snapshot = () => {
    start.current = new Map(sel.filter((id) => objs[id]).map((id) => [id, { p: objs[id].position.clone(), r: objs[id].rotation.clone(), s: objs[id].scale.clone() }]))
    const box = mode === 'translate' && useModel.getState().snapParts ? boxOf(active) : null
    snap0.current = box ? { w: obj.getWorldPosition(new THREE.Vector3()), box, others: otherBoxes(sel) } : null
  }
  // Edges and centres catch nearby parts and the floor; a guide line shows what it lined up with.
  const snapToOthers = () => {
    const s0 = snap0.current
    if (!s0 || altDown || !obj.parent) return useModel.getState().guides.length && useModel.getState().set({ guides: [] })
    const w = obj.getWorldPosition(new THREE.Vector3())
    const d = [w.x - s0.w.x, w.z - s0.w.z, w.y - s0.w.y]
    const box: Box = { min: s0.box.min.map((v, i) => v + d[i]) as Vec3, max: s0.box.max.map((v, i) => v + d[i]) as Vec3 }
    const dist = view.camera ? view.camera.position.distanceTo(w) : 30
    const s = snapToParts(box, s0.others, d.map((v) => Math.abs(v) > 1e-5) as [boolean, boolean, boolean], Math.min(0.5, Math.max(0.04, dist * 0.006)))
    if (s.hits.length) {
      w.add(new THREE.Vector3(s.move[0], s.move[2], s.move[1]))
      obj.position.copy(obj.parent.worldToLocal(w))
    }
    const c = (b: Box, axis: number, v: number) => {
      const p = [0, 1, 2].map((i) => (i === axis ? v : (b.min[i] + b.max[i]) / 2))
      return [p[0], p[2], p[1]] as [number, number, number]
    }
    const moved: Box = { min: box.min.map((v, i) => v + s.move[i]) as Vec3, max: box.max.map((v, i) => v + s.move[i]) as Vec3 }
    const guides = s.hits.filter((h) => h.other).map((h) => [c(moved, h.axis, h.value), c(h.other!, h.axis, h.value)])
    const was = useModel.getState().guides
    if (guides.length || was.length) useModel.getState().set({ guides })
  }
  const follow = () => {
    const a = start.current.get(active)
    if (!a) return
    if (mode === 'translate') snapToOthers()
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
    snap0.current = null
    const ui = useModel.getState()
    if (ui.guides.length) ui.set({ guides: [] })
    // Moving or turning a fresh copy teaches Ctrl+D the step to repeat.
    if (ui.dupBase && ui.dupOf.length === sel.length && ui.dupOf.every((id) => sel.includes(id))) {
      const pos = fromThree(obj.position)
      const rot = rotFromThree(obj.rotation)
      ui.set({ rep: { d: pos.map((v, i) => r2(v - ui.dupBase!.pos[i])) as Vec3, r: rot.map((v, i) => r2(v - ui.dupBase!.rot[i], 10)) as Vec3 } })
    }
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
      <FloatingCheck />
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
            <IconBtn title="Duplicate (Shift+D)" onClick={() => duplicateSel()}>
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
        {!isGroup && (
          <Check
            label="Hole: cut it out of the other parts in its group"
            checked={!!p.cutter}
            onChange={(v) => {
              up({ cutter: v || undefined })
              if (v && !p.parent) notify('Now group it with the parts to cut (select them all, Ctrl+G)')
            }}
          />
        )}
        {p.parent && (
          <button className="btn w-full justify-center text-[11px]" onClick={() => useModel.getState().set({ sel: [p.parent!] })}>
            Select the group it belongs to
          </button>
        )}
      </Section>

      <ArrangePanel />

      <Section title="Transform">
        <Vec label="Location" unit="m" v={p.pos} step={0.25} onChange={(i, n) => v3('pos', i, n)} />
        <Vec label="Rotation" unit="°" v={p.rot} step={15} onChange={(i, n) => v3('rot', i, n)} />
        <Vec label="Scale" unit="×" v={p.scl} step={0.1} onChange={(i, n) => v3('scl', i, n)} />
        <ClipRow />
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

      {p.kind === 'sculpt' && <SculptPanel p={p} />}
      {p.kind === 'path' && <CurvePanel p={p} />}

      {!isGroup && p.kind !== 'sculpt' && p.kind !== 'path' && (
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
          {p.kind === 'drape' && (
            <div className="grid grid-cols-3 gap-2">
              <Num label="Folds" value={p.steps ?? 14} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(80, steps))) })} step={1} int tip="Number of pleats across. Depth sets how deep they are." />
              <Num label="Swags" value={p.swags ?? 0} onChange={(swags) => up({ swags: Math.round(Math.max(0, Math.min(20, swags))) })} step={1} int tip="Scallops along the top: 0 is a straight curtain." />
              <Num label="Swag dip" value={Math.round((p.sag ?? 0.25) * 100)} onChange={(sg) => up({ sag: Math.max(0, Math.min(90, sg)) / 100 })} unit="%" step={5} />
            </div>
          )}
          {p.kind === 'geodome' && <Num label="Detail" value={p.steps ?? 2} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(4, steps))) })} step={1} int tip="1 = few big triangles, 4 = many small ones." />}
          {p.kind === 'truss' && <Num label="Bays" value={p.steps ?? 6} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(60, steps))) })} step={1} int tip="Sections along the length, each with cross bracing." />}
          {p.kind === 'helix' && <Num label="Turns" value={p.steps ?? 3} onChange={(steps) => up({ steps: Math.max(0.25, Math.min(30, steps)) })} step={0.5} />}
          {p.kind === 'tree' && <Num label="Tiers" value={p.steps ?? 3} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(8, steps))) })} step={1} int />}
          {p.kind === 'tree' && <Num label="Sides" value={p.seg ?? 7} onChange={(seg) => up({ seg: Math.round(Math.max(3, Math.min(32, seg))) })} step={1} int tip="Low numbers look faceted and stylised." />}
          {(p.kind === 'geodome' || p.kind === 'truss' || p.kind === 'helix') && <Num label={p.kind === 'helix' ? 'Tube radius' : 'Strut radius'} value={p.thick ?? 0.04} onChange={(thick) => up({ thick: Math.max(0.005, thick) })} unit="m" step={0.01} />}
          {p.kind === 'mesh' && (
            <>
              <p className="text-[11px] text-mute">Your imported file. Drag the box handles or type a size to resize it. The file stays in this browser; on another computer, import it again.</p>
              <button className="btn w-full justify-center text-[11px]" title="For files that came in lying down (made with Z as up)" onClick={() => up({ zUp: !p.zUp, w: p.w, h: p.d, d: p.h })}>
                Stand it up / lay it down
              </button>
            </>
          )}
          {p.kind === 'stairs' && <Num label="Steps" value={p.steps ?? 6} onChange={(steps) => up({ steps: Math.round(Math.max(1, Math.min(60, steps))) })} step={1} int />}
          {(p.kind === 'torus' || p.kind === 'dome') && <Num label="Sweep" value={p.arc ?? (p.kind === 'dome' ? 180 : 360)} onChange={(arc) => up({ arc: Math.max(1, Math.min(p.kind === 'dome' ? 180 : 360, arc)) })} unit="°" step={15} tip="Less than full makes an arch or partial dome." />}
          {p.kind === 'torus' && <Num label="Tube thickness" value={p.thick ?? 0.25} onChange={(thick) => up({ thick: Math.max(0.01, thick) })} unit="m" step={0.05} />}
          {p.kind === 'text' && (
            <label className="block">
              <span className="label">Text</span>
              <input className="field mt-1" value={p.text ?? ''} maxLength={60} onChange={(e) => up({ text: e.target.value })} />
            </label>
          )}
          {p.kind === 'text' && <Text3dToggle p={p} />}
          {(p.kind === 'lathe' || p.kind === 'extrude') && <ProfileEditor p={p} />}
          {p.kind !== 'plane' && p.kind !== 'text' && p.kind !== 'drape' && <CageEditor p={p} />}
          {(p.kind === 'box' || p.kind === 'extrude') && (
            <>
              <Sel
                label="Cut-outs"
                value={p.holes?.shape ?? 'none'}
                onChange={(v) => up({ holes: v === 'none' ? undefined : { cols: 3, rows: 2, size: 0.6, ...p.holes, shape: v as NonNullable<Part['holes']>['shape'] } })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'square', label: 'Windows' },
                  { value: 'arch', label: 'Arched openings' },
                  { value: 'circle', label: 'Portholes' },
                  { value: 'diamond', label: 'Diamond lattice' },
                ]}
                tip="Cut openings through the shape. Any opening that would cross the edge is left out, so it stays solid."
              />
              {p.holes && (
                <div className="grid grid-cols-3 gap-2">
                  <Num label="Across" value={p.holes.cols} onChange={(cols) => up({ holes: { ...p.holes!, cols: Math.round(Math.max(1, Math.min(30, cols))) } })} step={1} int />
                  <Num label="Up" value={p.holes.rows} onChange={(rows) => up({ holes: { ...p.holes!, rows: Math.round(Math.max(1, Math.min(30, rows))) } })} step={1} int />
                  <Num label="Size" value={Math.round(p.holes.size * 100)} onChange={(sz) => up({ holes: { ...p.holes!, size: Math.max(10, Math.min(95, sz)) / 100 } })} unit="%" step={5} />
                </div>
              )}
            </>
          )}
          {p.kind !== 'plane' && p.kind !== 'text' && p.kind !== 'drape' && (
            <div className="grid grid-cols-2 gap-2">
              <Num label="Taper (top size)" value={p.taper ?? 1} onChange={(taper) => up({ taper: Math.max(0, Math.min(3, taper)) })} step={0.05} tip="1 = straight sides, 0.5 = half as wide at the top (angled towers), 0 = a point." />
              <Num label="Twist" value={p.twist ?? 0} onChange={(twist) => up({ twist: Math.max(-720, Math.min(720, twist)) })} unit="°" step={15} tip="Turn the top relative to the bottom: twisted columns and flowing forms." />
            </div>
          )}
          {p.kind !== 'plane' && p.kind !== 'text' && p.kind !== 'drape' && (
            <div className="grid grid-cols-3 gap-2">
              <Num label="Bend" value={p.bend ?? 0} onChange={(bend) => up({ bend: Math.max(-359, Math.min(359, bend)) })} unit="°" step={15} tip="Curl the width into an arc: 180° turns a flat ribbon into a standing arch; negative curls upwards." />
              <Num label="Sculpt" value={Math.round((p.organic ?? 0) * 100)} onChange={(o) => up({ organic: Math.max(0, Math.min(100, o)) / 100 })} unit="%" step={5} tip="Smooth sculpted bumps over the surface, for organic forms. Works best on spheres and big boxes." />
              <Num label="Pattern" value={p.seed ?? 1} onChange={(seed) => up({ seed: Math.round(seed) })} step={1} int tip="Try other numbers for a different sculpted pattern." />
            </div>
          )}
        </Section>
      )}

      {isGroup && (
        <Section title="Recolour the whole group">
          <p className="text-[11px] text-mute">Change every part inside at once. LED surfaces keep their content.</p>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(PALETTES).map(([name, pal]) => (
              <button key={name} className="btn h-8 text-[11px] justify-start" onClick={() => recolour(p.id, pal)}>
                <span className="flex gap-0.5">
                  {pal.map((m, i) => (
                    <span key={i} className="h-3 w-3 rounded-sm border border-line" style={{ background: m.color }} />
                  ))}
                </span>
                {name}
              </button>
            ))}
          </div>
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
            ...(parts().find((x) => x.id === p.parent)?.kind === 'path' ? [{ value: 'path', label: 'Along its curve' }] : []),
            ...(parts().some((x) => x.id === p.parent && x.kind !== 'group' && x.kind !== 'path') ? [{ value: 'surface', label: 'Scattered over its parent' }] : []),
          ]}
          tip="Repeat this part (and everything in a group): rows of columns, circles of bulbs, staircases of lights."
        />
        {p.array && p.array.count > 1 && (
          <>
            <Num label="Copies" value={p.array.count} onChange={(count) => up({ array: { ...p.array!, count: Math.round(Math.max(2, Math.min(p.array!.mode === 'surface' ? 1500 : 200, count))) } })} step={1} int />
            {p.array.mode === 'surface' && <Num label="Pattern" value={p.seed ?? 1} onChange={(seed) => up({ seed: Math.round(seed) })} step={1} int tip="Try other numbers for a different arrangement." />}
            <div className="grid grid-cols-2 gap-2">
              <Num label={p.array.mode === 'surface' ? 'Size variation' : 'Grow each copy'} value={Math.round((p.array.grow ?? 0) * 100)} onChange={(g) => up({ array: { ...p.array!, grow: Math.max(-90, Math.min(200, g)) / 100 } })} unit="%" step={5} tip="Each copy is taller (or shorter) than the last: fins that rise towards the outside." />
              <Num label={p.array.mode === 'surface' ? 'Random turn' : 'Turn each copy'} value={p.array.turn ?? 0} onChange={(turn) => up({ array: { ...p.array!, turn } })} unit="°" step={5} />
            </div>
            {p.array.mode === 'linear' && <Check label="Both ways, mirrored (symmetric)" checked={!!p.array.symmetric} onChange={(symmetric) => up({ array: { ...p.array!, symmetric } })} tip="Copies spread out on both sides of the original, the far side mirrored." />}
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={!!p.array.alt} onChange={(e) => up({ array: { ...p.array!, alt: e.target.checked ? '#ff2d95' : undefined } })} />
              Alternate colour
              {p.array.alt && <input type="color" value={p.array.alt} onChange={(e) => up({ array: { ...p.array!, alt: e.target.value } })} className="h-6 w-8 bg-transparent" aria-label="Alternate colour" />}
            </label>
            {p.array.mode === 'path' || p.array.mode === 'surface' ? null : p.array.mode === 'linear' ? (
              <Vec label="Step between copies" unit="m" v={p.array.offset} step={0.25} onChange={(i, n) => up({ array: { ...p.array!, offset: p.array!.offset.map((x, j) => (j === i ? n : x)) as Vec3 } })} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Num label="Radius" value={p.array.radius ?? 3} onChange={(radius) => up({ array: { ...p.array!, radius: Math.max(0, radius) } })} unit="m" step={0.25} />
                <Num label="Sweep" value={p.array.angle ?? 360} onChange={(angle) => up({ array: { ...p.array!, angle: Math.max(1, Math.min(360, angle)) } })} unit="°" step={15} />
              </div>
            )}
          </>
        )}
        {p.kind !== 'group' && p.kind !== 'path' && (
          <button
            className="btn w-full justify-center text-[11px]"
            title="Adds small flowers you can swap for any shape; they cover this part's surface"
            onClick={() => {
              const f = newPart('sphere', [0, 0, 0], { parent: p.id, name: 'Scattered flowers', w: 0.25, d: 0.25, h: 0.2, organic: 0.3, mat: { color: '#f4a6c8', metal: 0, rough: 0.8 }, array: { mode: 'surface', count: 150, offset: [0, 0, 0], grow: 0.35, turn: 360 } })
              editParts((ps) => [...ps, f])
              useModel.getState().set({ sel: [f.id] })
            }}
          >
            Scatter flowers on this surface
          </button>
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
  const curve = p.kind === 'path'
  // Open line: spin profiles and curves that don't loop.
  const open = lathe || (curve && !p.closed)
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
  const presets = lathe ? LATHE_PRESETS : curve ? CURVE_PRESETS : EXTRUDE_PRESETS
  return (
    <div className="space-y-2">
      <Sel label={lathe ? 'Profile' : curve ? 'Curve shape' : 'Outline'} value="" onChange={(k) => k && set(presets[k])} options={[{ value: '', label: 'Pick a preset…' }, ...Object.keys(presets).map((k) => ({ value: k, label: k }))]} />
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
          const n = open ? pts.length - 1 : pts.length
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
        <polyline points={[...pts, ...(open ? [] : pts.slice(0, 1))].map((q) => toPx(q).join(',')).join(' ')} fill={open || curve ? 'none' : 'currentColor'} fillOpacity={0.12} stroke="currentColor" strokeWidth={1.5} className="text-fg" />
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

// Brush sculpting controls for a "Sculpt clay" part.
function SculptPanel({ p }: { p: Part }) {
  const sc = useSculpt()
  const objs = useModel((s) => s.objs)
  const masked = sc.maskVer >= 0 && hasMask(p.id)
  const up = (patch: Partial<Part>) => updatePart(p.id, patch)
  const restart = (patch: Partial<Part>) => {
    if (p.sculpt && !confirm('This starts the sculpt again from the plain shape. Your current sculpting is lost (Ctrl+Z brings it back). Continue?')) return
    up({ ...patch, sculpt: undefined })
  }
  return (
    <Section title="Sculpt">
      <button className={`btn w-full justify-center h-9 ${sc.on ? 'btn-on' : ''}`} onClick={() => sc.set({ on: !sc.on })} aria-pressed={sc.on}>
        {sc.on ? 'Sculpt mode on: brush the shape' : 'Turn on Sculpt mode'}
      </button>
      <div className="grid grid-cols-3 gap-1">
        {BRUSHES.map((b) => (
          <button key={b.id} className={`btn h-8 px-1 text-[11px] justify-center ${sc.brush === b.id ? 'btn-on' : ''}`} title={b.tip} onClick={() => sc.set({ brush: b.id, on: true })}>
            {b.name}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-mute leading-snug">{BRUSHES.find((b) => b.id === sc.brush)?.tip}</p>
      {sc.brush === 'paint' && (
        <label className="flex items-center gap-2 text-[11px]">
          <input type="color" value={sc.color} onChange={(e) => sc.set({ color: e.target.value })} className="h-7 w-10 rounded border border-line bg-transparent" aria-label="Paint colour" />
          Paint colour
          {p.paint && (
            <button className="btn h-7 px-2 ml-auto text-[11px]" title="Remove all paint (Ctrl+Z brings it back)" onClick={() => sculptAction(p, objs[p.id], 'unpaint')}>
              Remove paint
            </button>
          )}
        </label>
      )}
      {(sc.brush === 'mask' || masked) && (
        <div className="grid grid-cols-2 gap-1">
          <button className="btn h-7 justify-center text-[11px]" title="Masked becomes free and free becomes masked" onClick={() => sculptAction(p, objs[p.id], 'invert')}>
            Invert mask
          </button>
          <button className="btn h-7 justify-center text-[11px]" disabled={!masked} onClick={() => sculptAction(p, objs[p.id], 'clear')}>
            Clear mask
          </button>
        </div>
      )}
      <Slider label={`Radius ${sc.radius.toFixed(2)} m  ([ and ])`} value={sc.radius} min={0.05} max={Math.max(1, Math.max(p.w, p.h, p.d) * 0.6)} onChange={(radius) => sc.set({ radius })} />
      <Slider label={`Strength ${Math.round(sc.strength * 100)}%`} value={sc.strength} onChange={(strength) => sc.set({ strength })} />
      <Check label="Mirror left and right" checked={sc.sym} onChange={(sym) => sc.set({ sym })} tip="Every stroke is repeated on the other side of the part." />
      <p className="text-[10px] text-mute leading-relaxed">Drag on the shape to sculpt. Ctrl inverts (carve, shrink, spread); Shift smooths. Drag off the shape to orbit. Each stroke is one undo step. A drawing pen's pressure sets the strength.</p>
      <div className="grid grid-cols-2 gap-2">
        <Sel
          label="Start from"
          value={p.base ?? 'sphere'}
          onChange={(v) => restart({ base: v as Part['base'] })}
          options={[
            { value: 'sphere', label: 'Ball' },
            { value: 'block', label: 'Block' },
            { value: 'panel', label: 'Relief panel' },
          ]}
        />
        <Sel
          label="Detail"
          value={p.res ?? 'medium'}
          onChange={(v) => restart({ res: v as Part['res'] })}
          options={[
            { value: 'low', label: 'Low (fastest)' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
          tip="More detail allows finer strokes but is heavier. Medium suits most laptops."
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Num label="Width" value={p.w} onChange={(w) => up({ w: Math.max(0.05, w) })} unit="m" step={0.1} />
        <Num label="Depth" value={p.d} onChange={(d) => up({ d: Math.max(0.05, d) })} unit="m" step={0.1} />
        <Num label="Height" value={p.h} onChange={(h) => up({ h: Math.max(0.05, h) })} unit="m" step={0.1} />
      </div>
      {p.sculpt && (
        <button className="btn w-full justify-center text-[11px]" title="Soften the whole shape a little (masked areas stay as they are)" onClick={() => sculptAction(p, objs[p.id], 'relax')}>
          Relax whole shape
        </button>
      )}
      {p.sculpt && (
        <button className="btn w-full justify-center text-[11px]" onClick={() => confirm('Reset the sculpt to the plain shape? (Ctrl+Z undoes this.)') && up({ sculpt: undefined })}>
          Reset shape
        </button>
      )}
    </Section>
  )
}

// A curve: what is built along it, which view it is drawn in, and its points.
function CurvePanel({ p }: { p: Part }) {
  const up = (patch: Partial<Part>) => updatePart(p.id, patch)
  const repeat = () => {
    const fin = newPart('box', [0, 0, 0], { parent: p.id, name: 'Along the curve', w: 0.2, d: 0.6, h: 1.2, taper: 0.3, mat: MAT_PRESETS['Brushed steel'], array: { mode: 'path', count: 12, offset: [0, 0, 0] } })
    editParts((ps) => [...ps, fin])
    useModel.getState().set({ sel: [fin.id] })
  }
  return (
    <Section title="Curve">
      <div className="grid grid-cols-2 gap-2">
        <Sel
          label="Build"
          value={p.form ?? 'tube'}
          onChange={(v) => up({ form: v as Part['form'] })}
          options={[
            { value: 'tube', label: 'Tube (pipe, neon)' },
            { value: 'ribbon', label: 'Ribbon / wall' },
            { value: 'guide', label: 'Guide only' },
          ]}
          tip="A ribbon drawn in the top view stands up as a curved wall as tall as the Height."
        />
        <Sel
          label="Drawn in"
          value={p.plane ?? 'front'}
          onChange={(v) => up({ plane: v as Part['plane'] })}
          options={[
            { value: 'front', label: 'Side view (up)' },
            { value: 'top', label: 'Top view (floor)' },
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Num label="Width" value={p.w} onChange={(w) => up({ w: Math.max(0.1, w) })} unit="m" step={0.5} />
        <Num label={p.plane === 'top' ? 'Depth' : 'Height'} value={p.plane === 'top' ? p.d : p.h} onChange={(v) => up(p.plane === 'top' ? { d: Math.max(0.1, v) } : { h: Math.max(0.1, v) })} unit="m" step={0.5} />
        <Num label={p.form === 'ribbon' ? 'Thickness' : 'Tube radius'} value={p.thick ?? 0.12} onChange={(thick) => up({ thick: Math.max(0.01, thick) })} unit="m" step={0.02} />
      </div>
      {p.form === 'ribbon' && <Num label={p.plane === 'top' ? 'Wall height' : 'Ribbon width'} value={p.plane === 'top' ? p.h : p.d} onChange={(v) => up(p.plane === 'top' ? { h: Math.max(0.05, v) } : { d: Math.max(0.05, v) })} unit="m" step={0.1} />}
      <Check label="Closed loop" checked={!!p.closed} onChange={(closed) => up({ closed })} />
      <ProfileEditor p={p} />
      <p className="text-[10px] text-mute">Drag points to shape the curve, click the line to add a point, double-click a point to remove it.</p>
      <button className="btn w-full justify-center text-[11px]" onClick={repeat}>
        Repeat a part along this curve
      </button>
    </Section>
  )
}

// Cage deform: drag the 3×3 handles in the front or side view to bend the whole shape smoothly.
function CageEditor({ p }: { p: Part }) {
  const [view, setView] = useState<'front' | 'side'>('front')
  const [open, setOpen] = useState(hasCage(p.cage))
  const [drag, setDrag] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const grid = p.cage?.[view] ?? EMPTY_CAGE
  const S = 180
  const pad = 40
  const inner = S - pad * 2
  const set = (g: number[] | undefined, v = view) => {
    const next = { ...p.cage, [v]: g && g.some((x) => Math.abs(x) > 1e-4) ? g : undefined }
    updatePart(p.id, { cage: next.front || next.side ? next : undefined })
  }
  // Handle i at column i % 3, row floor(i / 3) from the bottom.
  const at = (i: number): [number, number] => [pad + ((i % 3) / 2 + grid[i * 2]) * inner, S - pad - (Math.floor(i / 3) / 2 + grid[i * 2 + 1]) * inner]
  const local = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S]
  }
  if (!open)
    return (
      <button className="btn w-full justify-center text-[11px]" onClick={() => setOpen(true)} title="Bend the whole shape with a 3×3 grid of handles">
        Cage deform…
      </button>
    )
  const lines: [number, number][] = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8], [0, 3], [3, 6], [1, 4], [4, 7], [2, 5], [5, 8]]
  return (
    <div className="space-y-2 rounded-lg border border-line p-2">
      <div className="flex items-center gap-1">
        <span className="label flex-1">Cage deform</span>
        {(['front', 'side'] as const).map((v) => (
          <button key={v} className={`btn h-6 px-2 text-[10px] ${view === v ? 'btn-on' : ''}`} onClick={() => setView(v)}>
            {v === 'front' ? 'Front' : 'Side'}
          </button>
        ))}
      </div>
      <Sel
        label="Preset"
        value=""
        onChange={(k) => {
          const pr = k ? CAGE_PRESETS[k] : null
          if (pr) updatePart(p.id, { cage: { front: pr.front, side: pr.side } })
        }}
        options={[{ value: '', label: 'Pick a shape…' }, ...Object.keys(CAGE_PRESETS).map((k) => ({ value: k, label: k }))]}
      />
      <svg
        ref={svg}
        viewBox={`0 0 ${S} ${S}`}
        className="w-full aspect-square rounded-md bg-ink touch-none"
        role="img"
        aria-label={`Cage handles, ${view} view`}
        onPointerMove={(e) => {
          if (drag === null) return
          const [x, y] = local(e)
          const g = [...grid]
          g[drag * 2] = Math.round(Math.max(-0.6, Math.min(0.6, (x - pad) / inner - (drag % 3) / 2)) * 100) / 100
          g[drag * 2 + 1] = Math.round(Math.max(-0.6, Math.min(0.6, (S - pad - y) / inner - Math.floor(drag / 3) / 2)) * 100) / 100
          set(g)
        }}
        onPointerUp={() => setDrag(null)}
      >
        <rect x={pad} y={pad} width={inner} height={inner} fill="none" stroke="currentColor" className="text-line" strokeDasharray="3 3" />
        {lines.map(([a, b]) => {
          const [x1, y1] = at(a)
          const [x2, y2] = at(b)
          return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" className="text-dim" strokeWidth={1} />
        })}
        {Array.from({ length: 9 }, (_, i) => {
          const [x, y] = at(i)
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={6}
              className="fill-ink stroke-current text-fg cursor-grab"
              strokeWidth={1.5}
              onPointerDown={(e) => {
                ;(e.target as Element).setPointerCapture?.(e.pointerId)
                setDrag(i)
              }}
              onDoubleClick={() => {
                const g = [...grid]
                g[i * 2] = 0
                g[i * 2 + 1] = 0
                set(g)
              }}
            />
          )
        })}
        <text x={S / 2} y={S - 8} textAnchor="middle" className="fill-current text-mute" fontSize={9}>
          {view === 'front' ? 'across →' : 'depth →'}
        </text>
      </svg>
      <div className="flex gap-1">
        <button className="btn flex-1 justify-center text-[11px]" onClick={() => set(undefined)}>
          Reset {view}
        </button>
        <button className="btn flex-1 justify-center text-[11px]" onClick={() => (updatePart(p.id, { cage: undefined }), setOpen(false))}>
          Remove cage
        </button>
      </div>
      <p className="text-[10px] text-mute">Drag a handle to bend the shape; double-click a handle to put it back.</p>
    </div>
  )
}

function Text3dToggle({ p }: { p: Part }) {
  const st = useSyncExternalStore(subscribeFont, fontState)
  return (
    <div className="space-y-1">
      <Check label="3D letters (extruded)" checked={!!p.solid} onChange={(solid) => updatePart(p.id, { solid, d: solid && p.d < 0.15 ? 0.3 : p.d })} tip="Solid letters with depth, for stage-front signs and logos. Depth sets how thick they are." />
      {p.solid && st === 'loading' && <p className="text-[10px] text-mute">Loading the 3D font…</p>}
      {p.solid && st === 'failed' && <p className="text-[10px] text-warn">The 3D font could not load (offline?). The sign shows flat for now.</p>}
      {p.solid && <Num label="Rounded edges" value={p.bevel ?? 0} onChange={(bevel) => updatePart(p.id, { bevel: Math.max(0, Math.min(1, bevel)) })} step={1} int tip="0 = sharp, 1 = rounded letter edges." />}
    </div>
  )
}

// Snap guide lines drawn while dragging (hidden in renders).
function Guides() {
  const g = useModel((s) => s.guides)
  const geo = useMemo(() => {
    const b = new THREE.BufferGeometry()
    b.setAttribute('position', new THREE.Float32BufferAttribute(g.flat(2), 3))
    return b
  }, [g])
  useEffect(() => () => geo.dispose(), [geo])
  if (!g.length) return null
  return (
    <lineSegments geometry={geo} userData={{ helper: true }} renderOrder={999}>
      <lineBasicMaterial color="#ff3df0" depthTest={false} transparent />
    </lineSegments>
  )
}

const ALIGN: { axis: Axis3; name: string; edges: [Edge, string][] }[] = [
  { axis: 0, name: 'Across', edges: [['min', 'Left'], ['mid', 'Centre'], ['max', 'Right']] },
  { axis: 1, name: 'Depth', edges: [['min', 'Back'], ['mid', 'Middle'], ['max', 'Front']] },
  { axis: 2, name: 'Height', edges: [['min', 'Bottom'], ['mid', 'Middle'], ['max', 'Top']] },
]
const m2 = (n: number) => `${fmt(Math.abs(n) < 0.005 ? 0 : n, 2)}`

// Align, spread, drop, stack, match size and measure: the everyday helpers for putting parts together.
function ArrangePanel() {
  const sel = useModel((s) => s.sel)
  const objs = useModel((s) => s.objs)
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const [toSel, setToSel] = useState(false)
  const [gap, setGap] = useState(0.5)
  const [m, setM] = useState<{ a: Box | null; b: Box | null }>({ a: null, b: null })
  const many = sel.length > 1
  // Measured after the 3D view has caught up with the latest edit.
  useEffect(() => {
    const r = requestAnimationFrame(() => setM({ a: boxOf(sel.at(-1)), b: sel.length > 1 ? boxOf(sel.at(-2)) : null }))
    return () => cancelAnimationFrame(r)
  }, [sel, objs, all])
  const g = m.a && m.b ? gapBetween(m.b, m.a) : null
  const prev = all.find((p) => p.id === sel.at(-2))
  const btn = 'btn justify-center px-1 text-[11px] disabled:opacity-30'
  return (
    <Section title="Arrange">
      {m.a && (
        <p className="text-[11px] text-mute">
          Size on stage: <span className="text-fg tabular-nums">{sizeOf(m.a).map(m2).join(' × ')} m</span>
          {g && (
            <>
              <br />
              Gap to {prev?.name ?? 'the other part'}: <span className="text-fg tabular-nums">{g.gap.map((v, i) => `${['across', 'depth', 'up'][i]} ${v < -0.005 ? `overlaps ${m2(-v)}` : m2(Math.max(0, v))}`).join(' · ')} m</span>
            </>
          )}
        </p>
      )}
      {many ? (
        <>
          <div className="flex items-center justify-between">
            <span className="label">Line up</span>
            <div className="flex gap-0.5 text-[11px]">
              <button className={`btn h-6 px-2 text-[11px] ${!toSel ? 'btn-on' : ''}`} title="Others move to the last part you picked" onClick={() => setToSel(false)}>
                to last picked
              </button>
              <button className={`btn h-6 px-2 text-[11px] ${toSel ? 'btn-on' : ''}`} title="Line up within the box around the whole selection" onClick={() => setToSel(true)}>
                to selection
              </button>
            </div>
          </div>
          {ALIGN.map((r) => (
            <div key={r.axis} className="grid grid-cols-[52px_1fr_1fr_1fr] gap-1 items-center">
              <span className="text-[11px] text-mute">{r.name}</span>
              {r.edges.map(([e, label]) => (
                <button key={e} className={btn} title={`Line up ${label.toLowerCase()} ${r.name === 'Height' ? 'edges' : 'sides'} ${AXIS_NAME[r.axis]}`} onClick={() => alignSel(r.axis, e, toSel)}>
                  {label}
                </button>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-[52px_1fr_1fr_1fr] gap-1 items-center">
            <span className="text-[11px] text-mute">Space evenly</span>
            {([0, 1, 2] as Axis3[]).map((a) => (
              <button key={a} className={btn} disabled={sel.length < 3} title={`Keep the outer two in place and make the gaps ${AXIS_NAME[a]} equal (3 or more parts)`} onClick={() => distributeSel(a)}>
                {['Across', 'Depth', 'Up'][a]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[52px_1fr_1fr_1fr] gap-1 items-end">
            <Num label="Gap" unit="m" step={0.1} min={0} value={gap} onChange={setGap} />
            {([0, 1, 2] as Axis3[]).map((a) => (
              <button key={a} className={btn} title={`Put them in a row ${AXIS_NAME[a]}, exactly ${gap} m apart`} onClick={() => distributeSel(a, gap)}>
                {['Row', 'Line', 'Pile'][a]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-mute">Shift-click more parts to line them up, space them evenly or stack them. The last one you pick is the one the others follow.</p>
      )}
      <div className="grid grid-cols-2 gap-1">
        <button className={btn} title="Drop onto whatever is below: another part or the floor (End)" onClick={dropSel}>
          <ArrowDownToLine size={12} /> Drop down
        </button>
        <button className={btn} disabled={!many} title="Stack the others, centred, on top of the last part you picked" onClick={stackSel}>
          Stack on top
        </button>
        <button className={btn} disabled={!many} title="Make the others the same size as the last part you picked (best on parts that aren't turned)" onClick={() => matchSel([true, true, true])}>
          Match size
        </button>
        <button className={btn} title="Select every part of the same kind and colour (Shift+G)" onClick={selectSimilar}>
          Select similar
        </button>
        <button className={`${btn} col-span-2`} disabled={!many} title="Cut the last part you picked out of the others (it becomes a hole, and they are grouped)" onClick={cutSel}>
          <Scissors size={12} /> Cut out the last picked
        </button>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- click tools: ruler and place on a face

const ray = new THREE.Raycaster()
/** What the pointer is over: the first visible part or set surface (not helpers), else the floor. */
function pointAt(e: PointerEvent, el: HTMLElement, camera: THREE.Camera, scene: THREE.Scene, skip?: THREE.Object3D) {
  const r = el.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
  const usable = (o: THREE.Object3D | null) => {
    for (let x = o; x; x = x.parent) {
      if (!x.visible || x.userData?.helper || (x as unknown as { isTransformControls?: boolean }).isTransformControls || x === skip) return false
    }
    return true
  }
  for (const h of ray.intersectObjects(scene.children, true)) {
    if (!(h.object as THREE.Mesh).isMesh || !usable(h.object)) continue
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0)
    if (n.dot(ray.ray.direction) > 0) n.negate()
    return { point: h.point, normal: n, object: h.object }
  }
  const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  return p ? { point: p, normal: new THREE.Vector3(0, 1, 0), object: null } : null
}

/** Corners, edge middles and face centres of the thing under the pointer pull the ruler point onto them. */
function snapPoint(p: THREE.Vector3, o: THREE.Object3D | null, reach: number) {
  if (!o) return p
  const b = new THREE.Box3().setFromObject(o)
  if (b.isEmpty()) return p
  const xs = [b.min.x, (b.min.x + b.max.x) / 2, b.max.x]
  const ys = [b.min.y, (b.min.y + b.max.y) / 2, b.max.y]
  const zs = [b.min.z, (b.min.z + b.max.z) / 2, b.max.z]
  let best = p
  let d = reach
  for (const x of xs) for (const y of ys) for (const z of zs) {
    const q = new THREE.Vector3(x, y, z)
    const k = q.distanceTo(p)
    if (k < d) (d = k), (best = q)
  }
  return best
}

function PointerTools() {
  const tool = useModel((s) => s.tool)
  const { gl, camera, scene } = useThree()
  useEffect(() => {
    if (tool !== 'draw') return
    return drawTool(gl.domElement, camera, scene)
  }, [tool, gl, camera, scene])
  useEffect(() => {
    if (!tool || tool === 'draw') return
    const el = gl.domElement
    el.style.cursor = 'crosshair'
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => void (e.button === 0 && (down = { x: e.clientX, y: e.clientY }))
    const onUp = (e: PointerEvent) => {
      if (!down || e.button !== 0) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 // a drag orbits the view instead
      down = null
      if (moved) return
      const m = useModel.getState()
      if (m.tool === 'ruler') {
        const hit = pointAt(e, el, camera, scene)
        if (!hit) return
        const p = e.altKey ? hit.point : snapPoint(hit.point, hit.object, camera.position.distanceTo(hit.point) * 0.025)
        const pt = p.toArray() as [number, number, number]
        m.set({ ruler: m.ruler.length >= 2 ? [pt] : [...m.ruler, pt] })
      } else if (m.tool === 'place') placeOnFace(e, el, camera, scene)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.style.cursor = ''
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }, [tool, gl, camera, scene])
  return null
}

/** Put the selected part on the clicked surface, standing out from it (its bottom on the face). */
function placeOnFace(e: PointerEvent, el: HTMLElement, camera: THREE.Camera, scene: THREE.Scene) {
  const m = useModel.getState()
  const id = m.sel.at(-1)
  const part = parts().find((p) => p.id === id)
  const o = id ? m.objs[id] : undefined
  if (!part || !o?.parent || part.locked) return m.set({ tool: null })
  const hit = pointAt(e, el, camera, scene, o)
  if (!hit) return
  // How far the part's origin sits above its own bottom while upright, kept along the new 'up'.
  o.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(o)
  const lift = o.getWorldPosition(new THREE.Vector3()).y - box.min.y
  const turn = !e.altKey && hit.normal.y < 0.999
  const q = turn ? new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal) : o.getWorldQuaternion(new THREE.Quaternion())
  const world = hit.point.clone().addScaledVector(turn ? hit.normal : new THREE.Vector3(0, 1, 0), lift)
  o.parent.updateWorldMatrix(true, false)
  const local = o.parent.worldToLocal(world)
  const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)
  const r2 = (n: number, k = 1000) => Math.round(n * k) / k
  editParts((ps) =>
    ps.map((p) =>
      p.id === part.id
        ? { ...p, pos: fromThree(local).map((n) => r2(n)) as Vec3, rot: turn ? (rotFromThree(new THREE.Euler().setFromQuaternion(pq, o.rotation.order)).map((n) => r2(n, 10)) as Vec3) : p.rot }
        : p,
    ),
  )
  m.set({ tool: null })
  notify(`Placed ${part.name} on the surface${turn ? ', turned to match' : ''}`)
}

function RulerMarks() {
  const pts = useModel((s) => s.ruler)
  const tool = useModel((s) => s.tool)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.length === 2 ? pts.flat() : [], 3))
    return g
  }, [pts])
  useEffect(() => () => geo.dispose(), [geo])
  if (tool !== 'ruler' || !pts.length) return null
  const [a, b] = pts
  const d = b ? [b[0] - a[0], b[2] - a[2], b[1] - a[1]] : null
  return (
    <group userData={{ helper: true }}>
      {pts.map((p, i) => (
        <mesh key={i} position={p} renderOrder={999}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshBasicMaterial color="#ffd400" depthTest={false} transparent />
        </mesh>
      ))}
      {b && (
        <>
          <lineSegments geometry={geo} renderOrder={999}>
            <lineBasicMaterial color="#ffd400" depthTest={false} transparent />
          </lineSegments>
          <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center style={{ pointerEvents: 'none' }}>
            <div className="glass rounded-lg px-2 py-1 text-[11px] whitespace-nowrap tabular-nums">
              <b>{fmt(Math.hypot(...d!), 2)} m</b>
              <span className="text-mute"> · across {fmt(Math.abs(d![0]), 2)} · depth {fmt(Math.abs(d![1]), 2)} · up {fmt(Math.abs(d![2]), 2)}</span>
            </div>
          </Html>
        </>
      )}
    </group>
  )
}

function ToolHint() {
  const tool = useModel((s) => s.tool)
  const n = useModel((s) => s.ruler.length)
  const kind = useModel((s) => s.drawKind)
  if (!tool) return null
  const text =
    tool === 'draw'
      ? `Drag on the floor to draw the ${kind ? PART_KINDS[kind as Exclude<PartKind, 'group'>]?.name.toLowerCase() : 'shape'}, or click once for the standard size. Shift keeps it square.`
      : tool === 'ruler'
      ? n === 1
        ? 'Click the second point. Corners and edges snap; hold Alt for anywhere.'
        : 'Ruler: click two points to measure. Corners and edges snap; hold Alt for anywhere.'
      : 'Click any surface to put the selected part on it, turned to match. Hold Alt to keep it upright.'
  return (
    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 glass rounded-xl px-3 py-1.5 text-[11px] flex items-center gap-2 max-w-[90%]">
      <span>{text}</span>
      <button className="btn h-6 px-2 text-[11px]" onClick={() => useModel.getState().set({ tool: null, ruler: [], drawKind: null })}>
        {tool === 'draw' ? 'Cancel (Esc)' : 'Done (Esc)'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- more helpers

/** Make the last picked part a hole in the others: grouped together if they aren't already. */
function cutSel() {
  const { sel, set } = useModel.getState()
  const ps = parts()
  const id = sel.at(-1)
  const tool = ps.find((p) => p.id === id)
  if (!tool || sel.length < 2 || tool.kind === 'group') return notify('Select the parts to cut, then the shape to cut with last')
  const same = sel.every((s) => ps.find((p) => p.id === s)?.parent === tool.parent) && !!tool.parent
  if (same) editParts((xs) => xs.map((p) => (p.id === id ? { ...p, cutter: true } : p)))
  else {
    const r = groupParts(ps, sel)
    editParts(() => r.parts.map((p) => (p.id === id ? { ...p, cutter: true } : p)))
    if (r.group) set({ sel: [r.group.id] })
  }
  notify(`${tool.name} is now a hole in the others. Untick "Hole" on it to undo, or move it to change the cut.`)
}

/** Copy a part's place, turn and size, and paste any of them onto other parts. */
function ClipRow() {
  const clip = useModel((s) => s.clip)
  const copy = () => {
    const { sel, objs, set } = useModel.getState()
    const p = parts().find((x) => x.id === sel.at(-1))
    const o = p && objs[p.id]
    if (!p || !o) return
    set({ clip: { pos: fromThree(o.getWorldPosition(new THREE.Vector3())), rot: [...p.rot] as Vec3, scl: [...p.scl] as Vec3 } })
    notify('Copied its place, turn and size')
  }
  const paste = (what: 'pos' | 'rot' | 'scl') => {
    const c = useModel.getState().clip
    if (!c) return
    if (what === 'pos') {
      const items = movable()
      const objs = useModel.getState().objs
      moveParts(new Map(items.map((x) => {
        const w = fromThree(objs[x.id].getWorldPosition(new THREE.Vector3()))
        return [x.id, [c.pos[0] - w[0], c.pos[1] - w[1], c.pos[2] - w[2]] as Vec3]
      })))
    } else {
      const ids = new Set(movable().map((x) => x.id))
      editParts((ps) => ps.map((p) => (ids.has(p.id) ? { ...p, [what]: [...c[what]] as Vec3 } : p)))
    }
  }
  const btn = 'btn justify-center px-1 text-[11px] disabled:opacity-30'
  return (
    <div className="grid grid-cols-4 gap-1">
      <button className={btn} title="Copy this part's place on stage, turn and size" onClick={copy}>
        <ClipboardCopy size={12} />
      </button>
      {(['pos', 'rot', 'scl'] as const).map((k) => (
        <button key={k} className={btn} disabled={!clip} title={`Paste the copied ${{ pos: 'place on stage', rot: 'turn', scl: 'scale' }[k]} onto the selected parts`} onClick={() => paste(k)}>
          <ClipboardPaste size={12} /> {{ pos: 'Place', rot: 'Turn', scl: 'Size' }[k]}
        </button>
      ))}
    </div>
  )
}

/** Parts hanging in the air with nothing under them: often a slip, one click to settle them. */
function FloatingCheck() {
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const objs = useModel((s) => s.objs)
  const [ids, setIds] = useState<string[]>([])
  useEffect(() => {
    const r = requestAnimationFrame(() => {
      const roots = childrenOf(all, undefined).filter((p) => !p.hidden && !p.cutter)
      const boxes = roots.map((p) => ({ id: p.id, box: boxOf(p.id) })).filter((x): x is { id: string; box: Box } => !!x.box)
      setIds(boxes.filter((x) => x.box.min[2] > 0.02 && dropMove(x.box, boxes.filter((y) => y !== x).map((y) => y.box))[2] < -0.02).map((x) => x.id))
    })
    return () => cancelAnimationFrame(r)
  }, [all, objs])
  if (!ids.length) return null
  return (
    <div className="rounded-lg border border-line p-2 text-[11px] space-y-1.5">
      <p>
        <b>{ids.length}</b> {ids.length === 1 ? 'part is' : 'parts are'} in the air with nothing under {ids.length === 1 ? 'it' : 'them'}. Fine for hanging pieces; otherwise settle them.
      </p>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn justify-center text-[11px]" onClick={() => useModel.getState().set({ sel: ids })}>
          Select them
        </button>
        <button
          className="btn justify-center text-[11px]"
          onClick={() => {
            useModel.getState().set({ sel: ids })
            dropSel()
            useModel.getState().set({ sel: [] })
          }}
        >
          <ArrowDownToLine size={12} /> Drop them
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- draw on the floor and resize with handles

function startDraw(kind: PartKind) {
  const m = useModel.getState()
  if (m.tool === 'draw' && m.drawKind === kind) return m.set({ tool: null, drawKind: null })
  m.set({ tool: 'draw', drawKind: kind, ruler: [] })
}

// Long thin things (signs, drapes, beams) follow the drag as a line; everything else fills the dragged rectangle.
const LINEAR = new Set<PartKind>(['text', 'drape', 'truss', 'extrude', 'stairs', 'ramp'])

/** Drag on the floor (or on top of a part) to draw the chosen shape; a click places it at its standard size. */
function drawTool(el: HTMLElement, camera: THREE.Camera, scene: THREE.Scene) {
  el.style.cursor = 'crosshair'
  let draft: { id: string; a: THREE.Vector3; y0: number; def: Vec3; moved: boolean } | null = null
  let frame = 0
  const planeHit = (e: PointerEvent, y: number) => {
    const r = el.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), new THREE.Vector3())
  }
  const snap = (v: number) => (useStore.getState().ui.magnet ? Math.round(v * 4) / 4 : Math.round(v * 100) / 100)
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return
    const kind = useModel.getState().drawKind
    if (!kind || kind === 'group') return
    // Keep the view from orbiting and the click from selecting while drawing.
    e.stopImmediatePropagation()
    e.preventDefault()
    const hit = pointAt(e, el, camera, scene)
    const onTop = hit && hit.object && hit.normal.y > 0.7
    const y0 = onTop ? hit!.point.y : 0
    const a = onTop ? hit!.point.clone() : planeHit(e, 0)
    if (!a) return
    a.x = snap(a.x)
    a.z = snap(a.z)
    const k = PART_KINDS[kind as Exclude<PartKind, 'group'>]
    const n = newPart(kind, [a.x, a.z, +y0.toFixed(3)])
    editParts((ps) => [...ps, n])
    useModel.getState().set({ sel: [n.id] })
    draft = { id: n.id, a, y0, def: k.size, moved: false }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  const move = (e: PointerEvent) => {
    if (!draft) return
    const d0 = draft
    const b = planeHit(e, d0.y0)
    if (!b) return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const dx = snap(b.x - d0.a.x)
      const dz = snap(b.z - d0.a.z)
      if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) return
      d0.moved = true
      const [dw, dd, dh] = d0.def
      const kind = useModel.getState().drawKind!
      let patch: Partial<Part>
      if (LINEAR.has(kind)) {
        const len = Math.max(0.1, Math.hypot(dx, dz))
        patch = { w: +len.toFixed(2), h: +(dh * (kind === 'truss' || kind === 'text' ? 1 : len / dw)).toFixed(2), pos: [d0.a.x + dx / 2, d0.a.z + dz / 2, +d0.y0.toFixed(3)], rot: [0, 0, +THREE.MathUtils.radToDeg(Math.atan2(-dz, dx)).toFixed(1)] }
      } else {
        let w = Math.max(0.05, Math.abs(dx))
        let d = Math.max(0.05, Math.abs(dz))
        if (e.shiftKey) w = d = Math.max(w, d)
        const sx = Math.sign(dx) || 1
        const sz = Math.sign(dz) || 1
        const h = kind === 'plane' ? dh : dh * Math.sqrt((w / dw) * (d / dd))
        patch = { w: +w.toFixed(2), d: +d.toFixed(2), h: +h.toFixed(2), pos: [d0.a.x + (sx * w) / 2, d0.a.z + (sz * d) / 2, +d0.y0.toFixed(3)] }
      }
      editParts((ps) => ps.map((p) => (p.id === d0.id ? { ...p, ...patch } : p)))
    })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    const d0 = draft
    draft = null
    if (!d0) return
    const name = PART_KINDS[useModel.getState().drawKind as Exclude<PartKind, 'group'>]?.name ?? 'Shape'
    useModel.getState().set({ tool: null, drawKind: null, sel: [d0.id], mode: 'translate' })
    notify(d0.moved ? `Drew a ${name.toLowerCase()}. Drag the box handles to resize it.` : `Added a ${name.toLowerCase()} at the standard size`)
  }
  el.addEventListener('pointerdown', down, true)
  return () => {
    el.style.cursor = ''
    el.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointermove', move)
    cancelAnimationFrame(frame)
  }
}

type Handle = { x: -1 | 0 | 1; y: 0 | 0.5 | 1; z: -1 | 0 | 1; corner: boolean }
const HANDLES: Handle[] = [
  { x: 1, y: 0.5, z: 0, corner: false },
  { x: -1, y: 0.5, z: 0, corner: false },
  { x: 0, y: 0.5, z: 1, corner: false },
  { x: 0, y: 0.5, z: -1, corner: false },
  { x: 0, y: 1, z: 0, corner: false },
  ...([-1, 1] as const).flatMap((x) => ([-1, 1] as const).flatMap((z) => ([0, 1] as const).map((y) => ({ x, y, z, corner: true })))),
]

/**
 * The selected part's size box: drag a side to stretch one way (the opposite side stays put), the top to make
 * it taller, a corner to grow or shrink it evenly. The size shows next to it. Snaps to 5 cm with the magnet on.
 */
function SizeBox() {
  const sel = useModel((s) => s.sel)
  const objs = useModel((s) => s.objs)
  const tool = useModel((s) => s.tool)
  const sculpting = useSculpt((s) => s.on)
  const all = useStore((s) => s.project.parts ?? NO_PARTS)
  const { camera, gl, invalidate } = useThree()
  const grp = useRef<THREE.Group>(null)
  const knobs = useRef<THREE.Group>(null)
  const p = sel.length === 1 ? all.find((x) => x.id === sel[0]) : undefined
  const obj = p ? objs[p.id] : undefined
  const W = p ? p.w * Math.abs(p.scl[0]) : 1
  const D = p ? p.d * Math.abs(p.scl[1]) : 1
  const H = p ? p.h * Math.abs(p.scl[2]) : 1
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0)), [W, H, D])
  useEffect(() => () => edges.dispose(), [edges])
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), [])
  // Follow the part every frame (also while the move handles drag it) and keep the knobs a steady size on screen.
  useFrame(() => {
    if (!grp.current || !obj?.parent) return
    obj.updateWorldMatrix(true, false)
    obj.matrixWorld.decompose(tmp.v, tmp.q, tmp.s)
    grp.current.position.copy(tmp.v)
    grp.current.quaternion.copy(tmp.q)
    const k = camera.position.distanceTo(tmp.v) * 0.011
    knobs.current?.children.forEach((c) => c.scale.setScalar(k))
  })
  const show = p && obj?.parent && p.kind !== 'group' && p.kind !== 'path' && !p.locked && !tool && !(sculpting && p.kind === 'sculpt') && p.array?.mode !== 'surface'
  if (!show) return null
  const controls = () => view.controls as unknown as { enabled: boolean } | undefined
  const start = (h: Handle) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const c = controls()
    if (c) c.enabled = false
    obj!.updateWorldMatrix(true, false)
    const O = obj!.getWorldPosition(new THREE.Vector3())
    const q = obj!.getWorldQuaternion(new THREE.Quaternion())
    const hl = new THREE.Vector3((h.x * W) / 2, h.y * H, (h.z * D) / 2)
    const opp = new THREE.Vector3((-h.x * W) / 2, (1 - h.y) * H, (-h.z * D) / 2)
    const dirL = h.corner ? hl.clone().sub(opp) : new THREE.Vector3(h.x, h.y === 1 ? 1 : 0, h.z)
    const len = dirL.length()
    const u = dirL.clone().applyQuaternion(q).normalize()
    const P0 = hl.clone().applyQuaternion(q).add(O)
    const part = p!
    const magnet = useStore.getState().ui.magnet
    let raf = 0
    const r2 = (n: number) => Math.round(n * 1000) / 1000
    const move = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera)
      const v = ray.ray.direction
      const w0 = P0.clone().sub(ray.ray.origin)
      const b = u.dot(v)
      if (Math.abs(1 - b * b) < 1e-6) return
      let t = (b * v.dot(w0) - u.dot(w0)) / (1 - b * b)
      let nW = W
      let nH = H
      let nD = D
      const shift = new THREE.Vector3()
      if (h.corner) {
        const f = Math.max(0.05, (len + t) / len)
        ;[nW, nH, nD] = [W * f, H * f, D * f]
        const far = opp.clone().add(hl.clone().sub(opp).multiplyScalar(f))
        shift.set((opp.x + far.x) / 2, Math.min(opp.y, far.y), (opp.z + far.z) / 2)
      } else {
        const size = h.x ? W : h.z ? D : H
        let n = Math.max(0.02, size + t)
        if (magnet) n = Math.max(0.05, Math.round(n * 20) / 20)
        t = n - size
        if (h.x) (nW = n), shift.set((h.x * t) / 2, 0, 0)
        else if (h.z) (nD = n), shift.set(0, 0, (h.z * t) / 2)
        else nH = n
      }
      const world = shift.applyQuaternion(q).add(O)
      const pos = fromThree(obj!.parent!.worldToLocal(world)).map(r2) as Vec3
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        editParts((ps) => ps.map((x) => (x.id === part.id ? { ...x, pos, w: r2(nW / Math.abs(part.scl[0] || 1)), d: r2(nD / Math.abs(part.scl[1] || 1)), h: r2(nH / Math.abs(part.scl[2] || 1)) } : x))),
      )
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      const c2 = controls()
      if (c2) c2.enabled = true
      document.body.style.cursor = ''
      invalidate()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }
  return (
    <group ref={grp} userData={{ helper: true }}>
      <lineSegments geometry={edges} renderOrder={998}>
        <lineBasicMaterial color="#9aa0aa" depthTest={false} transparent opacity={0.7} />
      </lineSegments>
      <group ref={knobs}>
        {HANDLES.map((h, i) => (
          <mesh
            key={i}
            position={[(h.x * W) / 2, h.y * H, (h.z * D) / 2]}
            renderOrder={999}
            onPointerDown={start(h)}
            onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = h.corner ? 'nwse-resize' : 'ew-resize'))}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <boxGeometry args={h.corner ? [0.9, 0.9, 0.9] : [0.7, 0.7, 0.7]} />
            <meshBasicMaterial color={h.corner ? '#e6e6e6' : '#7c8594'} depthTest={false} transparent />
          </mesh>
        ))}
      </group>
      <Html position={[W / 2, 0, D / 2]} style={{ pointerEvents: 'none' }}>
        <div className="glass rounded-md px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums translate-x-2 translate-y-1">
          {fmt(W, 2)} × {fmt(D, 2)} × {fmt(H, 2)} m
        </div>
      </Html>
    </group>
  )
}

/** Import an STL, OBJ, GLB or FBX file as a part (stored in this browser like Decor's imported models). */
async function importMesh(f: File) {
  try {
    notify(`Importing ${f.name}…`)
    const { saveModel } = await import('../lib/models')
    const m = await saveModel(f)
    const { loadModel } = await import('./Decor3D')
    const zUp = /\.stl$/i.test(f.name)
    const u = toUnit(await loadModel(m.id), zUp)
    rememberMesh(m.id, zUp, u.geo)
    const g = guessMetres(u.size)
    const L = setLine(useStore.getState().project)
    const r = (n: number) => Math.max(0.01, +(n * g.scale).toFixed(3))
    const n = newPart('mesh', [L.cx, L.front + 2, 0], { name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported', modelId: m.id, zUp, w: r(u.size.x), d: r(u.size.z), h: r(u.size.y) })
    editParts((ps) => [...ps, n])
    useModel.getState().set({ sel: [n.id], frame: useModel.getState().frame + 1 })
    notify(`Imported ${Math.round(u.triangles).toLocaleString('en-IN')} triangles, read as ${g.unit}. Drag the box handles to resize.${u.triangles > 400_000 ? ' It is heavy: it may slow older laptops.' : ''}`)
  } catch (e) {
    notify((e as Error).message || 'Could not import that file')
  }
}
