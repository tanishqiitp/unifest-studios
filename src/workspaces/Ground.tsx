import { useEffect, useRef, useState } from 'react'
import { Circle, Line, Rect, Text } from 'react-konva'
import { nanoid } from 'nanoid'
import { Building2, Copy, Ruler, Spline, Trash2, TreePine, Upload, Warehouse } from 'lucide-react'
import { useStore } from '../store'
import type { GroundItem } from '../types'
import { PlanCanvas, useView } from '../components/PlanCanvas'
import { GROUND_STYLE, TopView } from '../components/TopView'
import { fmt } from '../lib/calc'
import { audienceEstimate, audienceVerdict } from '../lib/capacity'
import { Check, Num, Section, Stat, Tip, Txt } from '../components/ui'

const DEFAULT_SIZE: Record<GroundItem['kind'], [number, number]> = {
  crowd: [20, 15],
  seating: [16, 10],
  vip: [16, 5],
  foh: [5, 4],
  barricade: [14, 0.6],
  entry: [6, 1],
  exit: [1, 4],
  delay: [2, 2],
  camera: [3, 2],
  generator: [5, 3],
  greenroom: [6, 4],
  washroom: [4, 6],
  food: [6, 8],
  building: [12, 8],
  tree: [5, 5],
  label: [6, 1.5],
}

