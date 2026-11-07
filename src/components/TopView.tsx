import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Arc, Circle, Group, Image as KImage, Line, Rect, Text, Transformer, Wedge } from 'react-konva'
import type Konva from 'konva'
import { useStore } from '../store'
import type { GroundItem, Project, Table } from '../types'
import { CHAIR, isSeated, seatPositions } from '../lib/seating'
import { rigging, screenColumns, screenStats, TRUSS_INFO } from '../lib/calc'
import { useSnap, useView } from './PlanCanvas'

export const GROUND_STYLE: Record<GroundItem['kind'], { fill: string; stroke: string; name: string; tip: string }> = {
  crowd: { fill: '#ffffff10', stroke: '#5a5a5a', name: 'Standing crowd', tip: '2 people per m² (comfortable concert density).' },
  seating: { fill: '#ffffff0c', stroke: '#5a5a5a', name: 'Seating block', tip: 'About 1 seat per 0.6 m² including aisles.' },
  vip: { fill: '#ffffff18', stroke: '#8a8a8a', name: 'VIP / fan pit', tip: '1 person per m².' },
  foh: { fill: '#ffffff22', stroke: '#ffffff', name: 'FOH desk', tip: 'Front of house: where sound and lighting are mixed. Usually 25–35 m from the stage, centred.' },
  barricade: { fill: '#ffffff40', stroke: '#ffffff', name: 'Barricade', tip: 'Crowd barrier (mojo) in front of the stage.' },
  entry: { fill: '#ffffff30', stroke: '#d4d4d4', name: 'Entry gate', tip: 'Main entry.' },
  exit: { fill: '#ffffff', stroke: '#ffffff', name: 'Emergency exit', tip: 'Required: keep it clear and lit.' },
  delay: { fill: '#ffffff22', stroke: '#a3a3a3', name: 'Delay tower', tip: 'Extra speakers far from the stage so the back can hear.' },
  camera: { fill: '#ffffff18', stroke: '#a3a3a3', name: 'Camera riser', tip: 'Platform for video cameras.' },
  generator: { fill: '#ffffff14', stroke: '#8a8a8a', name: 'Generator', tip: 'Power source. Keep it away from the crowd.' },
  greenroom: { fill: '#ffffff10', stroke: '#6b6b6b', name: 'Green room', tip: 'Artist waiting area backstage.' },
  washroom: { fill: '#ffffff10', stroke: '#6b6b6b', name: 'Washrooms', tip: 'Toilets.' },
  food: { fill: '#ffffff10', stroke: '#6b6b6b', name: 'Food court', tip: 'Food and beverage stalls.' },
  label: { fill: '#00000000', stroke: '#3f3f3f', name: 'Label', tip: 'Free text note.' },
}

type Edit = 'ground' | 'stage' | 'truss' | 'seating'

export function TopView({ edit, sightlines = false, extra }: { edit: Edit; sightlines?: boolean; extra?: ReactNode }) {
  const p = useStore((s) => s.project)
  const v = useView()
  return (
    <>
      <VenueImage project={p} />
      <Rect x={0} y={0} width={p.venue.w} height={p.venue.l} stroke="#ffffff" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
      <Text x={0} y={-18 / v.scale} text={`VENUE ${p.venue.w} × ${p.venue.l} m`} fontSize={11 / v.scale} fill="#6b6b6b" fontFamily="JetBrains Mono" listening={false} />
      <Line points={[p.venue.w / 2, 0, p.venue.w / 2, p.venue.l]} stroke="#fff" opacity={0.12} dash={[6, 6]} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
      {p.ground.map((g) => (
        <GroundNode key={g.id} g={g} editable={edit === 'ground'} />
      ))}
      {p.tables.map((t) => (
        <TableNode key={t.id} t={t} editable={edit === 'seating'} dim={edit !== 'seating'} />
      ))}
      {p.decks.map((d) => (
        <DeckNode key={d.id} id={d.id} editable={edit === 'stage'} dim={edit === 'ground'} />
      ))}
      {sightlines && <Sightlines project={p} />}
      <ScreensTop project={p} />
      {p.truss.map((t) => (
        <TrussNode key={t.id} id={t.id} editable={edit === 'truss'} dim={edit !== 'truss'} />
      ))}
      {edit === 'truss' && <RigOverlay project={p} />}
      {p.fixtures.map((f) => (
        <Group key={f.id} x={f.x} y={f.y} listening={false} opacity={edit === 'truss' ? 1 : 0.5}>
          {f.kind === 'sub' ? (
            <Rect x={-0.35} y={-0.3} width={0.7} height={0.6} stroke="#a3a3a3" strokeWidth={1} strokeScaleEnabled={false} />
          ) : f.kind === 'line-array' ? (
            <Rect x={-0.5} y={-0.25} width={1} height={0.5} fill="#ffffff22" stroke="#d4d4d4" strokeWidth={1} strokeScaleEnabled={false} />
          ) : (
            <Circle radius={0.18} fill="#000" stroke="#fff" strokeWidth={1} strokeScaleEnabled={false} />
          )}
        </Group>
      ))}
      {extra}
    </>
  )
}

