import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { real } from '../lib/theme'
import { Arrow, Group, Line, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { Box, LayoutGrid } from 'lucide-react'
import { useStore } from '../store'
import { PlanCanvas, useView } from './PlanCanvas'
import { applyBox, CAD_EDITS, cadItems, fromRect, toRect, type CadItem, type FlatView } from '../lib/cad'
import { SetCad3D } from '../workspaces/SetCad3D'
import { AlignBar, SnapGuides, useGuides } from './Align'
import { snapRect } from '../lib/snap'

// CAD-style views for a workspace: its own editor (the "home" view) plus the other flat views and 3D,
// one at a time or all four together. Every view shows everything; only the workspace's own items move.
export type CadLayout = FlatView | '3d' | 'quad'
const NAME: Record<FlatView, string> = { front: 'Front', top: 'Top', side: 'Side' }
const AXES: Record<FlatView, [string, string]> = { front: ['X across', 'Z up'], top: ['X across', 'Y towards audience'], side: ['Y towards audience', 'Z up'] }

export function useCadLayout(ws: string, home: FlatView) {
  const key = `unifest:cad:${ws}`
  const [layout, setLayout] = useState<CadLayout>(() => {
    try {
      return (localStorage.getItem(key) as CadLayout) || home
    } catch {
      return home
    }
  })
  const pick = (l: CadLayout) => {
    setLayout(l)
    try {
      localStorage.setItem(key, l)
    } catch {
      /* private mode */
    }
  }
  return [layout, pick] as const
}

export function CadShell({ ws, home, children, extraBar }: { ws: string; home: FlatView; children: ReactNode; extraBar?: ReactNode }) {
  const [layout, setLayout] = useCadLayout(ws, home)
  const pane = (v: CadLayout, compact: boolean) => {
    if (v === home) return children
    if (v === '3d') return <SetCad3D compact={compact} edit={ws} onExit={() => setLayout(home)} />
    return <FlatPane view={v as FlatView} ws={ws} compact={compact} />
  }
  return (
    <div className="relative flex-1 min-w-0 bg-canvas">
      {layout === 'quad' ? (
        <div className="absolute left-0 right-16 top-[72px] bottom-16 grid grid-cols-2 grid-rows-2 gap-px bg-line border border-l-0 border-line">
          {(['front', 'top', 'side', '3d'] as CadLayout[]).map((v) => (
            <div key={v} className="relative bg-canvas min-w-0 min-h-0 overflow-hidden">
              {pane(v, true)}
              {v === home && <PaneLabel view={home} compact />}
            </div>
          ))}
        </div>
      ) : (
        pane(layout, false)
      )}
      <ViewBar layout={layout} setLayout={setLayout} extra={extraBar} quad={layout === 'quad'} />
      <AlignBar ws={ws} className={`absolute left-1/2 -translate-x-1/2 ${layout === 'quad' ? 'bottom-3' : 'bottom-16'}`} />
    </div>
  )
}

export function ViewBar({ layout, setLayout, extra, quad }: { layout: CadLayout; setLayout: (l: CadLayout) => void; extra?: ReactNode; quad: boolean }) {
  return (
    <div className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 glass rounded-xl flex flex-col items-stretch gap-1 p-1 ${quad ? 'scale-90 origin-left' : ''}`}>
      {(['front', 'top', 'side', '3d', 'quad'] as CadLayout[]).map((v) => (
        <button key={v} className={`btn h-8 px-2.5 text-[11px] justify-center ${layout === v ? 'btn-on' : ''}`} title={v === 'quad' ? 'Front, top, side and 3D at once, like CAD' : `${v === '3d' ? '3D' : NAME[v as FlatView]} view`} onClick={() => setLayout(v)}>
          {v === 'quad' ? (
            <>
              <LayoutGrid size={13} /> 4 views
            </>
          ) : v === '3d' ? (
            <>
              <Box size={13} /> 3D
            </>
          ) : (
            NAME[v as FlatView]
          )}
        </button>
      ))}
      {extra}
    </div>
  )
}

function PaneLabel({ view, compact }: { view: FlatView; compact: boolean }) {
  return (
    <div className={`absolute ${compact ? 'top-2 right-2' : 'top-4 right-4'} glass rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-widest text-dim pointer-events-none z-10`}>
      {NAME[view]} <span className="text-mute normal-case tracking-normal">· {AXES[view][0]} · {AXES[view][1]}</span>
    </div>
  )
}

function bounds(items: CadItem[], view: FlatView, venue: { w: number; l: number }) {
  const rs = items.map((i) => toRect(i.box, view))
  if (!rs.length) return view === 'top' ? { x: -2, y: -2, w: venue.w + 4, h: venue.l + 4 } : { x: view === 'front' ? 0 : -2, y: -12, w: view === 'front' ? venue.w : venue.l, h: 14 }
  const x0 = Math.min(...rs.map((r) => r.x))
  const x1 = Math.max(...rs.map((r) => r.x + r.w))
  const y0 = Math.min(...rs.map((r) => r.y), view === 'top' ? Infinity : -6)
  const y1 = Math.max(...rs.map((r) => r.y + r.h), view === 'top' ? -Infinity : 0)
  return { x: x0 - 4, y: y0 - 2, w: x1 - x0 + 8, h: y1 - y0 + 4 }
}

// A flat view of every item as boxes. Items of this workspace can be dragged and resized.
export function FlatPane({ view, ws, compact }: { view: FlatView; ws: string; compact: boolean }) {
  const project = useStore((s) => s.project)
  const { select } = useStore.getState()
  const items = useMemo(() => cadItems(project), [project])
  const kinds = CAD_EDITS[ws] ?? []
  // Bounds follow the workspace's own items when there are any, so the view opens on what you are editing.
  const own = items.filter((i) => kinds.includes(i.kind))
  const b = useMemo(() => bounds(own.length ? own : items, view, project.venue), [own.length ? own : items, view, project.venue]) // eslint-disable-line react-hooks/exhaustive-deps
  const order = (i: CadItem) => (view === 'front' ? i.box.y0 : view === 'top' ? i.box.z0 : -i.box.x0)
  const sorted = [...items].sort((a, c) => order(a) - order(c))
  return (
    <PlanCanvas bounds={b} grid={b} onBackground={() => select(null)} overlay={<PaneLabel view={view} compact={compact} />}>
      <Ground view={view} b={b} />
      {sorted.map((i) => (
        <ItemNode key={`${i.kind}-${i.id}`} item={i} view={view} editable={kinds.includes(i.kind) && !i.locked} all={items} />
      ))}
      <SnapGuides pane={view} />
      <Triad view={view} b={b} />
    </PlanCanvas>
  )
}

function Ground({ view, b }: { view: FlatView; b: { x: number; y: number; w: number; h: number } }) {
  const v = useView()
  if (view === 'top') return null
  return (
    <Group listening={false}>
      <Line points={[b.x - 200, 0, b.x + b.w + 200, 0]} stroke="#ffffff" opacity={0.5} strokeWidth={1.5} strokeScaleEnabled={false} />
      <Text x={b.x + 0.5} y={6 / v.scale} text={view === 'side' ? 'GROUND · AUDIENCE →' : 'GROUND'} fontSize={10 / v.scale} fill="#6b6b6b" fontFamily="JetBrains Mono" />
    </Group>
  )
}

function ItemNode({ item, view, editable, all }: { item: CadItem; view: FlatView; editable: boolean; all: CadItem[] }) {
  const v = useView()
  const sel = useStore((s) => s.ui.selection)
  const picked = useStore((s) => s.ui.extra.some((e) => e.kind === item.kind && e.id === item.id))
  const magnet = useStore((s) => s.ui.magnet)
  const { mutate, select } = useStore.getState()
  const ref = useRef<Konva.Rect>(null)
  const tr = useRef<Konva.Transformer>(null)
  const selected = sel?.kind === item.kind && sel.id === item.id
  const r = toRect(item.box, view)
  useEffect(() => {
    if (selected && editable && item.resize !== false && tr.current && ref.current) {
      tr.current.nodes([ref.current])
      tr.current.getLayer()?.batchDraw()
    }
  }, [selected, editable, item.resize])
  const others = all.filter((o) => o !== item).map((o) => toRect(o.box, view))
  const tol = 10 / v.scale
  const truss = item.kind === 'truss'
  const fill = item.kind === 'screen' ? '#1d2b4a' : item.kind === 'fixture' ? '#cfcfcf' : truss ? '#00000000' : item.color
  const commit = (nr: { x: number; y: number; w: number; h: number }) => mutate((p) => applyBox(p, item.kind, item.id, item.box, fromRect(item.box, view, nr)))
  return (
    <>
      <Rect
        ref={ref}
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill={real(fill)}
        opacity={editable ? 0.9 : 0.3}
        stroke={selected || picked ? '#ffffff' : truss ? '#9a9a9a' : '#ffffff40'}
        strokeWidth={selected ? 2 : picked ? 1.5 : 1}
        dash={truss ? [4, 2] : undefined}
        strokeScaleEnabled={false}
        listening={editable}
        draggable={editable}
        onPointerDown={(e) => {
          e.cancelBubble = true
          select({ kind: item.kind, id: item.id })
        }}
        onDragMove={(e) => {
          const n = e.target
          // Magnet on: edges and centres snap to other items (pink guides), else a 0.25 m grid.
          const s = magnet ? snapRect({ x: n.x(), y: n.y(), w: r.w, h: r.h }, others, tol, { hLines: view === 'top' ? [] : [0] }) : { x: Math.round(n.x() * 100) / 100, y: Math.round(n.y() * 100) / 100, guides: [] }
          let y = s.y
          if (view !== 'top') y = Math.min(y, -r.h) // nothing below the ground
          if (item.kind === 'deck' && view !== 'top') y = -r.h // decks stand on the ground
          n.position({ x: s.x, y })
          useGuides.getState().set(view, s.guides)
        }}
        onDragEnd={(e) => {
          useGuides.getState().set(null, [])
          commit({ x: e.target.x(), y: e.target.y(), w: r.w, h: r.h })
        }}
        onTransformEnd={(e) => {
          const n = e.target
          const w = Math.max(0.1, Math.round(r.w * n.scaleX() * 4) / 4)
          const h = Math.max(0.1, Math.round(r.h * n.scaleY() * 4) / 4)
          n.scale({ x: 1, y: 1 })
          commit({ x: n.x(), y: n.y(), w, h })
        }}
      />
      {v.scale > 8 && r.w * v.scale > 30 && (
        <Text x={r.x} y={r.y - 12 / v.scale} width={r.w} align="center" text={item.label} fontSize={9 / v.scale} fill="#8a8a8a" fontFamily="Inter" listening={false} ellipsis wrap="none" />
      )}
      {selected && editable && item.resize !== false && <Transformer ref={tr} rotateEnabled={false} keepRatio={false} borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" anchorSize={8} />}
    </>
  )
}

function Triad({ view, b }: { view: FlatView; b: { x: number; y: number; w: number; h: number } }) {
  const v = useView()
  const len = 40 / v.scale
  const ox = b.x + 0.6
  const oy = b.y + b.h - 0.6
  const [ha, va] = view === 'front' ? ['X', 'Z'] : view === 'top' ? ['X', 'Y'] : ['Y', 'Z']
  const col: Record<string, string> = { X: '#e5484d', Y: '#3e63dd', Z: '#46a758' }
  const vy = view === 'top' ? len : -len
  const pl = 6 / v.scale
  return (
    <Group listening={false}>
      <Arrow points={[ox, oy, ox + len, oy]} stroke={col[ha]} fill={col[ha]} strokeWidth={2} strokeScaleEnabled={false} pointerLength={pl} pointerWidth={pl} />
      <Arrow points={[ox, oy, ox, oy + vy]} stroke={col[va]} fill={col[va]} strokeWidth={2} strokeScaleEnabled={false} pointerLength={pl} pointerWidth={pl} />
      <Text x={ox + len + 4 / v.scale} y={oy - 5 / v.scale} text={ha} fontSize={10 / v.scale} fill={col[ha]} fontFamily="JetBrains Mono" fontStyle="700" />
      <Text x={ox - 3 / v.scale} y={oy + vy + (view === 'top' ? 4 : -14) / v.scale} text={va} fontSize={10 / v.scale} fill={col[va]} fontFamily="JetBrains Mono" fontStyle="700" />
    </Group>
  )
}