export function GroundWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select } = useStore.getState()
  const [sight, setSight] = useState(true)
  const item = sel?.kind === 'ground' ? project.ground.find((g) => g.id === sel.id) : undefined
  const est = audienceEstimate(project)
  const verdict = audienceVerdict(est, project.audience)
  const zoneEst = item ? est.zones.find((z) => z.id === item.id) : undefined
  const file = useRef<HTMLInputElement>(null)
  // Tracing a site photo: set its scale from a known distance, outline the plot, mark buildings and trees.
  const [trace, setTrace] = useState<Trace>(null)
  const [pts, setPts] = useState<{ x: number; y: number }[]>([])
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const stop = () => (setTrace(null), setPts([]), setDrag(null))
  const finishBoundary = (list = pts) => {
    if (list.length < 3) return stop()
    mutate((p) => void (p.venue.outline = list.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)] as [number, number])))
    useStore.getState().notify('Plot boundary traced. Use “Fit venue to plot” if the venue should match it.')
    stop()
  }
  useEffect(() => {
    if (!trace) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
      if (e.key === 'Enter' && trace === 'boundary') finishBoundary()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const down = (w: { x: number; y: number }) => {
    if (!trace) return
    if (trace === 'scale') {
      const next = [...pts, w]
      if (next.length < 2) return setPts(next)
      const d = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y)
      const real = Number(prompt('How many metres apart are these two points in real life?', String(Math.round(d * 10) / 10)))
      if (real > 0 && d > 0.01) {
        mutate((p) => void (p.venue.imageScale = +((p.venue.imageScale ?? p.venue.w) * (real / d)).toFixed(2)))
        useStore.getState().notify(`Image scale set: ${real} m between the points. The plan now matches the photo.`)
      }
      return stop()
    }
    if (trace === 'boundary') {
      const first = pts[0]
      if (first && pts.length >= 3 && Math.hypot(w.x - first.x, w.y - first.y) < 1.5) return finishBoundary()
      return setPts([...pts, w])
    }
    if (trace === 'building') return setDrag(w)
    if (trace === 'tree')
      mutate((p) => void p.ground.push({ id: nanoid(8), kind: 'tree', x: +(w.x - 2.5).toFixed(2), y: +(w.y - 2.5).toFixed(2), w: 5, h: 5, rotation: 0, label: 'Tree' }))
  }
  const up = (w: { x: number; y: number }) => {
    if (trace !== 'building' || !drag) return
    const x = Math.min(drag.x, w.x)
    const y = Math.min(drag.y, w.y)
    const bw = Math.abs(w.x - drag.x)
    const bh = Math.abs(w.y - drag.y)
    setDrag(null)
    if (bw < 0.5 || bh < 0.5) return
    mutate((p) => void p.ground.push({ id: nanoid(8), kind: 'building', x: +x.toFixed(2), y: +y.toFixed(2), w: +bw.toFixed(2), h: +bh.toFixed(2), rotation: 0, label: 'Building' }))
  }

  const add = (kind: GroundItem['kind']) =>
    mutate((p) => {
      const [w, h] = DEFAULT_SIZE[kind]
      const g: GroundItem = { id: nanoid(8), kind, x: Math.max(0, p.venue.w / 2 - w / 2), y: Math.max(0, p.venue.l / 2 - h / 2), w, h, rotation: 0, label: GROUND_STYLE[kind].name }
      p.ground.push(g)
      setTimeout(() => select({ kind: 'ground', id: g.id }))
    })

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <Section title="Venue">
          <button className="btn w-full justify-center" onClick={() => useStore.getState().setUI({ venuesOpen: true })}>
            <Building2 size={13} /> Pick from venue library
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Width" value={project.venue.w} onChange={(w) => mutate((p) => void (p.venue.w = w))} unit="m" step={1} min={5} />
            <Num label="Length" value={project.venue.l} onChange={(l) => mutate((p) => void (p.venue.l = l))} unit="m" step={1} min={5} />
          </div>
          <Num label="Expected audience" value={project.audience} onChange={(audience) => mutate((p) => void (p.audience = audience))} int step={50} min={0} />
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const r = new FileReader()
              r.onload = () => mutate((p) => void (p.venue.image = String(r.result)))
              r.readAsDataURL(f)
            }}
          />
          <button className="btn w-full justify-center" onClick={() => file.current?.click()}>
            <Upload size={13} /> {project.venue.image ? 'Replace site image' : 'Trace over a site image'}
          </button>
          {project.venue.image && (
            <>
              <Num label="Image width in real life" value={project.venue.imageScale ?? project.venue.w} onChange={(imageScale) => mutate((p) => void (p.venue.imageScale = imageScale))} unit="m" step={1} tip="Set how many metres the image's full width covers, so it lines up with the grid. Use the measure tool (D) to check a known distance." />
              <button className="btn w-full justify-center" onClick={() => mutate((p) => void (p.venue.image = undefined))}>
                Remove image
              </button>
            </>
          )}
          <div className="label pt-1">Trace the site</div>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ['scale', 'Set scale', Ruler, 'Click two points a known distance apart (a road, a wall, a tent) and type the real distance: the photo then matches the grid.'],
                ['boundary', 'Plot boundary', Spline, 'Click around the edge of the plot; click the first point (or press Enter) to close it.'],
                ['building', 'Building', Warehouse, 'Drag a box over each building, wall or fixed structure.'],
                ['tree', 'Trees', TreePine, 'Click on each tree. Press Esc when done.'],
              ] as const
            ).map(([k, l, Icon, tip]) => (
              <button key={k} className={`btn h-8 text-[11px] justify-center ${trace === k ? 'btn-on' : ''}`} title={tip} disabled={k === 'scale' && !project.venue.image} onClick={() => (trace === k ? stop() : (setPts([]), setTrace(k)))}>
                <Icon size={12} /> {l}
              </button>
            ))}
          </div>
          {trace && (
            <p className="text-[11px] text-dim leading-snug">
              {
                {
                  scale: pts.length ? 'Now click the second point.' : 'Click the first of two points a known distance apart.',
                  boundary: pts.length < 3 ? 'Click the corners of the plot.' : 'Keep clicking corners; click the first point or press Enter to finish.',
                  building: 'Drag a box over a building or structure.',
                  tree: 'Click on each tree.',
                }[trace]
              }{' '}
              Esc to stop.
            </p>
          )}
          {trace === 'boundary' && pts.length >= 3 && (
            <button className="btn btn-primary h-8 w-full justify-center text-[11px]" onClick={() => finishBoundary()}>
              Finish boundary ({pts.length} points)
            </button>
          )}
          {project.venue.outline && !trace && (
            <div className="grid grid-cols-2 gap-1">
              <button
                className="btn h-8 text-[11px] justify-center"
                title="Make the venue big enough to hold the traced plot"
                onClick={() =>
                  mutate((p) => {
                    const o = p.venue.outline!
                    p.venue.w = Math.ceil(Math.max(...o.map((q) => q[0])) + 1)
                    p.venue.l = Math.ceil(Math.max(...o.map((q) => q[1])) + 1)
                  })
                }
              >
                Fit venue to plot
              </button>
              <button className="btn h-8 text-[11px] justify-center" onClick={() => mutate((p) => void (p.venue.outline = undefined))}>
                Remove boundary
              </button>
            </div>
          )}
          <Check label="Show screen sightlines" checked={sight} onChange={setSight} tip="Faint cones show where each screen can be seen; dashed arc is the closest comfortable viewing distance." />
        </Section>
        <Section title="Add to plan">
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(GROUND_STYLE) as GroundItem['kind'][]).map((k) => (
              <button key={k} onClick={() => add(k)} className="rounded-lg border border-line px-2 py-2 text-left text-[11px] hover:border-line-hi hover:bg-raised transition-colors flex items-center justify-between gap-1" title={GROUND_STYLE[k].tip}>
                <span>{GROUND_STYLE[k].name}</span>
                <span className="h-3 w-3 rounded-sm border shrink-0" style={{ background: GROUND_STYLE[k].fill, borderColor: GROUND_STYLE[k].stroke }} />
              </button>
            ))}
          </div>
        </Section>
      </aside>
      <div className="relative flex-1 min-w-0 bg-canvas">
        <PlanCanvas
          bounds={{ x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }}
          grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }}
          onBackground={() => !trace && select(null)}
          onWorldDown={down}
          onWorldMove={(w) => trace && setHover(w)}
          onWorldUp={up}
          cursor={trace ? 'crosshair' : undefined}
        >
          <TopView edit={trace ? 'sound' : 'ground'} sightlines={sight} />
          {trace && <TraceOverlay trace={trace} pts={pts} hover={hover} drag={drag} />}
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Top view · stage at the top · drag to move, handles to resize · double-click a screen to edit it</div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {item ? (
          <div className="fade-in">
            <Section
              title={GROUND_STYLE[item.kind].name}
              right={
                <div className="flex gap-1">
                  <button className="btn btn-icon h-7 w-7" title="Duplicate" onClick={() => mutate((p) => void p.ground.push({ ...item, id: nanoid(8), x: item.x + 1, y: item.y + 1 }))}>
                    <Copy size={13} />
                  </button>
                  <button className="btn btn-icon h-7 w-7" title="Delete" onClick={() => (mutate((p) => void (p.ground = p.ground.filter((g) => g.id !== item.id))), select(null))}>
                    <Trash2 size={13} />
                  </button>
                </div>
              }
            >
              <p className="text-[11px] text-mute leading-relaxed">{GROUND_STYLE[item.kind].tip}</p>
              <Txt label="Label" value={item.label} onChange={(label) => upd(item.id, { label })} />
              <div className="grid grid-cols-2 gap-2">
                <Num label="X" value={item.x} onChange={(x) => upd(item.id, { x })} unit="m" step={0.5} />
                <Num label="Y" value={item.y} onChange={(y) => upd(item.id, { y })} unit="m" step={0.5} />
                <Num label="Width" value={item.w} onChange={(w) => upd(item.id, { w })} unit="m" step={0.5} min={0.2} />
                <Num label="Depth" value={item.h} onChange={(h) => upd(item.id, { h })} unit="m" step={0.5} min={0.2} />
                <Num label="Rotation" value={item.rotation} onChange={(rotation) => upd(item.id, { rotation })} unit="°" step={15} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Area" value={`${fmt(item.w * item.h, 1)} m²`} />
                {zoneEst && <Stat label="Space for" value={`~${zoneEst.people.toLocaleString('en-IN')} ppl`} sub={`${fmt(zoneEst.usable, 0)} m² usable`} />}
              </div>
            </Section>
          </div>
        ) : (
          <Section title="Plan summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Space estimate" value={est.status === 'unknown' ? '—' : `~${est.estimate.toLocaleString('en-IN')}`} sub={est.status === 'check' ? 'unverified' : est.tableSeats ? `incl. ${est.tableSeats} table seats` : 'geometric estimate'} />
              <Stat label="Expected" value={project.audience.toLocaleString('en-IN')} sub={verdict.text} />
              <Stat label="Venue area" value={`${fmt(project.venue.w * project.venue.l, 0)} m²`} />
              <Stat label="Exits" value={project.ground.filter((g) => g.kind === 'exit').length} />
            </div>
            {est.issues.length > 0 && (
              <ul className="space-y-1" aria-label="Audience space issues">
                {est.issues.map((i, n) => (
                  <li key={n}>
                    <button className="w-full text-left text-[11px] leading-snug flex gap-1.5 hover:text-white text-dim disabled:cursor-default" disabled={!i.id} onClick={() => i.id && select({ kind: 'ground', id: i.id })}>
                      <span className={i.level === 'error' ? 'text-err font-semibold' : 'text-warn font-semibold'}>{i.level === 'error' ? 'Error' : 'Check'}</span>
                      <span>{i.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-mute leading-relaxed flex gap-1.5">
              <Tip text={est.assumptions.join(' ')} />
              Capacity is an estimate. Always confirm with your venue and local authorities.
            </p>
          </Section>
        )}
      </aside>
    </div>
  )
}

function upd(id: string, patch: Partial<GroundItem>) {
  useStore.getState().mutate((p) => {
    const g = p.ground.find((x) => x.id === id)
    if (g) Object.assign(g, patch)
  })
}

type Trace = null | 'scale' | 'boundary' | 'building' | 'tree'

// What is being traced, drawn over the plan as you click.
function TraceOverlay({ trace, pts, hover, drag }: { trace: Exclude<Trace, null>; pts: { x: number; y: number }[]; hover: { x: number; y: number } | null; drag: { x: number; y: number } | null }) {
  const v = useView()
  const col = trace === 'boundary' ? '#fbbf24' : trace === 'scale' ? '#38bdf8' : '#ffffff'
  const line = [...pts, ...(hover ? [hover] : [])].flatMap((q) => [q.x, q.y])
  return (
    <>
      {line.length >= 4 && <Line points={line} stroke={col} strokeWidth={2} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />}
      {pts.map((q, i) => (
        <Circle key={i} x={q.x} y={q.y} radius={(i === 0 && trace === 'boundary' ? 6 : 4) / v.scale} fill={col} listening={false} />
      ))}
      {trace === 'scale' && pts.length === 1 && hover && (
        <Text x={hover.x + 8 / v.scale} y={hover.y} text={`${fmt(Math.hypot(hover.x - pts[0].x, hover.y - pts[0].y), 1)} m on the plan`} fontSize={11 / v.scale} fill={col} listening={false} />
      )}
      {trace === 'building' && drag && hover && (
        <Rect x={Math.min(drag.x, hover.x)} y={Math.min(drag.y, hover.y)} width={Math.abs(hover.x - drag.x)} height={Math.abs(hover.y - drag.y)} stroke="#b5b5b5" fill="#9a9a9a33" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      )}
      {trace === 'tree' && hover && <Circle x={hover.x} y={hover.y} radius={2.5} stroke="#5fbf6b" fill="#2f7d3a55" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />}
    </>
  )
}