function VenueImage({ project }: { project: Project }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!project.venue.image) return setImg(null)
    const i = new window.Image()
    i.onload = () => setImg(i)
    i.src = project.venue.image
  }, [project.venue.image])
  if (!img) return null
  const w = project.venue.imageScale ?? project.venue.w
  return <KImage image={img} x={0} y={0} width={w} height={(w * img.height) / img.width} opacity={0.35} listening={false} />
}

function GroundNode({ g, editable }: { g: GroundItem; editable: boolean }) {
  const v = useView()
  const sel = useStore((s) => s.ui.selection)
  const tool = useStore((s) => s.ui.tool)
  const { mutate, select } = useStore.getState()
  const snap = useSnap()
  const ref = useRef<Konva.Rect>(null)
  const tr = useRef<Konva.Transformer>(null)
  const selected = sel?.kind === 'ground' && sel.id === g.id
  const st = GROUND_STYLE[g.kind]
  useEffect(() => {
    if (selected && editable && tr.current && ref.current) {
      tr.current.nodes([ref.current])
      tr.current.getLayer()?.batchDraw()
    }
  }, [selected, editable])
  const fs = Math.min(13 / v.scale, g.h * 0.4, 1.2)
  return (
    <>
      <Rect
        ref={ref}
        x={g.x + g.w / 2}
        y={g.y + g.h / 2}
        offsetX={g.w / 2}
        offsetY={g.h / 2}
        width={g.w}
        height={g.h}
        rotation={g.rotation}
        fill={st.fill}
        stroke={selected && editable ? '#fff' : st.stroke}
        strokeWidth={selected && editable ? 2 : 1}
        dash={g.kind === 'crowd' || g.kind === 'seating' ? [4, 4] : undefined}
        strokeScaleEnabled={false}
        listening={editable}
        draggable={editable && tool === 'select'}
        onMouseDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'ground', id: g.id })
        }}
        onDragEnd={(e) => {
          const nx = snap(e.target.x() - g.w / 2)
          const ny = snap(e.target.y() - g.h / 2)
          e.target.position({ x: nx + g.w / 2, y: ny + g.h / 2 })
          mutate((p) => {
            const t = p.ground.find((x) => x.id === g.id)!
            t.x = nx
            t.y = ny
          })
        }}
        onTransformEnd={(e) => {
          const n = e.target
          const w = Math.max(0.5, snap(g.w * n.scaleX()))
          const h = Math.max(0.3, snap(g.h * n.scaleY()))
          n.scale({ x: 1, y: 1 })
          mutate((p) => {
            const t = p.ground.find((x) => x.id === g.id)!
            t.w = w
            t.h = h
            t.x = snap(n.x() - w / 2)
            t.y = snap(n.y() - h / 2)
            t.rotation = Math.round(n.rotation())
          })
        }}
      />
      <Text
        x={g.x}
        y={g.y + g.h / 2 - fs / 2}
        width={g.w}
        align="center"
        text={g.label.toUpperCase()}
        fontSize={fs}
        fontFamily="Inter"
        fontStyle="600"
        fill={g.kind === 'exit' ? '#000' : '#a3a3a3'}
        listening={false}
        rotation={0}
      />
      {selected && editable && <Transformer ref={tr} rotateEnabled keepRatio={false} borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" anchorSize={8} rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} />}
    </>
  )
}

