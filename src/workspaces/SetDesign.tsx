import { useEffect, useMemo, useRef, useState } from 'react'
import { real } from '../lib/theme'
import { Arc, Arrow, Circle, Ellipse, Group, Image as KImage, Line, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { nanoid } from 'nanoid'
import { Box, Circle as CircleIcon, Copy, FlipHorizontal2, ImageIcon, Layers, LayoutGrid, Link2Off, MousePointer2, Palette, Pentagon, PenLine, Square, Trash2, Triangle as TriangleIcon, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import type { Project, SetKind, SetPiece, Skin } from '../types'
import { PlanCanvas, useView } from '../components/PlanCanvas'
import { footprint, fromFootprint, outlinePoints, pieceFromSketch, planeSize, sketchIn, type CadView, type DrawTool } from '../lib/setpieces'
import { applyTheme, buildKit, hasOpening, KITS, newPiece, SET_KINDS, setLedArea, setLine, SKINS, THEMES } from '../lib/setpieces'
import { readImage } from './Decor'
import { Check, Num, Section, Sel, Stat, Txt } from '../components/ui'
import { fmt } from '../lib/calc'
import { SetCad3D } from './SetCad3D'
import { AlignBar, SnapGuides, useGuides } from '../components/Align'
import { snapRect } from '../lib/snap'

// Flat front-view colours for each skin (the 3D view shows the real materials).
export const SKIN_FILL: Record<Skin, string> = {
  led: '#1d2b4a',
  print: '#3a3a3a',
  fabric: '#2a2a2a',
  mirror: '#9aa3ad',
  gold: '#c9a14a',
  wood: '#7a5230',
  black: '#141414',
  white: '#e8e8e8',
  paint: '#888888',
}
const fillOf = (s: Skin, color: string) => real(s === 'paint' || s === 'fabric' || s === 'print' ? color : SKIN_FILL[s])

// CAD-style set designer: front, top and side views plus 3D. Konva's y runs down, so front and side views use y = -height.
export function SetDesignWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select, notify } = useStore.getState()
  const set = project.set ?? []
  const piece = sel?.kind === 'set' ? set.find((p) => p.id === sel.id) : undefined

  const add = (kind: SetKind) =>
    mutate((p) => {
      const l = setLine(p)
      const s = newPiece(kind, l.cx, kind === 'tent' || kind === 'stall' || kind === 'balloon' ? Math.min(p.venue.l - 3, l.front + 20) : l.y, { z: kind === 'booth' || kind === 'pod' ? l.deckH : 0 })
      if (kind === 'booth' || kind === 'pod') s.y = l.front - 3
      ;(p.set ??= []).push(s)
      setTimeout(() => select({ kind: 'set', id: s.id }))
    })

  const totalLed = set.reduce((a, s) => a + setLedArea(s), 0)

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <Section title="Start from a kit">
          <div className="grid gap-1.5">
            {KITS.map((k) => (
              <button
                key={k.id}
                className="rounded-lg border border-line px-2.5 py-2 text-left hover:border-line-hi hover:bg-raised"
                onClick={() => {
                  if (set.length && !confirm('Replace the current set with this kit?')) return
                  mutate((p) => void (p.set = buildKit(p, k.id)))
                  notify(`${k.name} added. Click any piece to change it.`)
                }}
              >
                <div className="text-xs font-medium">{k.name}</div>
                <div className="text-[10px] text-mute leading-snug">{k.blurb}</div>
              </button>
            ))}
          </div>
        </Section>
        <Section title="Add blocks">
          {(['Structure', 'Shapes', 'Props', 'Site'] as const).map((g) => (
            <div key={g}>
              <div className="text-[10px] uppercase tracking-wider text-mute mb-1">{g}</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {(Object.keys(SET_KINDS) as SetKind[])
                  .filter((k) => SET_KINDS[k].group === g)
                  .map((k) => (
                    <button key={k} className="rounded-lg border border-line px-2 py-2 text-[11px] text-left hover:border-line-hi hover:bg-raised" title={SET_KINDS[k].tip} onClick={() => add(k)}>
                      + {SET_KINDS[k].name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </Section>
        <Section title="Theme">
          <p className="text-[11px] text-mute">Restyle every piece at once. LED stays LED.</p>
          <div className="grid gap-1.5">
            {THEMES.map((t) => (
              <button key={t.id} className="btn justify-between" disabled={!set.length} onClick={() => (mutate((p) => void (p.set = applyTheme(p.set ?? [], t.id))), notify(`${t.name} theme applied`))}>
                <span className="flex items-center gap-1.5">
                  <Palette size={12} /> {t.name}
                </span>
                <span className="flex gap-0.5">
                  {t.swatch.map((c) => (
                    <span key={c} className="h-3 w-3 rounded-full border border-line" style={{ background: c }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </Section>
        <Section title="LED content">
          <p className="text-[11px] text-mute leading-relaxed">One picture or video spread across every LED surface of the set, like one big canvas.</p>
          <ContentPicker />
        </Section>
      </aside>

      <SetViews />

      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {piece ? (
          <PieceProps s={piece} />
        ) : (
          <Section title="Set design">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Pieces" value={set.length} />
              <Stat label="LED on set" value={`${fmt(totalLed, 1)} m²`} />
              <Stat label="Tallest" value={`${fmt(Math.max(0, ...set.map((s) => s.z + s.h)), 1)} m`} />
              <Stat label="Width" value={set.length ? `${fmt(Math.max(...set.map((s) => s.x + s.w / 2)) - Math.min(...set.map((s) => s.x - s.w / 2)), 1)} m` : '—'} />
            </div>
            <p className="text-[11px] text-mute leading-relaxed">Pick a kit or add blocks on the left, or draw your own with the box, circle, shape and line tools at the bottom. Switch between front, top, side and 3D (or see all 4 at once) to place things exactly. Click a piece to change its size, skin, lights or artwork. Open the 3D view to walk around it and press Drop to fire the effects.</p>
          </Section>
        )}
      </aside>
    </div>
  )
}

function ContentPicker() {
  const content = useStore((s) => s.project.setContent)
  const { mutate } = useStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const isVideo = !!content && !content.startsWith('data:')
  return (
    <div className="space-y-2">
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) {
            const url = await readImage(f, 1600)
            mutate((p) => void (p.setContent = url))
          }
          e.target.value = ''
        }}
      />
      <button className="btn w-full justify-center" onClick={() => file.current?.click()}>
        <ImageIcon size={13} /> {content && !isVideo ? 'Replace image' : 'Upload content image'}
      </button>
      <input className="field" placeholder="or a video link (.mp4)" value={isVideo ? content : ''} onChange={(e) => mutate((p) => void (p.setContent = e.target.value.trim() || undefined))} />
      {content && (
        <button className="btn w-full justify-center" onClick={() => mutate((p) => void (p.setContent = undefined))}>
          Remove content
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- CAD views

type Layout = CadView | '3d' | 'quad'
type Tool = 'select' | DrawTool
const LKEY = 'unifest:setview'

const TOOLS: { id: Tool; name: string; key: string; icon: React.ReactNode; how: string }[] = [
  { id: 'select', name: 'Select', key: 'V', icon: <MousePointer2 size={15} />, how: 'Click a piece to edit it. Drag to move, corners to resize.' },
  { id: 'rect', name: 'Box', key: 'R', icon: <Square size={15} />, how: 'Drag to draw a box.' },
  { id: 'circle', name: 'Circle', key: 'C', icon: <CircleIcon size={15} />, how: 'Drag to draw a circle or oval.' },
  { id: 'triangle', name: 'Triangle', key: 'T', icon: <TriangleIcon size={15} />, how: 'Drag to draw a triangle.' },
  { id: 'poly', name: 'Shape', key: 'P', icon: <Pentagon size={15} />, how: 'Click corner by corner. Click the first point (or press Enter) to close it. Hold Shift for straight lines.' },
  { id: 'line', name: 'Line', key: 'L', icon: <PenLine size={15} />, how: 'Click point by point for a pipe or beam. Press Enter or click the last point again to finish. Hold Shift for straight lines.' },
]

const VIEW_NAME: Record<CadView, string> = { front: 'Front', top: 'Top', side: 'Side' }
const VIEW_AXES: Record<CadView, [string, string]> = { front: ['X across', 'Z up'], top: ['X across', 'Y towards audience'], side: ['Y towards audience', 'Z up'] }

function useLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return (localStorage.getItem(LKEY) as Layout) || 'front'
    } catch {
      return 'front'
    }
  })
  const pick = (l: Layout) => {
    setLayout(l)
    try {
      localStorage.setItem(LKEY, l)
    } catch {
      /* private mode */
    }
  }
  return [layout, pick] as const
}

function SetViews() {
  const [layout, setLayout] = useLayout()
  const [tool, setTool] = useState<Tool>('select')
  const ws = useStore((s) => s.ui.workspace)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (ws !== 'set' || e.ctrlKey || e.metaKey || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      const t = TOOLS.find((x) => x.key.toLowerCase() === key)
      if (t) setTool(t.id)
      if (key === 'escape') setTool('select')
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [ws])
  const draw = layout !== '3d'
  const active = TOOLS.find((t) => t.id === tool)!
  const pane = (v: Layout, compact: boolean) =>
    v === '3d' ? <SetCad3D compact={compact} onExit={() => setLayout('front')} /> : <ViewPane view={v as CadView} tool={tool} done={() => setTool('select')} compact={compact} />
  return (
    <div className="relative flex-1 min-w-0 bg-canvas">
      {layout === 'quad' ? (
        <div className="absolute left-0 right-16 top-[72px] bottom-16 grid grid-cols-2 grid-rows-2 gap-px bg-line border border-l-0 border-line">
          {(['front', 'top', 'side', '3d'] as Layout[]).map((v) => (
            <div key={v} className="relative bg-canvas min-w-0 min-h-0 overflow-hidden">
              {pane(v, true)}
            </div>
          ))}
        </div>
      ) : (
        pane(layout, false)
      )}
      <div className={`absolute left-1/2 -translate-x-1/2 ${layout === 'quad' ? 'bottom-2' : 'bottom-4'} z-10 flex flex-col items-center gap-1.5 pointer-events-none`}>
        {draw && tool !== 'select' && <div className="glass rounded-lg px-3 py-1.5 text-[11px] text-dim">{active.how} Esc to stop.</div>}
        <div className="pointer-events-auto">
          <AlignBar ws="set" />
        </div>
        <div className="glass rounded-xl flex items-center gap-1 p-1 pointer-events-auto">
          {(['front', 'top', 'side', '3d', 'quad'] as Layout[]).map((v) => (
            <button key={v} className={`btn h-8 px-2.5 text-[11px] ${layout === v ? 'btn-on' : ''}`} title={v === 'quad' ? 'Front, top, side and 3D at once, like CAD' : `${v === '3d' ? '3D' : VIEW_NAME[v as CadView]} view`} onClick={() => setLayout(v)}>
              {v === 'quad' ? (
                <>
                  <LayoutGrid size={13} /> 4 views
                </>
              ) : v === '3d' ? (
                <>
                  <Box size={13} /> 3D
                </>
              ) : (
                VIEW_NAME[v as CadView]
              )}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          {TOOLS.map((t) => (
            <button key={t.id} disabled={!draw && t.id !== 'select'} className={`btn btn-icon h-8 w-8 ${tool === t.id ? 'btn-on' : ''}`} title={`${t.name} (${t.key})${t.id === 'select' ? '' : ': draw in the front, top or side view'}`} onClick={() => setTool(t.id)}>
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Canvas bounds for each flat view.
function viewBounds(p: Project, view: CadView) {
  const L = setLine(p)
  const set = p.set ?? []
  const maxH = Math.max(14, ...set.map((s) => s.z + s.h + 2), ...p.truss.map((t) => t.height + 2))
  const span = Math.max(L.w + 24, ...set.map((s) => Math.abs(s.x - L.cx) * 2 + s.w + 4))
  const deep = Math.max(L.front + 14, ...set.map((s) => s.y + s.d / 2 + 4))
  if (view === 'front') return { x: L.cx - span / 2, y: -maxH, w: span, h: maxH + 2 }
  if (view === 'top') return { x: L.cx - span / 2, y: -2, w: span, h: deep + 2 }
  return { x: -2, y: -maxH, w: deep + 2, h: maxH + 2 }
}

// Snap a drawing point to a 0.25 m grid; with Shift, lock it level or plumb to the previous point.
function snapPt(p: { x: number; y: number }, prev: { x: number; y: number } | undefined, ortho: boolean) {
  const q = { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 }
  if (ortho && prev) Math.abs(q.x - prev.x) > Math.abs(q.y - prev.y) ? (q.y = prev.y) : (q.x = prev.x)
  return q
}

function ViewPane({ view, tool, done, compact }: { view: CadView; tool: Tool; done: () => void; compact: boolean }) {
  const project = useStore((s) => s.project)
  const { mutate, select, notify } = useStore.getState()
  const set = project.set ?? []
  const b = useMemo(() => viewBounds(project, view), [project, view])
  const [pts, setPts] = useState<{ x: number; y: number }[]>([])
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const shift = useRef(false)
  const drawing = tool !== 'select'
  const multi = tool === 'poly' || tool === 'line'

  const finish = (all: { x: number; y: number }[], closeTool = tool) => {
    setPts([])
    setCur(null)
    dragging.current = false
    if (closeTool === 'select') return
    const L = setLine(useStore.getState().project)
    const sp = pieceFromSketch(view, closeTool, all, { x: L.cx, y: L.y, z: 0 })
    if (!sp) return
    // A shape drawn on top of the stage in the top view sits on the deck.
    if (view === 'top') {
      const on = useStore.getState().project.decks.some((d) => sp.x >= d.x && sp.x <= d.x + d.w && sp.y >= d.y && sp.y <= d.y + d.l)
      if (on) sp.z = L.deckH
    }
    mutate((p) => void (p.set ??= []).push(sp))
    setTimeout(() => select({ kind: 'set', id: sp.id }))
    notify(`${sp.label} added. Set how far it pushes out on the right.`)
    done()
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      if (e.type !== 'keydown') return
      if (e.key === 'Escape') (setPts([]), setCur(null))
      if (e.key === 'Enter' && multi && pts.length >= 2) finish(pts)
    }
    window.addEventListener('keydown', k)
    window.addEventListener('keyup', k)
    return () => (window.removeEventListener('keydown', k), window.removeEventListener('keyup', k))
  })
  useEffect(() => (setPts([]), setCur(null)), [tool])

  const preview = pts.length ? (multi ? [...pts, ...(cur ? [cur] : [])] : cur ? [pts[0], cur] : pts) : []

  return (
    <PlanCanvas
      bounds={b}
      grid={b}
      cursor={drawing ? 'crosshair' : undefined}
      onBackground={() => !drawing && select(null)}
      onWorldDown={(w) => {
        if (!drawing) return
        const p = snapPt(w, pts[pts.length - 1], shift.current)
        if (!multi) {
          dragging.current = true
          setPts([p])
          setCur(p)
          return
        }
        const tol = Math.max(b.w, b.h) / 120
        if (tool === 'poly' && pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < tol) return finish(pts)
        if (pts.length >= 2 && Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) < tol) return finish(pts)
        setPts([...pts, p])
      }}
      onWorldMove={(w) => drawing && (pts.length || !multi) && setCur(snapPt(w, pts[pts.length - 1], shift.current))}
      onWorldUp={(w) => {
        if (!drawing || multi || !dragging.current) return
        finish([pts[0], snapPt(w, undefined, false)])
      }}
      overlay={
        <>
          <div className={`absolute ${compact ? 'top-2 right-2' : 'top-[68px] right-4'} glass rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-widest text-dim pointer-events-none`}>
            {VIEW_NAME[view]} <span className="text-mute normal-case tracking-normal">· {VIEW_AXES[view][0]} · {VIEW_AXES[view][1]}</span>
          </div>
          {multi && pts.length >= 2 && (
            <button className="absolute top-14 right-4 btn h-7 text-[11px]" onClick={() => finish(pts)}>
              Finish (Enter)
            </button>
          )}
        </>
      }
    >
      <ViewContext view={view} />
      {[...set]
        .sort((a, c) => (view === 'front' ? a.y - c.y : view === 'top' ? a.z - c.z : c.x - a.x))
        .map((s) => (
          <PieceNode key={s.id} s={s} view={view} listening={!drawing} />
        ))}
      <SnapGuides pane={`set-${view}`} />
      <AxisTriad view={view} b={b} />
      {preview.length > 0 && <Sketch tool={tool as DrawTool} pts={preview} />}
    </PlanCanvas>
  )
}

// Live preview of what is being drawn.
function Sketch({ tool, pts }: { tool: DrawTool; pts: { x: number; y: number }[] }) {
  const v = useView()
  const common = { stroke: '#ffffff', strokeWidth: 1.5, strokeScaleEnabled: false, fill: '#ffffff18', listening: false }
  const [a, c] = [pts[0], pts[pts.length - 1]]
  const x = Math.min(a.x, c.x)
  const y = Math.min(a.y, c.y)
  const w = Math.abs(c.x - a.x)
  const h = Math.abs(c.y - a.y)
  return (
    <Group listening={false}>
      {tool === 'rect' && <Rect x={x} y={y} width={w} height={h} {...common} />}
      {tool === 'circle' && <Ellipse x={x + w / 2} y={y + h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />}
      {tool === 'triangle' && <Line points={[x, y + h, x + w, y + h, x + w / 2, y]} closed {...common} />}
      {(tool === 'poly' || tool === 'line') && <Line points={pts.flatMap((p) => [p.x, p.y])} {...common} fill={tool === 'poly' ? '#ffffff18' : undefined} closed={false} />}
      {(tool === 'poly' || tool === 'line') && pts.slice(0, -1).map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={(i === 0 && tool === 'poly' ? 5 : 3) / v.scale} fill="#fff" />)}
      {pts.length >= 2 && (
        <Text
          x={c.x + 8 / v.scale}
          y={c.y + 8 / v.scale}
          text={tool === 'poly' || tool === 'line' ? `${fmt(Math.hypot(c.x - pts[pts.length - 2].x, c.y - pts[pts.length - 2].y), 2)} m` : `${fmt(w, 2)} × ${fmt(h, 2)} m`}
          fontSize={11 / v.scale}
          fill="#fff"
          fontFamily="JetBrains Mono"
        />
      )}
    </Group>
  )
}

// Small axis arrows in the corner of each flat view.
function AxisTriad({ view, b }: { view: CadView; b: { x: number; y: number; w: number; h: number } }) {
  const v = useView()
  const len = 40 / v.scale
  const ox = b.x + 0.6
  const oy = b.y + b.h - 0.6
  const [ha, va] = view === 'front' ? ['X', 'Z'] : view === 'top' ? ['X', 'Y'] : ['Y', 'Z']
  const col: Record<string, string> = { X: '#e5484d', Y: '#3e63dd', Z: '#46a758' }
  // In the top view Y (towards the audience) points down the screen.
  const vy = view === 'top' ? len : -len
  return (
    <Group listening={false}>
      <Arrow points={[ox, oy, ox + len, oy]} stroke={col[ha]} fill={col[ha]} strokeWidth={2} strokeScaleEnabled={false} pointerLength={6 / v.scale} pointerWidth={6 / v.scale} />
      <Arrow points={[ox, oy, ox, oy + vy]} stroke={col[va]} fill={col[va]} strokeWidth={2} strokeScaleEnabled={false} pointerLength={6 / v.scale} pointerWidth={6 / v.scale} />
      <Text x={ox + len + 4 / v.scale} y={oy - 5 / v.scale} text={ha} fontSize={10 / v.scale} fill={col[ha]} fontFamily="JetBrains Mono" fontStyle="700" />
      <Text x={ox - 3 / v.scale} y={oy + vy + (view === 'top' ? 4 : -14) / v.scale} text={va} fontSize={10 / v.scale} fill={col[va]} fontFamily="JetBrains Mono" fontStyle="700" />
    </Group>
  )
}

// Ground, stage, truss and a person for scale, drawn for each view.
function ViewContext({ view }: { view: CadView }) {
  const p = useStore((s) => s.project)
  const v = useView()
  const L = setLine(p)
  const mono = { fontFamily: 'JetBrains Mono', fill: '#8a8a8a' }
  const thin = { strokeWidth: 1, strokeScaleEnabled: false }
  if (view === 'top')
    return (
      <Group listening={false}>
        <Rect x={0} y={0} width={p.venue.w} height={p.venue.l} stroke="#ffffff30" {...thin} dash={[6, 4]} />
        {p.decks.map((d) => (
          <Rect key={d.id} x={d.x} y={d.y} width={d.w} height={d.l} fill="#ffffff0d" stroke="#ffffff40" {...thin} />
        ))}
        {p.decks.length > 0 && <Text x={L.cx - L.w / 2} y={L.front - 14 / v.scale} width={L.w} align="center" text="STAGE" fontSize={10 / v.scale} {...mono} />}
        {p.truss.map((t) => (
          <Line key={t.id} points={[t.x1, t.y1, t.x2, t.y2]} stroke="#9a9a9a" strokeWidth={3} strokeScaleEnabled={false} dash={[2, 2]} />
        ))}
        <Line points={[L.cx, -2, L.cx, L.front + 12]} stroke="#ffffff20" {...thin} dash={[10, 6]} />
        <Text x={L.cx - 50} y={L.front + 4} width={100} align="center" text="AUDIENCE ↓" fontSize={10 / v.scale} {...mono} />
      </Group>
    )
  if (view === 'side') {
    const ys = p.decks.flatMap((d) => [d.y, d.y + d.l])
    return (
      <Group listening={false}>
        <Line points={[-200, 0, 400, 0]} stroke="#ffffff" opacity={0.5} strokeWidth={1.5} strokeScaleEnabled={false} />
        {ys.length > 0 && <Rect x={Math.min(...ys)} y={-L.deckH} width={Math.max(...ys) - Math.min(...ys)} height={L.deckH} fill="#ffffff10" stroke="#ffffff55" {...thin} />}
        {ys.length > 0 && <Text x={Math.min(...ys)} y={-L.deckH + 0.1} width={Math.max(...ys) - Math.min(...ys)} align="center" text="STAGE" fontSize={10 / v.scale} {...mono} />}
        {p.truss.map((t) => (
          <Group key={t.id}>
            <Line points={[Math.min(t.y1, t.y2) - 0.15, -t.height, Math.max(t.y1, t.y2) + 0.15, -t.height]} stroke="#9a9a9a" strokeWidth={3} strokeScaleEnabled={false} />
            {t.legs && <Line points={[t.y1, 0, t.y1, -t.height]} stroke="#9a9a9a" {...thin} />}
          </Group>
        ))}
        <Person x={L.front + 1.5} />
        <Text x={L.front + 3} y={6 / v.scale} text="AUDIENCE →" fontSize={10 / v.scale} {...mono} />
        <HeightMarks x={-1.8} />
      </Group>
    )
  }
  return (
    <Group listening={false}>
      <Line points={[L.cx - 200, 0, L.cx + 200, 0]} stroke="#ffffff" opacity={0.5} strokeWidth={1.5} strokeScaleEnabled={false} />
      <Text x={L.cx - 100} y={6 / v.scale} text="GROUND" fontSize={10 / v.scale} {...mono} />
      {p.decks.length > 0 && <Rect x={L.cx - L.w / 2} y={-L.deckH} width={L.w} height={L.deckH} fill="#ffffff10" stroke="#ffffff55" {...thin} />}
      {p.decks.length > 0 && <Text x={L.cx - L.w / 2} y={-L.deckH + 0.1} width={L.w} align="center" text="STAGE" fontSize={10 / v.scale} {...mono} />}
      {p.truss.map((t) => (
        <Group key={t.id}>
          <Line points={[Math.min(t.x1, t.x2), -t.height, Math.max(t.x1, t.x2), -t.height]} stroke="#9a9a9a" strokeWidth={3} strokeScaleEnabled={false} />
          {t.legs && <Line points={[t.x1, 0, t.x1, -t.height, t.x2, -t.height, t.x2, 0]} stroke="#9a9a9a" {...thin} />}
        </Group>
      ))}
      <Person x={L.cx + L.w / 2 + 1} />
      <HeightMarks x={L.cx - 200} />
    </Group>
  )
}

function Person({ x }: { x: number }) {
  return (
    <Group x={x} y={0}>
      <Circle y={-1.6} radius={0.13} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[0, -1.47, 0, -0.85, -0.2, 0, 0, -0.85, 0.2, 0]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
      <Line points={[-0.3, -1.2, 0, -1.3, 0.3, -1.2]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
    </Group>
  )
}

function HeightMarks({ x }: { x: number }) {
  const v = useView()
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (i + 1) * 2.5).map((h) => (
        <Text key={h} x={x} y={-h - 5 / v.scale} text={`${h} m`} fontSize={9 / v.scale} fill="#3f3f3f" fontFamily="JetBrains Mono" />
      ))}
    </>
  )
}

function useImg(src?: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) return setImg(null)
    const i = new window.Image()
    i.onload = () => setImg(i)
    i.src = src
  }, [src])
  return img
}

function PieceNode({ s, view, listening }: { s: SetPiece; view: CadView; listening: boolean }) {
  const v = useView()
  const sel = useStore((st) => st.ui.selection)
  const set = useStore((st) => st.project.set ?? [])
  const deckH = useStore((st) => setLine(st.project).deckH)
  const lineY = useStore((st) => setLine(st.project).y)
  const { mutate, select } = useStore.getState()
  const ref = useRef<Konva.Group>(null)
  const tr = useRef<Konva.Transformer>(null)
  const selected = sel?.kind === 'set' && sel.id === s.id
  const locked = !!s.mirrorOf
  const img = useImg(s.image)
  useEffect(() => {
    if (selected && !locked && tr.current && ref.current) {
      tr.current.nodes([ref.current])
      tr.current.getLayer()?.batchDraw()
    }
  }, [selected, locked, view])
  const f = footprint(s, view)
  const others = set.filter((o) => o.id !== s.id && o.mirrorOf !== s.id)
  // Snap targets along the view's horizontal (a) and vertical (b) axes, in canvas coordinates.
  const boxes = others.map((o) => footprint(o, view))
  const magnet = useStore((st) => st.ui.magnet)
  const picked = useStore((st) => st.ui.extra.some((e) => e.kind === 'set' && e.id === s.id))
  const tol = 10 / v.scale
  const fill = fillOf(s.skin, s.color)
  const stroke = selected || picked ? '#ffffff' : s.outline ? s.outline.color : '#ffffff40'
  const sw = selected ? 2 : s.outline ? 2 : 1
  const b = s.border ?? 0.6
  const innerFill = s.inner === 'open' || !s.inner ? undefined : fillOf(s.inner as Skin, s.color)
  const rot = view === 'top' ? (s.rot ?? 0) : 0
  const far = view === 'front' && s.y - lineY > 6

  return (
    <>
      <Group
        ref={ref}
        x={f.x + f.w / 2}
        y={f.y + f.h / 2}
        offsetX={f.w / 2}
        offsetY={f.h / 2}
        rotation={rot}
        listening={listening}
        opacity={(locked ? 0.85 : 1) * (far ? 0.4 : 1)}
        draggable={!locked}
        onPointerDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'set', id: s.mirrorOf && !selected ? s.mirrorOf : s.id })
        }}
        onDragMove={(e) => {
          const n = e.target
          // Magnet on: edges and centres snap to other pieces, the ground and the stage top (pink guides).
          const r = { x: n.x() - f.w / 2, y: n.y() - f.h / 2, w: f.w, h: f.h }
          const sn = magnet ? snapRect(r, boxes, tol, { hLines: view === 'top' ? [] : [0, -deckH] }) : { x: r.x, y: r.y, guides: [] }
          let cb = sn.y + f.h / 2
          if (view !== 'top') cb = Math.min(cb, -f.h / 2) // nothing below the ground
          n.position({ x: sn.x + f.w / 2, y: cb })
          useGuides.getState().set(`set-${view}`, sn.guides)
        }}
        onDragEnd={(e) => {
          useGuides.getState().set(null, [])
          const n = e.target
          mutate((p) => Object.assign(p.set!.find((x) => x.id === s.id)!, fromFootprint(view, { x: n.x() - f.w / 2, y: n.y() - f.h / 2, w: f.w, h: f.h })))
        }}
        onTransformEnd={(e) => {
          const n = e.target
          const w = Math.max(0.1, Math.round(f.w * n.scaleX() * 4) / 4)
          const h = Math.max(0.1, Math.round(f.h * n.scaleY() * 4) / 4)
          const r = Math.round(n.rotation() / 5) * 5
          n.scale({ x: 1, y: 1 })
          mutate((p) => {
            const t = p.set!.find((x) => x.id === s.id)!
            Object.assign(t, fromFootprint(view, { x: n.x() - w / 2, y: n.y() - h / 2, w, h }))
            if (view === 'top') t.rot = ((r % 360) + 360) % 360 || undefined
          })
        }}
      >
        {view === 'front' ? <Shape2D s={s} fill={fill} stroke={stroke} sw={sw} b={b} innerFill={innerFill} img={img} /> : <Flat2D s={s} view={view} w={f.w} h={f.h} fill={fill} stroke={stroke} sw={sw} />}
        {view === 'front' && s.outline && <Bulbs s={s} />}
      </Group>
      {v.scale > 6 && (
        <Text x={f.x} y={f.y - 12 / v.scale} width={f.w} align="center" text={`${s.label}${s.mirrorOf ? ' ⇄' : ''}`} fontSize={9 / v.scale} fill="#8a8a8a" fontFamily="Inter" listening={false} />
      )}
      {selected && !locked && listening && (
        <Transformer ref={tr} rotateEnabled={view === 'top'} rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} keepRatio={false} borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" anchorSize={8} />
      )}
    </>
  )
}

// A piece seen from above or from the side: its sketch if it was drawn on that plane, else its outline.
function Flat2D({ s, view, w, h, fill, stroke, sw }: { s: SetPiece; view: CadView; w: number; h: number; fill: string; stroke: string; sw: number }) {
  const common = { stroke, strokeWidth: sw, strokeScaleEnabled: false }
  const sk = sketchIn(s, view, w, h)
  if (sk && s.kind === 'line') return <Line points={sk.flat()} {...common} stroke={selectedOr(stroke, fill)} strokeWidth={Math.max(2, sw)} hitStrokeWidth={12} />
  if (sk) return <Line points={sk.flat()} closed fill={fill} {...common} />
  if (view === 'top' && (s.kind === 'pod' || s.kind === 'balloon')) return <Ellipse x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill={fill} {...common} />
  if (view === 'side' && s.kind === 'balloon') return <Circle x={w / 2} y={w / 2} radius={Math.min(w, h) / 2} fill={fill} {...common} />
  return <Rect width={w} height={h} fill={fill} opacity={s.kind === 'scaffold' ? 0.4 : 1} {...common} />
}
const selectedOr = (stroke: string, fill: string) => (stroke === '#ffffff40' ? fill : stroke)

function Shape2D({ s, fill, stroke, sw, b, innerFill, img }: { s: SetPiece; fill: string; stroke: string; sw: number; b: number; innerFill?: string; img: HTMLImageElement | null }) {
  const common = { stroke, strokeWidth: sw, strokeScaleEnabled: false }
  const W = s.w
  const H = s.h
  if (s.kind === 'shape' || s.kind === 'line') {
    const sk = sketchIn(s, 'front', W, H)
    if (!sk) return <Rect width={W} height={H} fill={fill} {...common} />
    return s.kind === 'line' ? <Line points={sk.flat()} {...common} stroke={selectedOr(stroke, fill)} strokeWidth={Math.max(2, sw)} hitStrokeWidth={12} /> : <Line points={sk.flat()} closed fill={fill} {...common} />
  }
  switch (s.kind) {
    case 'frame':
      return (
        <>
          {innerFill && <Rect x={b} y={b} width={Math.max(0, W - 2 * b)} height={Math.max(0, H - 2 * b)} fill={innerFill} />}
          <Line points={[0, 0, W, 0, W, H, 0, H]} closed fill={fill} {...common} />
          <Rect x={b} y={b} width={Math.max(0, W - 2 * b)} height={Math.max(0, H - 2 * b)} fill={innerFill ?? '#050505'} stroke={stroke} strokeWidth={1} strokeScaleEnabled={false} />
        </>
      )
    case 'arch': {
      const r = W / 2
      const legs = Math.max(0, H - r)
      return (
        <>
          {innerFill && <Rect x={b} y={r} width={W - 2 * b} height={legs} fill={innerFill} />}
          {innerFill && <Circle x={r} y={r} radius={Math.max(0, r - b)} fill={innerFill} />}
          <Arc x={r} y={r} innerRadius={Math.max(0, r - b)} outerRadius={r} angle={180} rotation={180} fill={fill} {...common} />
          <Rect x={0} y={r} width={b} height={legs} fill={fill} {...common} />
          <Rect x={W - b} y={r} width={b} height={legs} fill={fill} {...common} />
        </>
      )
    }
    case 'ring':
      return (
        <>
          {innerFill && <Circle x={W / 2} y={H / 2} radius={Math.max(0, Math.min(W, H) / 2 - b)} fill={innerFill} />}
          <Arc x={W / 2} y={H / 2} innerRadius={Math.max(0, Math.min(W, H) / 2 - b)} outerRadius={Math.min(W, H) / 2} angle={360} fill={fill} {...common} />
        </>
      )
    case 'pod':
      return <Rect width={W} height={H} cornerRadius={Math.min(W, H) * 0.15} fill={fill} {...common} />
    case 'balloon':
      return (
        <>
          <Circle x={W / 2} y={W / 2} radius={W / 2} fill={img ? undefined : fill} {...common} />
          {img && <KImage image={img} x={W * 0.15} y={W * 0.15} width={W * 0.7} height={W * 0.7} />}
          <Line points={[W / 2, W, W / 2, H]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
        </>
      )
    case 'tent':
      return (
        <>
          <Line points={[0, H * 0.4, W / 2, 0, W, H * 0.4]} closed fill={fill} {...common} />
          <Rect y={H * 0.4} width={W} height={H * 0.6} fill={fill} opacity={0.6} {...common} />
        </>
      )
    case 'stall':
      return (
        <>
          <Rect width={W} height={H * 0.25} fill={fill} {...common} />
          <Rect y={H * 0.55} width={W} height={H * 0.45} fill="#444" {...common} />
          <Line points={[0.1, H * 0.25, 0.1, H * 0.55, W - 0.1, H * 0.25, W - 0.1, H * 0.55]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
        </>
      )
    case 'scaffold':
      return (
        <>
          <Rect width={W} height={H} {...common} stroke={stroke === '#ffffff40' ? '#888' : stroke} />
          {Array.from({ length: Math.max(1, Math.round(H / 2)) }, (_, i) => {
            const y0 = (i * H) / Math.max(1, Math.round(H / 2))
            const y1 = ((i + 1) * H) / Math.max(1, Math.round(H / 2))
            return <Line key={i} points={[0, y0, W, y0, 0, y1]} stroke="#666" strokeWidth={1} strokeScaleEnabled={false} />
          })}
        </>
      )
    case 'cutout':
    case 'logo':
      return img ? (
        <>
          <Rect width={W} height={H} fill={s.kind === 'logo' ? fill : undefined} stroke={stroke} strokeWidth={sw} dash={[4, 3]} strokeScaleEnabled={false} />
          <KImage image={img} width={W} height={H} />
        </>
      ) : (
        <>
          <Rect width={W} height={H} fill={s.kind === 'logo' ? fill : '#ffffff10'} {...common} dash={[4, 3]} />
          <Text width={W} y={H / 2 - 0.3} align="center" text={s.kind === 'logo' ? 'LOGO' : 'UPLOAD PNG'} fontSize={Math.min(0.6, W / 6)} fill="#bbb" fontFamily="Inter" fontStyle="600" />
        </>
      )
    default:
      return (
        <>
          <Rect width={W} height={H} fill={fill} {...common} />
          {s.skin === 'led' && Array.from({ length: Math.max(0, Math.floor(W / 0.5) - 1) }, (_, i) => <Line key={i} points={[(i + 1) * 0.5, 0, (i + 1) * 0.5, H]} stroke="#ffffff10" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
        </>
      )
  }
}

// Dots along the outline of rectangular pieces (bulbs) or a glow line (neon).
function Bulbs({ s }: { s: SetPiece }) {
  const v = useView()
  const o = s.outline!
  const pts = useMemo(() => outlinePoints(s, 0.5), [s])
  if (o.style === 'neon') return <Line points={pts.flatMap((p) => [p[0], p[1]])} closed={s.kind !== 'arch'} stroke={o.color} strokeWidth={3} strokeScaleEnabled={false} shadowColor={o.color} shadowBlur={8} listening={false} />
  return (
    <Group listening={false}>
      {pts.map((p, i) => (
        <Circle key={i} x={p[0]} y={p[1]} radius={Math.max(0.07, 1.6 / v.scale)} fill={o.color} />
      ))}
    </Group>
  )
}

function PieceProps({ s }: { s: SetPiece }) {
  const { mutate, select, notify } = useStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const set = useStore((st) => st.project.set ?? [])
  const twin = set.find((x) => x.mirrorOf === s.id)
  const src = s.mirrorOf ? set.find((x) => x.id === s.mirrorOf) : undefined
  const up = (patch: Partial<SetPiece>) => mutate((p) => Object.assign(p.set!.find((x) => x.id === s.id)!, patch))
  const info = SET_KINDS[s.kind]
  if (src)
    return (
      <Section title={s.label}>
        <p className="text-xs text-dim">This piece mirrors “{src.label}” on the other side. Change that one and this follows.</p>
        <button className="btn w-full justify-center" onClick={() => select({ kind: 'set', id: src.id })}>
          Edit “{src.label}”
        </button>
        <button className="btn w-full justify-center" onClick={() => up({ mirrorOf: undefined })}>
          <Link2Off size={13} /> Unlink and edit on its own
        </button>
      </Section>
    )
  return (
    <>
      <Section
        title={info.name}
        right={
          <div className="flex gap-1">
            <button
              className="btn btn-icon h-7 w-7"
              title="Duplicate beside it"
              onClick={() =>
                mutate((p) => {
                  const c = { ...structuredClone(s), id: nanoid(8), x: s.x + s.w, mirrorOf: undefined }
                  p.set!.push(c)
                  setTimeout(() => select({ kind: 'set', id: c.id }))
                })
              }
            >
              <Copy size={13} />
            </button>
            <button className="btn btn-icon h-7 w-7" title="Delete" onClick={() => (mutate((p) => void (p.set = p.set!.filter((x) => x.id !== s.id && x.mirrorOf !== s.id))), select(null))}>
              <Trash2 size={13} />
            </button>
          </div>
        }
      >
        <p className="text-[11px] text-mute">{info.tip}</p>
        <Txt label="Name" value={s.label} onChange={(label) => up({ label })} />
        <div className="text-[10px] uppercase tracking-wider text-mute">Size</div>
        <div className="grid grid-cols-3 gap-2">
          <Num label="Width (X)" value={s.w} onChange={(w) => up({ w: Math.max(0.1, w) })} unit="m" step={0.5} />
          <Num label="Height (Z)" value={s.h} onChange={(h) => up({ h: Math.max(0.1, h) })} unit="m" step={0.5} />
          <Num label="Depth (Y)" value={s.d} onChange={(d) => up({ d: Math.max(0.05, d) })} unit="m" step={0.1} />
        </div>
        {(s.kind === 'shape' || s.kind === 'line') && (
          <div className="grid grid-cols-2 gap-2">
            <Num
              label="Push out"
              value={planeSize(s)[2]}
              onChange={(n) => {
                const v = Math.max(0.02, n)
                up((s.plane ?? 'front') === 'front' ? { d: v } : s.plane === 'top' ? { h: v } : { w: v })
              }}
              unit="m"
              step={0.1}
              tip="How far the drawing is pushed out into a solid (like Extrude in CAD)."
            />
            {s.kind === 'line' && <Num label="Thickness" value={s.border ?? 0.15} onChange={(n) => up({ border: Math.max(0.02, n) })} unit="m" step={0.05} tip="How fat the pipe or beam is." />}
          </div>
        )}
        <div className="text-[10px] uppercase tracking-wider text-mute">Position</div>
        <div className="grid grid-cols-3 gap-2">
          <Num label="Across (X)" value={s.x} onChange={(x) => up({ x })} unit="m" step={0.25} tip="Centre of the piece across the venue." />
          <Num label="Depth (Y)" value={s.y} onChange={(y) => up({ y })} unit="m" step={0.5} tip="How far from the back of the venue it stands. Bigger numbers come forward, towards the audience." />
          <Num label="Up (Z)" value={s.z} onChange={(z) => up({ z: Math.max(0, z) })} unit="m" step={0.5} tip="Height of the bottom edge off the ground. Put a header beam on top of towers this way." />
        </div>
        <Num label="Turn" value={s.rot ?? 0} onChange={(r) => up({ rot: ((Math.round(r) % 360) + 360) % 360 || undefined })} unit="°" step={15} tip="Turn the piece as seen from above. You can also use the round handle in the top view." />
        <div className="grid grid-cols-3 gap-1">
          <button className="btn justify-center text-[11px]" title="Move to the stage centre line" onClick={() => up({ x: setLine(useStore.getState().project).cx })}>
            Centre
          </button>
          <button
            className="btn justify-center text-[11px]"
            title="Add a copy stacked on top"
            onClick={() =>
              mutate((p) => {
                const c = { ...structuredClone(s), id: nanoid(8), z: s.z + s.h, mirrorOf: undefined }
                p.set!.push(c)
                setTimeout(() => select({ kind: 'set', id: c.id }))
              })
            }
          >
            <Layers size={12} /> Stack
          </button>
          <button
            className="btn justify-center text-[11px]"
            disabled={!!twin}
            title="Build a live mirror on the other side of the stage"
            onClick={() => {
              mutate((p) => void p.set!.push({ ...structuredClone(s), id: nanoid(8), mirrorOf: s.id, label: `${s.label} (mirror)` }))
              notify('Mirror added: it follows every change to this piece')
            }}
          >
            <FlipHorizontal2 size={12} /> Mirror
          </button>
        </div>
      </Section>

      <Section title="Look">
        <Sel label="Surface" value={s.skin} onChange={(skin) => up({ skin })} options={SKINS.map((k) => ({ value: k.id, label: k.name }))} tip="LED surfaces show your content in 3D and count towards LED area." />
        {(s.skin === 'paint' || s.skin === 'fabric' || s.skin === 'print' || s.kind === 'logo') && (
          <label className="flex items-center justify-between text-xs">
            <span className="label">Colour</span>
            <input type="color" value={s.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-14 bg-transparent border border-line rounded" />
          </label>
        )}
        {hasOpening(s.kind) && (
          <>
            <Sel label="Inside the opening" value={(s.inner ?? 'open') as string} onChange={(inner) => up({ inner: inner as SetPiece['inner'] })} options={[{ value: 'open', label: 'Open (see through)' }, ...SKINS.map((k) => ({ value: k.id, label: k.name }))]} />
            <Num label="Frame thickness" value={s.border ?? 0.6} onChange={(border) => up({ border: Math.max(0.1, border) })} unit="m" step={0.1} />
          </>
        )}
        {(s.kind === 'cutout' || s.kind === 'logo' || s.kind === 'balloon' || s.skin === 'print') && (
          <>
            <input
              ref={file}
              type="file"
              accept="image/png,image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) up({ image: await readImage(f, 1200) })
                e.target.value = ''
              }}
            />
            <button className="btn w-full justify-center" onClick={() => file.current?.click()}>
              <ImageIcon size={13} /> {s.image ? 'Replace artwork' : s.kind === 'cutout' ? 'Upload PNG (transparent background)' : 'Upload artwork'}
            </button>
            {s.image && (
              <button className="btn w-full justify-center" onClick={() => up({ image: undefined })}>
                Remove artwork
              </button>
            )}
          </>
        )}
      </Section>

      <Section title="Outline lights">
        <Check label="Lights along the edges" checked={!!s.outline} onChange={(on) => up({ outline: on ? { style: 'bulb', color: '#ffd27a', chase: true } : undefined })} />
        {s.outline && (
          <>
            <div className="grid grid-cols-2 gap-1">
              {(['bulb', 'neon'] as const).map((st) => (
                <button key={st} className={`btn justify-center ${s.outline!.style === st ? 'btn-on' : ''}`} onClick={() => up({ outline: { ...s.outline!, style: st } })}>
                  {st === 'bulb' ? 'Bulbs' : 'Neon'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {['#ffd27a', '#ffffff', '#ff2d55', '#22d3ee', '#a855f7', '#22c55e', '#ff8c42'].map((c) => (
                <button key={c} className={`h-6 w-6 rounded-full border ${s.outline!.color === c ? 'border-white' : 'border-line'}`} style={{ background: c }} onClick={() => up({ outline: { ...s.outline!, color: c } })} />
              ))}
            </div>
            <Check label="Chase (running lights)" checked={s.outline.chase} onChange={(chase) => up({ outline: { ...s.outline!, chase } })} />
          </>
        )}
      </Section>
      <Section title="Numbers">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="LED area" value={`${fmt(setLedArea(s), 1)} m²`} />
          <Stat label="Front area" value={`${fmt(s.w * s.h, 1)} m²`} />
        </div>
        <button
          className="btn w-full justify-center"
          onClick={() => up({ skin: info.skin, color: '#ffffff', outline: undefined, image: undefined })}
        >
          <Wand2 size={12} /> Reset look
        </button>
      </Section>
    </>
  )
}
