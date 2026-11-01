import { useMemo, useRef, useState } from 'react'
import { Group, Line, Rect, Shape, Text } from 'react-konva'
import type Konva from 'konva'
import { nanoid } from 'nanoid'
import { Copy, FlipHorizontal2, Image as ImageIcon, Link2Off, Paintbrush, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Panel, Project, Screen } from '../types'
import { PlanCanvas, useView, type CanvasApi } from '../components/PlanCanvas'
import { cableOrder, circuitsFor, fmt, portMap, powerPlan, screenStats, stageBounds, TRUSS_INFO, VOLTS } from '../lib/calc'
import { allPanels, findPanel, suggestPitch } from '../lib/panels'
import { Check, Empty, Modal, Num, Section, Seg, Sel, Stat, Txt } from '../components/ui'

const SWATCHES = ['#d4d4d4', '#ffffff', '#8a8a8a', '#4a4a4a', '#3b5bdb', '#0ca678', '#e8590c', '#c2255c']

export function newScreen(p: Project, opts: Partial<Screen> = {}): Screen {
  const sb = stageBounds(p)
  const panel = findPanel(opts.panelId ?? p.screens[0]?.panelId ?? 'p39-500', p.customPanels)
  const cols = opts.cols ?? 12
  const W = (cols * panel.w) / 1000
  return {
    id: nanoid(8),
    name: `SCREEN ${p.screens.length + 1}`,
    panelId: panel.id,
    cols,
    rows: 8,
    virtual: [],
    x: p.venue.w / 2 - W / 2,
    y: sb ? sb.y + 0.6 : 2.6,
    z: sb ? sb.h + 0.5 : 1,
    rotation: 0,
    shape: 'flat',
    curveDeg: 0,
    mount: 'flown',
    color: '#d4d4d4',
    ...opts,
  }
}

export function LedWorkspace() {
  const project = useStore((s) => s.project)
  const ui = useStore((s) => s.ui)
  const { mutate, select } = useStore.getState()
  const api = useRef<CanvasApi>(null)
  const sb = stageBounds(project)

  const bounds = useMemo(() => {
    if (!project.screens.length) return { x: project.venue.w / 2 - 10, y: -10, w: 20, h: 12 }
    let x0 = Infinity
    let x1 = -Infinity
    let top = 0
    for (const s of project.screens) {
      const st = screenStats(s, project.customPanels)
      x0 = Math.min(x0, s.x)
      x1 = Math.max(x1, s.x + st.w)
      top = Math.max(top, s.z + st.h)
    }
    return { x: x0 - 2, y: -top - 2, w: x1 - x0 + 4, h: top + 3 }
  }, [project.screens, project.customPanels])

  const sel = ui.selection?.kind === 'screen' ? project.screens.find((s) => s.id === ui.selection!.id) : undefined

  return (
    <div className="flex h-full">
      <LeftPanel project={project} selId={sel?.id} />
      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas
          apiRef={api}
          bounds={bounds}
          grid={{ x: Math.min(0, bounds.x), y: Math.min(-1, bounds.y), w: Math.max(project.venue.w, bounds.w + bounds.x), h: Math.max(bounds.h, 1) + 1 }}
          onBackground={() => select(null)}
          overlay={<CanvasToolbar />}
        >
          <Elevation project={project} />
          {project.screens.map((s) => (
            <ScreenNode key={s.id} s={s} project={project} selected={sel?.id === s.id} />
          ))}
        </PlanCanvas>
        {sb == null && project.screens.length > 0 && <div className="absolute left-4 bottom-4 text-[11px] text-mute">Front view. Floor = 0 m. Curved screens are shown unrolled.</div>}
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {sel ? (
          <ScreenProps s={sel} />
        ) : (
          <Empty
            title="Select a screen"
            text="Click a screen to edit its size, panels, wiring and power. Or add one from the left."
            action={
              <button className="btn btn-primary" onClick={() => mutate((p) => void p.screens.push(newScreen(p)))}>
                <Plus size={14} /> Add screen
              </button>
            }
          />
        )}
      </aside>
    </div>
  )
}