function DeckNode({ id, editable, dim }: { id: string; editable: boolean; dim: boolean }) {
  const d = useStore((s) => s.project.decks.find((x) => x.id === id))!
  const sel = useStore((s) => s.ui.selection)
  const tool = useStore((s) => s.ui.tool)
  const v = useView()
  const { mutate, select } = useStore.getState()
  const snap = useSnap()
  const selected = sel?.kind === 'deck' && sel.id === id
  const shade = Math.round(20 + Math.min(1, d.h / 2.5) * 40)
  return (
    <Group>
      <Rect
        x={d.x}
        y={d.y}
        width={d.w}
        height={d.l}
        fill={`rgb(${shade},${shade},${shade})`}
        opacity={dim ? 0.8 : 1}
        stroke={selected ? '#fff' : '#3f3f3f'}
        strokeWidth={selected ? 2 : 1}
        strokeScaleEnabled={false}
        listening={editable}
        draggable={editable && tool === 'select'}
        onMouseDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'deck', id })
        }}
        onDragEnd={(e) => {
          const nx = snap(e.target.x())
          const ny = snap(e.target.y())
          e.target.position({ x: nx, y: ny })
          mutate((p) => {
            const t = p.decks.find((x) => x.id === id)!
            t.x = nx
            t.y = ny
          })
        }}
      />
      {editable && v.scale > 18 && <Text x={d.x} y={d.y + d.l / 2 - 5 / v.scale} width={d.w} align="center" text={`${d.h}`} fontSize={10 / v.scale} fill="#6b6b6b" fontFamily="JetBrains Mono" listening={false} />}
    </Group>
  )
}

function ScreensTop({ project }: { project: Project }) {
  const { select, setUI } = useStore.getState()
  return (
    <>
      {project.screens.map((s) => {
        const st = screenStats(s, project.customPanels)
        const cols = screenColumns(s, st.panel)
        const cw = st.panel.w / 1000
        const pts: number[] = []
        cols.forEach((c, i) => {
          const dx = (Math.cos(c.angle) * cw) / 2
          const dy = (Math.sin(c.angle) * cw) / 2
          if (i === 0) pts.push(c.x - dx, c.y - dy)
          pts.push(c.x + dx, c.y + dy)
        })
        return (
          <Group
            key={s.id}
            onDblClick={() => {
              select({ kind: 'screen', id: s.mirrorOf ?? s.id })
              setUI({ workspace: 'led' })
            }}
          >
            <Line points={pts} stroke="#fff" strokeWidth={4} strokeScaleEnabled={false} lineCap="round" hitStrokeWidth={14} />
            <Text x={pts[0]} y={pts[1] - 0.9} text={s.name} fontSize={0.6} fill="#fff" fontFamily="Inter Tight" fontStyle="bold" listening={false} />
          </Group>
        )
      })}
    </>
  )
}

function Sightlines({ project }: { project: Project }) {
  return (
    <Group listening={false} clipX={0} clipY={0} clipWidth={project.venue.w} clipHeight={project.venue.l}>
      {project.screens.map((s) => {
        const st = screenStats(s, project.customPanels)
        const cols = screenColumns(s, st.panel)
        const mid = cols[Math.floor(cols.length / 2)]
        const facing = (mid.angle * 180) / Math.PI + 90
        const half = st.panel.viewAngle / 2
        const R = Math.hypot(project.venue.w, project.venue.l)
        const minD = st.panel.pitch
        const optD = st.panel.pitch * 3
        return (
          <Group key={s.id} x={mid.x} y={mid.y}>
            <Wedge radius={R} angle={half * 2} rotation={facing - half} fill="#ffffff" opacity={0.025} />
            <Arc innerRadius={minD} outerRadius={minD} angle={180} rotation={facing - 90} stroke="#fff" opacity={0.5} strokeWidth={1} dash={[3, 3]} strokeScaleEnabled={false} />
            <Arc innerRadius={optD} outerRadius={optD} angle={180} rotation={facing - 90} stroke="#fff" opacity={0.3} strokeWidth={1} strokeScaleEnabled={false} />
            <Text x={0.2} y={minD + 0.1} text={`min ${minD} m`} fontSize={0.45} fill="#a3a3a3" fontFamily="JetBrains Mono" />
            <Text x={0.2} y={optD + 0.1} text={`best from ${optD.toFixed(0)} m`} fontSize={0.45} fill="#6b6b6b" fontFamily="JetBrains Mono" />
          </Group>
        )
      })}
    </Group>
  )
}

