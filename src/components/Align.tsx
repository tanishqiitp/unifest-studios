import { create } from 'zustand'
import { Group, Line } from 'react-konva'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Crosshair,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../store'
import { useView } from './PlanCanvas'
import { applyBox, CAD_EDITS, cadItems, toRect, type Box3, type CadItem } from '../lib/cad'
import { alignBoxes, snapRect, type AlignOp, type Guide } from '../lib/snap'
import { stageBounds } from '../lib/calc'
import { real } from '../lib/theme'

// ---------------------------------------------------------------- live guide lines

// The guides of the drag in progress, tagged with the pane that draws them.
export const useGuides = create<{ pane: string | null; lines: Guide[]; set: (pane: string | null, lines: Guide[]) => void }>((set) => ({
  pane: null,
  lines: [],
  set: (pane, lines) => set({ pane, lines }),
}))

export function SnapGuides({ pane }: { pane: string }) {
  const v = useView()
  const g = useGuides()
  if (g.pane !== pane || !g.lines.length) return null
  return (
    <Group listening={false}>
      {g.lines.map((l, i) => (
        <Line
          key={i}
          points={l.vertical ? [l.at, l.from, l.at, l.to] : [l.from, l.at, l.to, l.at]}
          stroke={real('#ff4fa3')}
          strokeWidth={1.25}
          dash={[6 / v.scale, 4 / v.scale]}
          strokeScaleEnabled={false}
        />
      ))}
    </Group>
  )
}

// ---------------------------------------------------------------- align bar

type Btn = { op: AlignOp | 'stage-top' | 'stage-centre'; icon: LucideIcon; tip: string; min: number }
const BTNS: (Btn | '|')[] = [
  { op: 'x-min', icon: AlignStartVertical, tip: 'Line up left edges', min: 2 },
  { op: 'x-mid', icon: AlignCenterVertical, tip: 'Line up centres across', min: 2 },
  { op: 'x-max', icon: AlignEndVertical, tip: 'Line up right edges', min: 2 },
  '|',
  { op: 'y-min', icon: AlignStartHorizontal, tip: 'Line up back edges (stage side)', min: 2 },
  { op: 'y-mid', icon: AlignCenterHorizontal, tip: 'Line up centres in depth', min: 2 },
  { op: 'y-max', icon: AlignEndHorizontal, tip: 'Line up front edges (audience side)', min: 2 },
  '|',
  { op: 'z-min', icon: ArrowDownToLine, tip: 'Level: same base height as the first pick', min: 2 },
  { op: 'z-max', icon: ArrowUpToLine, tip: 'Same top height as the first pick', min: 2 },
  { op: 'stack', icon: Layers, tip: 'Stack on top of the first pick', min: 2 },
  '|',
  { op: 'dist-x', icon: AlignHorizontalSpaceAround, tip: 'Space evenly across (3 or more)', min: 3 },
  { op: 'dist-y', icon: AlignVerticalSpaceAround, tip: 'Space evenly in depth (3 or more)', min: 3 },
  '|',
  { op: 'floor', icon: ArrowDownToLine, tip: 'Drop to the ground', min: 1 },
  { op: 'stage-top', icon: Layers, tip: 'Stand on the stage top', min: 1 },
  { op: 'stage-centre', icon: Crosshair, tip: 'Centre on the stage', min: 1 },
]

// Selected items this workspace may move, first pick first.
export function useAlignTargets(ws: string): CadItem[] {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const extra = useStore((s) => s.ui.extra)
  const kinds = CAD_EDITS[ws] ?? []
  if (!sel) return []
  const items = cadItems(project)
  return [sel, ...extra].flatMap((s) => items.filter((i) => i.kind === s.kind && i.id === s.id && kinds.includes(i.kind) && !i.locked))
}

export function runAlign(targets: CadItem[], op: Btn['op']) {
  const { mutate, project, notify } = useStore.getState()
  const sb = stageBounds(project)
  let ref: Box3 = targets[0].box
  let list = targets
  let kind: AlignOp
  if (op === 'stage-top' || op === 'stage-centre') {
    if (!sb) return notify('Add a stage first')
    ref = { x0: sb.x, x1: sb.x + sb.w, y0: sb.y, y1: sb.y + sb.l, z0: 0, z1: sb.h }
    kind = op === 'stage-top' ? 'stack' : 'x-mid'
  } else {
    kind = op
    // Ops that line things up against the first pick leave the first pick where it is.
    if (!['floor', 'dist-x', 'dist-y'].includes(op)) list = targets.slice(1)
  }
  const after = alignBoxes(
    ref,
    list.map((t) => t.box),
    kind,
  )
  mutate((p) => list.forEach((t, i) => applyBox(p, t.kind, t.id, t.box, after[i])))
}

export function AlignBar({ ws, className = '' }: { ws: string; className?: string }) {
  const targets = useAlignTargets(ws)
  if (!targets.length) return null
  const n = targets.length
  const shown = BTNS.filter((b) => b === '|' || n >= b.min)
  // Drop dividers that end up leading, trailing or doubled.
  const clean = shown.filter((b, i) => b !== '|' || (i > 0 && i < shown.length - 1 && shown[i - 1] !== '|'))
  return (
    <div className={`glass rounded-xl flex items-center gap-0.5 p-1 z-10 max-w-[calc(100%-120px)] overflow-x-auto ${className}`} role="toolbar" aria-label="Align">
      <span className="px-2 text-[10px] text-mute whitespace-nowrap">{n === 1 ? 'Shift+click to pick more' : `${n} picked`}</span>
      {clean.map((b, i) =>
        b === '|' ? (
          <span key={i} className="mx-0.5 h-4 w-px bg-line shrink-0" />
        ) : (
          <button key={b.op} className="btn btn-icon h-7 w-7 shrink-0" title={b.tip} aria-label={b.tip} onClick={() => runAlign(targets, b.op)}>
            <b.icon size={14} />
          </button>
        ),
      )}
    </div>
  )
}

// Smart snap for items dragged in a workspace's own top view (`r` is the item's top-left rect).
// Magnet off: free movement. Guides are drawn by <SnapGuides pane="home" />.
export function topSnap(kind: CadItem['kind'], id: string, r: { x: number; y: number; w: number; h: number }, scale: number, grid: number) {
  const { project, ui } = useStore.getState()
  if (!ui.magnet) return { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100 }
  const others = cadItems(project)
    .filter((i) => !(i.kind === kind && i.id === id))
    .map((i) => toRect(i.box, 'top'))
  const s = snapRect(r, others, 10 / scale, { vLines: [0, project.venue.w / 2, project.venue.w], hLines: [0, project.venue.l], grid })
  useGuides.getState().set('home', s.guides)
  return { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 }
}
export const clearGuides = () => useGuides.getState().set(null, [])