function CanvasToolbar() {
  const ui = useStore((s) => s.ui)
  const mode = ui.mode
  const { setUI, mutate, notify } = useStore.getState()
  const sel = ui.selection?.kind === 'screen' ? ui.selection.id : null
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 glass rounded-xl flex items-center gap-1 p-1">
      <button className={`btn h-8 ${ui.tool === 'paint' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: ui.tool === 'paint' ? 'select' : 'paint' })} title="Paint mode (B): click or drag over panels to mark them empty">
        <Paintbrush size={14} /> Paint
      </button>
      <button
        className="btn h-8"
        disabled={!sel}
        title="Live symmetry: build a linked mirror on the other side of the centre axis"
        onClick={() =>
          mutate((p) => {
            const s = p.screens.find((x) => x.id === sel)
            if (!s) return
            if (p.screens.some((x) => x.mirrorOf === s.id)) return notify('This screen already has a mirror.')
            p.screens.push({ ...s, id: nanoid(8), name: s.name.includes('LEFT') ? s.name.replace('LEFT', 'RIGHT') : `${s.name} (MIRROR)`, mirrorOf: s.id })
          })
        }
      >
        <FlipHorizontal2 size={14} /> Live symmetry
      </button>
      {mode === 'pro' && (
        <>
          <div className="w-px h-5 bg-line mx-1" />
          <div className="w-52">
          <Seg
            value={ui.overlay}
            onChange={(overlay) => setUI({ overlay })}
            options={[
              { value: 'none', label: 'Panels' },
              { value: 'data', label: 'Data' },
              { value: 'power', label: 'Power' },
            ]}
          />
          </div>
        </>
      )}
    </div>
  )
}

function Elevation({ project }: { project: Project }) {
  const v = useView()
  const sb = stageBounds(project)
  const axis = project.venue.w / 2
  const fs = 11 / v.scale
  const trussLines = project.truss.filter((t) => Math.abs(t.y1 - t.y2) < 0.01)
  return (
    <Group listening={false}>
      <Line points={[-50, 0, project.venue.w + 50, 0]} stroke="#3f3f3f" strokeWidth={1} strokeScaleEnabled={false} />
      <Text x={0.2} y={0.15} text="GROUND 0.0 m" fontSize={fs} fill="#6b6b6b" fontFamily="JetBrains Mono" />
      {sb && (
        <>
          <Rect x={sb.x} y={-sb.h} width={sb.w} height={sb.h} fill="#0f0f0f" stroke="#2a2a2a" strokeWidth={1} strokeScaleEnabled={false} />
          <Text x={sb.x + 0.2} y={-sb.h + 0.15} text={`STAGE +${fmt(sb.h, 2)} m`} fontSize={fs} fill="#6b6b6b" fontFamily="JetBrains Mono" />
        </>
      )}
      {trussLines.map((t) => {
        const s = TRUSS_INFO[t.type].size
        return (
          <Group key={t.id}>
            <Rect x={Math.min(t.x1, t.x2)} y={-t.height - s} width={Math.abs(t.x2 - t.x1)} height={s} stroke="#3f3f3f" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 3]} />
            {t.legs && (
              <>
                <Rect x={Math.min(t.x1, t.x2)} y={-t.height} width={s} height={t.height} stroke="#2a2a2a" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 3]} />
                <Rect x={Math.max(t.x1, t.x2) - s} y={-t.height} width={s} height={t.height} stroke="#2a2a2a" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 3]} />
              </>
            )}
          </Group>
        )
      })}
      <Line points={[axis, 1, axis, -30]} stroke="#ffffff" opacity={0.35} strokeWidth={1} dash={[6, 6]} strokeScaleEnabled={false} />
      <Text x={axis + 0.15} y={-0.6} text="CENTER AXIS" fontSize={fs} fill="#a3a3a3" fontFamily="JetBrains Mono" />
    </Group>
  )
}

function ScreenNode({ s, project, selected }: { s: Screen; project: Project; selected: boolean }) {
  const v = useView()
  const ui = useStore((st) => st.ui)
  const { mutate, select } = useStore.getState()
  const st = screenStats(s, project.customPanels)
  const panel = st.panel
  const cw = panel.w / 1000
  const ch = panel.h / 1000
  const [paint, setPaint] = useState<{ set: Set<number>; value: boolean } | null>(null)
  const painting = useRef(false)
  const locked = !!s.mirrorOf

  const virtual = paint ? paint.set : new Set(s.virtual)
  const order = useMemo(() => cableOrder(s), [s])
  const orderIndex = useMemo(() => {
    const m = new Map<number, number>()
    order.forEach((c, i) => m.set(c, i))
    return m
  }, [order])
  const pm = ui.overlay === 'data' ? portMap(s, panel, project.processor.portPx) : null
  const pc = ui.overlay === 'power' ? powerPlan(project).circuits.filter((c) => c.screenId === s.id) : null

  const cellAt = (node: Konva.Node) => {
    const p = node.getRelativePointerPosition()
    if (!p) return -1
    const c = Math.floor(p.x / cw)
    const r = Math.floor(p.y / ch)
    if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) return -1
    return r * s.cols + c
  }

  const applyPaint = (idx: number, base: { set: Set<number>; value: boolean }) => {
    if (idx < 0) return base
    const next = new Set(base.set)
    if (base.value) next.add(idx)
    else next.delete(idx)
    return { ...base, set: next }
  }

  const fill = s.color
  const pxSize = Math.min(cw, ch) * v.scale
  const shades = ['#3a3a3a', '#5a5a5a', '#7a7a7a', '#9a9a9a']

  return (
    <Group
      x={s.x}
      y={-(s.z + st.h)}
      draggable={ui.tool === 'select' && !locked}
      onDragEnd={(e) => {
        const snap = (n: number, step: number) => (ui.magnet ? Math.round(n / step) * step : n)
        const nx = snap(e.target.x(), cw / 2)
        const nz = Math.max(0, snap(-e.target.y() - st.h, 0.1))
        e.target.position({ x: nx, y: -(nz + st.h) })
        mutate((p) => {
          const t = p.screens.find((x) => x.id === s.id)
          if (t) {
            t.x = Math.round(nx * 1000) / 1000
            t.z = Math.round(nz * 1000) / 1000
          }
        })
      }}
      onMouseDown={(e) => {
        select({ kind: 'screen', id: locked ? s.mirrorOf! : s.id })
        if (ui.tool === 'paint' && !locked) {
          e.cancelBubble = true
          const idx = cellAt(e.currentTarget)
          if (idx < 0) return
          painting.current = true
          const base = { set: new Set(s.virtual), value: !s.virtual.includes(idx) }
          setPaint(applyPaint(idx, base))
        }
      }}
      onMouseMove={(e) => {
        if (painting.current && paint) setPaint(applyPaint(cellAt(e.currentTarget), paint))
      }}
      onMouseUp={() => {
        if (painting.current && paint) {
          const next = [...paint.set].sort((a, b) => a - b)
          mutate((p) => {
            const t = p.screens.find((x) => x.id === s.id)
            if (t) t.virtual = next
          })
        }
        painting.current = false
        setPaint(null)
      }}
      onMouseLeave={() => {
        if (painting.current && paint) {
          const next = [...paint.set].sort((a, b) => a - b)
          mutate((p) => {
            const t = p.screens.find((x) => x.id === s.id)
            if (t) t.virtual = next
          })
        }
        painting.current = false
        setPaint(null)
      }}
    >
      <Shape
        width={st.w}
        height={st.h}
        sceneFunc={(ctx, shape) => {
          const c2 = ctx._context
          const lw = 1 / v.scale
          for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
              const idx = r * s.cols + c
              const x = c * cw
              const y = r * ch
              if (virtual.has(idx)) {
                c2.setLineDash([3 / v.scale, 3 / v.scale])
                c2.strokeStyle = '#2a2a2a'
                c2.lineWidth = lw
                c2.strokeRect(x + lw, y + lw, cw - 2 * lw, ch - 2 * lw)
                c2.setLineDash([])
                continue
              }
              let f = fill + '33'
              if (pc) {
                const ci = pc.findIndex((k) => k.cells.includes(idx))
                f = shades[ci % shades.length]
              }
              if (pm) {
                const pi = pm.ports.findIndex((k) => k.includes(idx))
                f = shades[pi % shades.length]
              }
              c2.fillStyle = f
              c2.fillRect(x, y, cw, ch)
              c2.strokeStyle = fill + '88'
              c2.lineWidth = lw
              c2.strokeRect(x, y, cw, ch)
              if (pxSize > 22) {
                c2.fillStyle = '#ffffffaa'
                c2.font = `${Math.min(ch * 0.22, 10 / v.scale)}px JetBrains Mono`
                c2.fillText(String((orderIndex.get(idx) ?? 0) + 1), x + 3 / v.scale, y + 11 / v.scale)
              }
            }
          }
          // Data path or circuit labels
          const centre = (idx: number) => [((idx % s.cols) + 0.5) * cw, (Math.floor(idx / s.cols) + 0.5) * ch]
          if (pm) {
            pm.ports.forEach((cells, pi) => {
              c2.strokeStyle = '#ffffff'
              c2.lineWidth = 1.5 / v.scale
              c2.beginPath()
              cells.forEach((idx, i) => {
                const [x, y] = centre(idx)
                if (i === 0) c2.moveTo(x, y)
                else c2.lineTo(x, y)
              })
              c2.stroke()
              const [x0, y0] = centre(cells[0])
              c2.fillStyle = '#fff'
              c2.beginPath()
              c2.arc(x0, y0, 5 / v.scale, 0, Math.PI * 2)
              c2.fill()
              c2.fillStyle = '#000'
              c2.font = `bold ${8 / v.scale}px JetBrains Mono`
              c2.fillText(String(pi + 1), x0 - 2.5 / v.scale, y0 + 3 / v.scale)
            })
          }
          if (pc) {
            pc.forEach((k) => {
              const [x, y] = centre(k.cells[0])
              c2.fillStyle = '#fff'
              c2.font = `bold ${10 / v.scale}px JetBrains Mono`
              c2.fillText(`C${k.index + 1}·${k.phase}`, x - cw * 0.4, y + 4 / v.scale)
            })
          }
          ctx.fillStrokeShape(shape)
        }}
        hitFunc={(ctx, shape) => {
          ctx.beginPath()
          ctx.rect(0, 0, st.w, st.h)
          ctx.closePath()
          ctx.fillStrokeShape(shape)
        }}
      />
      {selected && <Rect width={st.w} height={st.h} stroke="#fff" strokeWidth={2} strokeScaleEnabled={false} shadowColor="#fff" shadowBlur={16} shadowOpacity={0.5} listening={false} />}
      <Text
        width={st.w}
        y={st.h / 2 - Math.min(st.h * 0.12, 1.2)}
        align="center"
        text={s.name}
        fontSize={Math.min(st.h * 0.16, st.w * 0.1, 1.6)}
        fontFamily="Inter Tight"
        fontStyle="bold"
        fill="#ffffff"
        opacity={0.85}
        listening={false}
      />
      <Text
        width={st.w}
        y={st.h / 2 + Math.min(st.h * 0.08, 0.8)}
        align="center"
        text={`${st.pxW} × ${st.pxH} px${locked ? '  ·  MIRROR' : ''}`}
        fontSize={Math.min(st.h * 0.07, st.w * 0.05, 0.6)}
        fontFamily="JetBrains Mono"
        fill="#a3a3a3"
        listening={false}
      />
      {selected && <Text
        y={st.h + 6 / v.scale}
        text={`${fmt(st.w, 2)} × ${fmt(st.h, 2)} m   P${panel.pitch}   ${panel.w}×${panel.h} mm   ${fmt(st.area, 1)} m²`}
        fontSize={11 / v.scale}
        fontFamily="JetBrains Mono"
        fill="#a3a3a3"
        listening={false}
      />}
      {selected && !locked && <AddHandles s={s} w={st.w} h={st.h} />}
    </Group>
  )
}

function AddHandles({ s, w, h }: { s: Screen; w: number; h: number }) {
  const v = useView()
  const { mutate, select } = useStore.getState()
  const r = 11 / v.scale
  const add = (dir: 'top' | 'bottom' | 'left' | 'right') =>
    mutate((p) => {
      const n: Screen = { ...s, id: nanoid(8), name: `SCREEN ${p.screens.length + 1}`, virtual: [], mirrorOf: undefined, image: undefined }
      if (dir === 'left') n.x = s.x - w
      if (dir === 'right') n.x = s.x + w
      if (dir === 'top') n.z = s.z + h
      if (dir === 'bottom') n.z = Math.max(0, s.z - h)
      p.screens.push(n)
      setTimeout(() => select({ kind: 'screen', id: n.id }))
    })
  const pts: [number, number, 'top' | 'bottom' | 'left' | 'right'][] = [
    [w / 2, -r * 2, 'top'],
    [w / 2, h + r * 2 + 18 / v.scale, 'bottom'],
    [-r * 2, h / 2, 'left'],
    [w + r * 2, h / 2, 'right'],
  ]
  return (
    <>
      {pts.map(([x, y, d]) => (
        <Group
          key={d}
          x={x}
          y={y}
          onMouseDown={(e) => {
            e.cancelBubble = true
            add(d)
          }}
          onMouseEnter={(e) => (e.target.getStage()!.container().style.cursor = 'pointer')}
          onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
        >
          <Rect x={-r} y={-r} width={r * 2} height={r * 2} cornerRadius={r} fill="#000" stroke="#fff" strokeWidth={1} strokeScaleEnabled={false} />
          <Text x={-r} y={-r} width={r * 2} height={r * 2} align="center" verticalAlign="middle" text="+" fontSize={r * 1.6} fill="#fff" listening={false} />
        </Group>
      ))}
    </>
  )
}

function LeftPanel({ project, selId }: { project: Project; selId?: string }) {
  const { mutate, select } = useStore.getState()
  const mode = useStore((s) => s.ui.mode)
  const presets: { label: string; sub: string; make: (p: Project) => Partial<Screen> }[] = [
    { label: 'Main 16:9', sub: 'Centre backdrop', make: () => ({ cols: 16, rows: 9, name: 'CENTER' }) },
    { label: 'Side portrait', sub: 'Left wing IMAG', make: (p) => ({ cols: 6, rows: 10, name: 'LEFT', x: p.venue.w / 2 - 14 }) },
    { label: 'Wide banner', sub: 'Header strip', make: () => ({ cols: 24, rows: 3, name: 'BANNER' }) },
    { label: 'Stage front', sub: 'Riser fascia', make: (p) => ({ cols: 20, rows: 1, name: 'FASCIA', mount: 'ground', z: 0, y: (stageBounds(p)?.y ?? 2) + (stageBounds(p)?.l ?? 6) }) },
    { label: 'Curved', sub: 'Concave wall', make: () => ({ cols: 20, rows: 8, name: 'CURVE', shape: 'concave', curveDeg: 4 }) },
  ]
  return (
    <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
      <Section title={`Screens · ${project.screens.length}`}>
        <div className="space-y-1">
          {project.screens.map((s) => {
            const st = screenStats(s, project.customPanels)
            return (
              <button
                key={s.id}
                onClick={() => select({ kind: 'screen', id: s.mirrorOf ?? s.id })}
                className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${selId === s.id ? 'border-white bg-lift' : 'border-transparent hover:bg-raised'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{s.name}</span>
                  {s.mirrorOf && <span className="text-[9px] text-mute">MIRROR</span>}
                </div>
                <div className="mono text-[10px] text-mute">
                  {st.pxW}×{st.pxH} · {fmt(st.w, 1)}×{fmt(st.h, 1)} m · P{st.panel.pitch}
                </div>
              </button>
            )
          })}
        </div>
      </Section>
      <Section title="Add screen">
        <div className="grid grid-cols-2 gap-2">
          {presets.map((pr) => (
            <button
              key={pr.label}
              className="rounded-lg border border-line p-2 text-left hover:border-line-hi hover:bg-raised transition-colors"
              onClick={() =>
                mutate((p) => {
                  const ns = newScreen(p, pr.make(p))
                  if (ns.name === 'CENTER' || ns.name === 'BANNER' || ns.name === 'CURVE' || ns.name === 'FASCIA') {
                    const panel = findPanel(ns.panelId, p.customPanels)
                    ns.x = p.venue.w / 2 - (ns.cols * panel.w) / 2000
                  }
                  p.screens.push(ns)
                  setTimeout(() => select({ kind: 'screen', id: ns.id }))
                })
              }
            >
              <div className="text-xs font-medium">{pr.label}</div>
              <div className="text-[10px] text-mute">{pr.sub}</div>
            </button>
          ))}
        </div>
      </Section>
      {mode === 'simple' ? <SizeHelper /> : <PanelLibrary />}
    </aside>
  )
}

function SizeHelper() {
  const project = useStore((s) => s.project)
  const { mutate, select } = useStore.getState()
  const [dist, setDist] = useState(40)
  const [near, setNear] = useState(4)
  const [outdoor, setOutdoor] = useState(project.venue.w > 35)
  const panel = suggestPitch(near, outdoor)
  const h = Math.min(9, Math.max(2, dist / 6))
  const rows = Math.max(2, Math.round(h / (panel.h / 1000)))
  const cols = Math.round((rows * (panel.h / 1000) * 16) / 9 / (panel.w / 1000))
  return (
    <Section title="Screen size helper">
      <p className="text-[11px] text-mute leading-relaxed">Tell us about your audience and we'll suggest a screen.</p>
      <Num label="Distance to the last row" value={dist} onChange={setDist} unit="m" step={1} min={5} tip="The people furthest from the stage. Screen height should be about 1/6 of this." />
      <Num label="Distance to the front row" value={near} onChange={setNear} unit="m" step={0.5} min={1} tip="Closer viewers need a finer pitch (smaller pixels), or they see dots." />
      <Check label="Outdoor event" checked={outdoor} onChange={setOutdoor} tip="Outdoor panels are brighter and weatherproof." />
      <div className="rounded-lg border border-line bg-black p-3 text-xs space-y-1">
        <div className="text-dim">Suggested</div>
        <div className="mono">
          {panel.model}
          <br />
          {cols} × {rows} panels = {fmt((cols * panel.w) / 1000, 1)} × {fmt((rows * panel.h) / 1000, 1)} m
        </div>
      </div>
      <button
        className="btn btn-primary w-full justify-center"
        onClick={() =>
          mutate((p) => {
            const ns = newScreen(p, { panelId: panel.id, cols, rows, name: 'CENTER' })
            ns.x = p.venue.w / 2 - (cols * panel.w) / 2000
            p.screens.push(ns)
            setTimeout(() => select({ kind: 'screen', id: ns.id }))
          })
        }
      >
        Add this screen
      </button>
    </Section>
  )
}

function PanelLibrary() {
  const project = useStore((s) => s.project)
  const [open, setOpen] = useState(false)
  return (
    <Section
      title="Panel library"
      right={
        <button className="btn h-6 px-2 text-[10px]" onClick={() => setOpen(true)}>
          + My panel
        </button>
      }
    >
      <div className="space-y-1">
        {allPanels(project.customPanels).map((p) => (
          <div key={p.id} className="rounded-lg border border-line px-3 py-2">
            <div className="text-[11px] font-medium flex justify-between">
              <span>{p.model}</span>
              {p.custom && <span className="text-mute">MINE</span>}
            </div>
            <div className="mono text-[10px] text-mute">
              {p.pxW}×{p.pxH}px · {p.weight}kg · {p.maxW}W · {p.viewAngle}°
            </div>
          </div>
        ))}
      </div>
      {open && <CustomPanelModal onClose={() => setOpen(false)} />}
    </Section>
  )
}

function CustomPanelModal({ onClose }: { onClose: () => void }) {
  const { mutate, notify } = useStore.getState()
  const [p, setP] = useState<Panel>({ id: '', brand: 'My brand', model: 'Custom P3.9', pitch: 3.91, w: 500, h: 500, pxW: 128, pxH: 128, weight: 8, maxW: 160, avgW: 55, viewAngle: 160, outdoor: false, custom: true })
  const up = (k: keyof Panel) => (v: number) => setP({ ...p, [k]: v })
  return (
    <Modal title="Add a custom panel" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Txt label="Brand" value={p.brand} onChange={(brand) => setP({ ...p, brand })} />
        <Txt label="Model" value={p.model} onChange={(model) => setP({ ...p, model })} />
        <Num label="Pixel pitch" value={p.pitch} onChange={up('pitch')} unit="mm" step={0.01} />
        <Num label="Viewing angle" value={p.viewAngle} onChange={up('viewAngle')} unit="°" />
        <Num label="Cabinet width" value={p.w} onChange={up('w')} unit="mm" step={1} />
        <Num label="Cabinet height" value={p.h} onChange={up('h')} unit="mm" step={1} />
        <Num label="Pixels wide" value={p.pxW} onChange={up('pxW')} unit="px" int step={1} />
        <Num label="Pixels high" value={p.pxH} onChange={up('pxH')} unit="px" int step={1} />
        <Num label="Weight" value={p.weight} onChange={up('weight')} unit="kg" />
        <Num label="Max power" value={p.maxW} onChange={up('maxW')} unit="W" step={1} />
        <Num label="Average power" value={p.avgW} onChange={up('avgW')} unit="W" step={1} />
        <Check label="Outdoor rated" checked={p.outdoor} onChange={(outdoor) => setP({ ...p, outdoor })} />
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            mutate((pr) => void pr.customPanels.push({ ...p, id: `my-${nanoid(6)}` }))
            notify(`${p.model} added to My panels`)
            onClose()
          }}
        >
          Save panel
        </button>
      </div>
    </Modal>
  )
}

let clipboard: Partial<Screen> | null = null

function ScreenProps({ s }: { s: Screen }) {
  const project = useStore((st) => st.project)
  const mode = useStore((st) => st.ui.mode)
  const { mutate, select, notify } = useStore.getState()
  const [sizeMode, setSizeMode] = useState<'px' | 'm' | 'panels'>('panels')
  const st = screenStats(s, project.customPanels)
  const panel = st.panel
  const up = (patch: Partial<Screen>) =>
    mutate((p) => {
      const t = p.screens.find((x) => x.id === s.id)
      if (t) Object.assign(t, patch)
    })
  const resize = (cols: number, rows: number) => up({ cols: Math.max(1, Math.round(cols)), rows: Math.max(1, Math.round(rows)), virtual: s.virtual.filter((i) => i % s.cols < cols && Math.floor(i / s.cols) < rows).map((i) => Math.floor(i / s.cols) * Math.round(cols) + (i % s.cols)) })
  const mirror = project.screens.find((x) => x.mirrorOf === s.id)
  const pm = portMap(s, panel, project.processor.portPx)
  const cc = circuitsFor(s, panel, project.circuitAmps)
  const file = useRef<HTMLInputElement>(null)

  return (
    <div className="fade-in">
      <Section
        title="Display"
        right={
          <div className="flex gap-1">
            <button className="btn btn-icon h-7 w-7" title="Clone (Ctrl+D)" onClick={() => mutate((p) => void p.screens.push({ ...s, id: nanoid(8), name: `${s.name} COPY`, x: s.x + st.w + 0.5, mirrorOf: undefined }))}>
              <Copy size={13} />
            </button>
            <button className="btn btn-icon h-7 w-7" title="Delete" onClick={() => (mutate((p) => void (p.screens = p.screens.filter((x) => x.id !== s.id && x.mirrorOf !== s.id))), select(null))}>
              <Trash2 size={13} />
            </button>
          </div>
        }
      >
        <Txt label="Display name" value={s.name} onChange={(name) => up({ name: name.toUpperCase() })} />
        <div>
          <div className="text-[11px] text-dim mb-1">Base colour</div>
          <div className="flex gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => up({ color: c })} className={`h-6 w-6 rounded-md border ${s.color === c ? 'border-white glow' : 'border-line'}`} style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Panel specs">
        <Sel
          label="LED panel"
          value={s.panelId}
          onChange={(panelId) => up({ panelId })}
          options={allPanels(project.customPanels).map((p) => ({ value: p.id, label: p.model }))}
          tip="Pitch is the gap between pixels in mm. Smaller = sharper but costlier. Rule of thumb: the closest viewer should be at least the pitch number in metres away."
        />
        <div className="mono text-[10px] text-mute">
          {panel.pxW}×{panel.pxH} px/cabinet · {panel.weight} kg · {panel.maxW} W max · {panel.viewAngle}°
        </div>
      </Section>

      <Section title="Total dimensions">
        <Seg
          value={sizeMode}
          onChange={setSizeMode}
          options={[
            { value: 'px', label: 'Pixels' },
            { value: 'm', label: 'Metres' },
            { value: 'panels', label: 'Panels' },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          {sizeMode === 'panels' && (
            <>
              <Num label="Columns" value={s.cols} onChange={(v) => resize(v, s.rows)} int step={1} min={1} max={200} />
              <Num label="Rows" value={s.rows} onChange={(v) => resize(s.cols, v)} int step={1} min={1} max={100} />
            </>
          )}
          {sizeMode === 'm' && (
            <>
              <Num label="Width" value={st.w} onChange={(v) => resize(v / (panel.w / 1000), s.rows)} unit="m" step={panel.w / 1000} />
              <Num label="Height" value={st.h} onChange={(v) => resize(s.cols, v / (panel.h / 1000))} unit="m" step={panel.h / 1000} />
            </>
          )}
          {sizeMode === 'px' && (
            <>
              <Num label="Width" value={st.pxW} onChange={(v) => resize(v / panel.pxW, s.rows)} unit="px" step={panel.pxW} />
              <Num label="Height" value={st.pxH} onChange={(v) => resize(s.cols, v / panel.pxH)} unit="px" step={panel.pxH} />
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Resolution" value={`${st.pxW}×${st.pxH}`} />
          <Stat label="Area" value={`${fmt(st.area, 2)} m²`} sub={`${fmt(st.w, 2)} × ${fmt(st.h, 2)} m`} />
          <Stat label="Cabinets" value={st.cabinets} sub={s.virtual.length ? `${s.virtual.length} empty` : undefined} />
          <Stat label="Weight" value={`${fmt(st.weight, 0)} kg`} />
          <Stat label="Power max" value={`${fmt(st.maxW / 1000, 2)} kW`} sub={`${fmt(st.maxW / VOLTS, 1)} A @${VOLTS}V`} />
          <Stat label="Power avg" value={`${fmt(st.avgW / 1000, 2)} kW`} />
        </div>
      </Section>

      <Section title="Position & shape">
        <div className="grid grid-cols-2 gap-2">
          <Num label="Left edge (X)" value={s.x} onChange={(x) => up({ x })} unit="m" />
          <Num label="Bottom height" value={s.z} onChange={(z) => up({ z: Math.max(0, z) })} unit="m" tip="Height of the screen's bottom edge above the ground." />
          <Num label="Depth (Y)" value={s.y} onChange={(y) => up({ y })} unit="m" tip="Distance from the back of the venue/stage, as seen in the top view." />
          <Num label="Rotation" value={s.rotation} onChange={(rotation) => up({ rotation })} unit="°" step={5} />
        </div>
        <Sel
          label="Mounting"
          value={s.mount}
          onChange={(mount) => up({ mount })}
          options={[
            { value: 'flown', label: 'Flown from truss' },
            { value: 'ground', label: 'Ground-stacked' },
          ]}
          tip="Flown screens hang from truss and count towards rigging loads."
        />
        <Seg
          value={s.shape}
          onChange={(shape) => up({ shape, curveDeg: shape === 'flat' ? 0 : s.curveDeg || 5 })}
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'concave', label: 'Concave' },
            { value: 'convex', label: 'Convex' },
          ]}
        />
        {s.shape !== 'flat' && <Num label="Angle between columns" value={s.curveDeg} onChange={(curveDeg) => up({ curveDeg })} unit="°" step={0.5} min={0} max={15} tip="Curved LED cabinets lock at fixed angles, usually 0–10° each." />}
      </Section>

      <Section title="Symmetry & content">
        {mirror ? (
          <div className="flex items-center justify-between text-xs">
            <span className="text-dim">Mirrored by {mirror.name}</span>
            <button className="btn h-7" onClick={() => mutate((p) => void (p.screens.find((x) => x.id === mirror.id)!.mirrorOf = undefined))}>
              <Link2Off size={12} /> Unlink
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-mute">Use Live symmetry in the toolbar to build a linked mirror on the other side.</p>
        )}
        <div className="flex gap-2">
          <button
            className="btn flex-1 justify-center"
            onClick={() => {
              clipboard = { panelId: s.panelId, cols: s.cols, rows: s.rows, color: s.color, shape: s.shape, curveDeg: s.curveDeg, z: s.z, mount: s.mount }
              notify('Properties copied')
            }}
          >
            Copy props
          </button>
          <button className="btn flex-1 justify-center" disabled={!clipboard} onClick={() => clipboard && up({ ...clipboard, virtual: [] })}>
            Paste props
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const r = new FileReader()
            r.onload = () => up({ image: String(r.result) })
            r.readAsDataURL(f)
          }}
        />
        <div className="flex gap-2">
          <button className="btn flex-1 justify-center" onClick={() => file.current?.click()}>
            <ImageIcon size={13} /> {s.image ? 'Replace content' : 'Add content image'}
          </button>
          {s.image && (
            <button className="btn" onClick={() => up({ image: undefined })}>
              Remove
            </button>
          )}
        </div>
      </Section>

      {mode === 'pro' && (
        <>
          <Section title="Data wiring">
            <Num label="Pixels per sending-card port" value={project.processor.portPx} onChange={(portPx) => mutate((p) => void (p.processor.portPx = portPx))} unit="px" step={1} tip="A 1 Gb port typically drives about 650,000 pixels (8-bit)." />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Ports" value={pm.ports.length} />
              <Stat label="Cabinets / port" value={pm.perPort} />
            </div>
            <div className="text-[11px] text-mute">Serpentine path from bottom-left. Turn on the Data overlay to see it.</div>
          </Section>
          <Section title="Power">
            <Seg
              value={String(project.circuitAmps) as '16' | '32'}
              onChange={(v) => mutate((p) => void (p.circuitAmps = Number(v) as 16 | 32))}
              options={[
                { value: '16', label: '16 A lines' },
                { value: '32', label: '32 A lines' },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Circuits" value={cc.circuits.length} />
              <Stat label="Cabinets / line" value={cc.perCircuit} sub="80% derated" />
            </div>
            <PhaseTable />
          </Section>
        </>
      )}
    </div>
  )
}

export function PhaseTable() {
  const project = useStore((s) => s.project)
  const pp = powerPlan(project)
  const max = Math.max(1, ...Object.values(pp.amps))
  return (
    <div className="space-y-1.5">
      {(Object.keys(pp.amps) as (keyof typeof pp.amps)[]).map((k) => (
        <div key={k} className="flex items-center gap-2 text-[11px]">
          <span className="mono w-6 text-dim">{k}</span>
          <div className="flex-1 h-1.5 rounded bg-lift overflow-hidden">
            <div className="h-full bg-white" style={{ width: `${(pp.amps[k] / max) * 100}%` }} />
          </div>
          <span className="mono w-14 text-right">{fmt(pp.amps[k], 1)} A</span>
        </div>
      ))}
      <div className="text-[10px] text-mute">All screens, all circuits at max draw. Imbalance {Math.round(pp.imbalance * 100)}%.</div>
    </div>
  )
}