function TrussNode({ id, editable, dim }: { id: string; editable: boolean; dim: boolean }) {
  const t = useStore((s) => s.project.truss.find((x) => x.id === id))!
  const sel = useStore((s) => s.ui.selection)
  const tool = useStore((s) => s.ui.tool)
  const { mutate, select } = useStore.getState()
  const snap = useSnap()
  const v = useView()
  const selected = sel?.kind === 'truss' && sel.id === id
  const size = TRUSS_INFO[t.type].size
  const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
  const ang = Math.atan2(t.y2 - t.y1, t.x2 - t.x1)
  // Lattice: zig-zag across the chord width
  const zig: number[] = []
  const n = Math.max(1, Math.round(len / size))
  for (let i = 0; i <= n; i++) zig.push((i * len) / n, i % 2 === 0 ? -size / 2 : size / 2)
  const moveEnd = (end: 1 | 2, x: number, y: number) =>
    mutate((p) => {
      const tt = p.truss.find((q) => q.id === id)!
      if (end === 1) {
        tt.x1 = snap(x)
        tt.y1 = snap(y)
      } else {
        tt.x2 = snap(x)
        tt.y2 = snap(y)
      }
    })
  return (
    <Group opacity={dim ? 0.55 : 1}>
      <Group x={t.x1} y={t.y1} rotation={(ang * 180) / Math.PI}>
        <Rect
          x={0}
          y={-size / 2}
          width={len}
          height={size}
          stroke={selected ? '#fff' : '#a3a3a3'}
          strokeWidth={selected ? 2 : 1}
          strokeScaleEnabled={false}
          fill="#000000aa"
          hitStrokeWidth={12}
          listening={editable}
          onMouseDown={(e) => {
            if (tool !== 'select') return
            e.cancelBubble = true
            select({ kind: 'truss', id })
          }}
        />
        <Line points={zig} stroke={selected ? '#fff' : '#6b6b6b'} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
      </Group>
      {t.legs &&
        [
          [t.x1, t.y1],
          [t.x2, t.y2],
        ].map(([x, y], i) => <Rect key={i} x={x - size} y={y - size} width={size * 2} height={size * 2} stroke="#fff" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)}
      {selected && editable && (
        <>
          {[1, 2].map((end) => (
            <Circle
              key={end}
              x={end === 1 ? t.x1 : t.x2}
              y={end === 1 ? t.y1 : t.y2}
              radius={6 / v.scale}
              fill="#000"
              stroke="#fff"
              strokeWidth={1.5}
              strokeScaleEnabled={false}
              draggable
              onMouseDown={(e) => (e.cancelBubble = true)}
              onDragEnd={(e) => moveEnd(end as 1 | 2, e.target.x(), e.target.y())}
            />
          ))}
          <Text x={(t.x1 + t.x2) / 2} y={(t.y1 + t.y2) / 2 + size} text={`${len.toFixed(1)} m`} fontSize={11 / v.scale} fill="#fff" fontFamily="JetBrains Mono" listening={false} />
        </>
      )}
    </Group>
  )
}

function RigOverlay({ project }: { project: Project }) {
  const v = useView()
  const sel = useStore((s) => s.ui.selection)
  const { select, mutate } = useStore.getState()
  const snap = useSnap()
  const rig = rigging(project)
  return (
    <>
      {rig.supports.map((s) => {
        const hoist = project.hoists.find((h) => h.id === s.id)
        const over = s.capacity === 0 ? s.kg > 0 : s.kg > s.capacity
        const selected = sel?.kind === 'hoist' && sel.id === s.id
        return (
          <Group
            key={s.id}
            x={s.x}
            y={s.y}
            draggable={!!hoist}
            onMouseDown={(e) => {
              if (!hoist) return
              e.cancelBubble = true
              select({ kind: 'hoist', id: s.id })
            }}
            onDragEnd={(e) =>
              mutate((p) => {
                const h = p.hoists.find((x) => x.id === s.id)!
                h.x = snap(e.target.x(), 0.25)
                h.y = snap(e.target.y(), 0.25)
              })
            }
          >
            {hoist ? (
              <Rect x={-7 / v.scale} y={-7 / v.scale} width={14 / v.scale} height={14 / v.scale} rotation={45} fill={over ? '#000' : '#fff'} stroke={selected ? '#fff' : over ? '#c86a5a' : '#000'} strokeWidth={2} strokeScaleEnabled={false} />
            ) : null}
            <Group listening={false} y={-24 / v.scale}>
              <Rect x={-30 / v.scale} y={-8 / v.scale} width={60 / v.scale} height={16 / v.scale} cornerRadius={4 / v.scale} fill={over ? '#c86a5a' : '#000'} stroke="#3f3f3f" strokeWidth={1} strokeScaleEnabled={false} />
              <Text x={-30 / v.scale} y={-5 / v.scale} width={60 / v.scale} align="center" text={`${Math.round(s.kg)} kg`} fontSize={10 / v.scale} fill="#fff" fontFamily="JetBrains Mono" />
            </Group>
          </Group>
        )
      })}
    </>
  )
}

