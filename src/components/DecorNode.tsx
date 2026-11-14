import { useEffect, useRef } from 'react'
import { Circle, Group, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useStore } from '../store'
import type { Decor } from '../types'
import { DECOR } from '../lib/decor'
import { useSnap, useView } from './PlanCanvas'

// A decor, effect, branding or model item in the top view. x, y is its centre.
export function DecorNode({ d, editable }: { d: Decor; editable: boolean }) {
  const v = useView()
  const sel = useStore((s) => s.ui.selection)
  const tool = useStore((s) => s.ui.tool)
  const { mutate, select } = useStore.getState()
  const snap = useSnap()
  const ref = useRef<Konva.Group>(null)
  const tr = useRef<Konva.Transformer>(null)
  const selected = sel?.kind === 'decor' && sel.id === d.id
  const info = DECOR[d.kind]
  useEffect(() => {
    if (selected && editable && tr.current && ref.current) {
      tr.current.nodes([ref.current])
      tr.current.getLayer()?.batchDraw()
    }
  }, [selected, editable])
  const w = Math.max(0.2, d.w)
  const h = Math.max(0.2, d.d)
  const fs = Math.min(11 / v.scale, Math.max(w, 0.6) * 0.3, 0.8)
  return (
    <>
      <Group
        ref={ref}
        x={d.x}
        y={d.y}
        rotation={d.rotation}
        opacity={editable ? 1 : 0.55}
        listening={editable}
        draggable={editable && tool === 'select'}
        onPointerDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'decor', id: d.id })
        }}
        onDragEnd={(e) => {
          const nx = snap(e.target.x(), 0.1)
          const ny = snap(e.target.y(), 0.1)
          e.target.position({ x: nx, y: ny })
          mutate((p) => {
            const t = p.decor!.find((x) => x.id === d.id)!
            t.x = nx
            t.y = ny
          })
        }}
        onTransformEnd={(e) => {
          const n = e.target
          const sx = n.scaleX()
          const sy = n.scaleY()
          n.scale({ x: 1, y: 1 })
          mutate((p) => {
            const t = p.decor!.find((x) => x.id === d.id)!
            t.w = Math.max(0.1, Math.round(t.w * sx * 100) / 100)
            t.d = Math.max(0.05, Math.round(t.d * sy * 100) / 100)
            t.x = snap(n.x(), 0.1)
            t.y = snap(n.y(), 0.1)
            t.rotation = Math.round(n.rotation())
          })
        }}
      >
        {info.effect ? (
          <>
            <Circle radius={Math.max(w, h) / 2 + 0.6} stroke="#ffffff" opacity={0.25} dash={[3, 3]} strokeWidth={1} strokeScaleEnabled={false} />
            <Circle radius={Math.max(w, h) / 2} fill="#ffffff" stroke={selected ? '#fff' : '#bbb'} strokeWidth={selected ? 2 : 1} strokeScaleEnabled={false} />
          </>
        ) : (
          <Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={info.artwork ? '#ffffff30' : d.kind === 'model' ? '#ffffff12' : `${d.color}55`} stroke={selected && editable ? '#fff' : '#9a9a9a'} strokeWidth={selected && editable ? 2 : 1} dash={d.kind === 'model' ? [5, 3] : undefined} strokeScaleEnabled={false} />
        )}
        {info.artwork && <Rect x={-w / 2} y={h / 2 - 0.02} width={w} height={0.06} fill="#fff" />}
      </Group>
      <Text x={d.x - 3} y={d.y + Math.max(w, h) / 2 + 0.15} width={6} align="center" text={(d.sponsor || d.label).toUpperCase()} fontSize={fs} fontFamily="Inter" fontStyle="600" fill="#a3a3a3" listening={false} />
      {selected && editable && <Transformer ref={tr} rotateEnabled keepRatio={false} borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" anchorSize={8} rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]} />}
    </>
  )
}