const TABLE_FILL: Partial<Record<Table['kind'], string>> = { dance: '#ffffff14', buffet: '#ffffff26', bar: '#ffffff26', lounge: '#ffffff18' }

function TableNode({ t, editable, dim }: { t: Table; editable: boolean; dim: boolean }) {
  const v = useView()
  const sel = useStore((s) => s.ui.selection)
  const tool = useStore((s) => s.ui.tool)
  const taken = useStore((s) => s.project.guests.filter((g) => g.tableId === t.id).length)
  const { mutate, select } = useStore.getState()
  const snap = useSnap()
  const ref = useRef<Konva.Group>(null)
  const tr = useRef<Konva.Transformer>(null)
  const selected = sel?.kind === 'table' && sel.id === t.id
  useEffect(() => {
    if (selected && editable && tr.current && ref.current) {
      tr.current.nodes([ref.current])
      tr.current.getLayer()?.batchDraw()
    }
  }, [selected, editable])
  const round = t.kind === 'round' || t.kind === 'cocktail'
  // Seats in the table's own frame, so the group can rotate as one piece.
  const seats = seatPositions({ ...t, x: 0, y: 0, rotation: 0 })
  const stroke = selected && editable ? '#fff' : '#8a8a8a'
  const fs = Math.min(Math.max(t.l, 0.5) * 0.45, 12 / v.scale, 0.5)
  const showSeats = !dim || v.scale > 6
  return (
    <>
      <Group
        ref={ref}
        x={t.x}
        y={t.y}
        rotation={t.rotation}
        opacity={dim ? 0.55 : 1}
        listening={editable}
        draggable={editable && tool === 'select'}
        onMouseDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'table', id: t.id })
        }}
        onDragEnd={(e) => {
          const nx = snap(e.target.x(), 0.25)
          const ny = snap(e.target.y(), 0.25)
          e.target.position({ x: nx, y: ny })
          mutate((p) => {
            const x = p.tables.find((q) => q.id === t.id)!
            x.x = nx
            x.y = ny
          })
        }}
        onTransformEnd={(e) => {
          const rot = Math.round(e.target.rotation())
          e.target.scale({ x: 1, y: 1 })
          mutate((p) => void (p.tables.find((q) => q.id === t.id)!.rotation = ((rot % 360) + 360) % 360))
        }}
      >
        {showSeats &&
          isSeated(t.kind) &&
          t.kind !== 'lounge' &&
          seats.map((s, i) => (
            <Rect
              key={i}
              x={s.x}
              y={s.y}
              width={CHAIR}
              height={CHAIR}
              offsetX={CHAIR / 2}
              offsetY={CHAIR / 2}
              rotation={(s.angle * 180) / Math.PI}
              cornerRadius={0.06}
              fill={i < taken ? '#d4d4d4' : '#000'}
              stroke="#6b6b6b"
              strokeWidth={1}
              strokeScaleEnabled={false}
            />
          ))}
        {t.kind === 'row' ? null : round ? (
          <Circle radius={t.w / 2} fill={t.kind === 'cocktail' ? '#ffffff20' : '#1c1c1c'} stroke={stroke} strokeWidth={selected ? 2 : 1} strokeScaleEnabled={false} />
        ) : (
          <Rect x={-t.w / 2} y={-t.l / 2} width={t.w} height={t.l} cornerRadius={t.kind === 'lounge' ? 0.3 : 0.04} fill={TABLE_FILL[t.kind] ?? '#1c1c1c'} stroke={stroke} strokeWidth={selected ? 2 : 1} dash={t.kind === 'dance' ? [4, 4] : undefined} strokeScaleEnabled={false} />
        )}
        {t.kind === 'row' && <Rect x={-t.w / 2} y={-CHAIR / 2} width={t.w} height={CHAIR} stroke={selected && editable ? '#fff' : '#00000000'} strokeWidth={1} strokeScaleEnabled={false} />}
        {t.kind !== 'row' && (
          <Text x={-t.w / 2} y={-fs / 2} width={t.w} align="center" text={t.label} fontSize={fs} fontFamily="Inter" fontStyle="600" fill="#d4d4d4" rotation={0} listening={false} />
        )}
      </Group>
      {selected && editable && <Transformer ref={tr} resizeEnabled={false} rotateEnabled borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} rotationSnapTolerance={8} />}
    </>
  )
}
