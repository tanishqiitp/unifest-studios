import { useEffect, useMemo, useRef, useState } from 'react'
import { Arc, Circle, Group, Image as KImage, Line, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { nanoid } from 'nanoid'
import { Copy, FlipHorizontal2, ImageIcon, Layers, Link2Off, Palette, Trash2, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import type { SetKind, SetPiece, Skin } from '../types'
import { PlanCanvas, useView } from '../components/PlanCanvas'
import { outlinePoints } from '../lib/setpieces'
import { applyTheme, buildKit, hasOpening, KITS, newPiece, SET_KINDS, setLedArea, setLine, SKINS, THEMES } from '../lib/setpieces'
import { readImage } from './Decor'
import { Check, Num, Section, Sel, Stat, Txt } from '../components/ui'
import { fmt } from '../lib/calc'

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
const fillOf = (s: Skin, color: string) => (s === 'paint' || s === 'fabric' || s === 'print' ? color : SKIN_FILL[s])

// Front view: x across the venue, height up. Konva's y runs down, so the view uses y = -height.
export function SetDesignWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select, notify } = useStore.getState()
  const set = project.set ?? []
  const piece = sel?.kind === 'set' ? set.find((p) => p.id === sel.id) : undefined
  const L = setLine(project)
  const maxH = Math.max(14, ...set.map((s) => s.z + s.h + 2))
  const span = Math.max(L.w + 24, ...set.map((s) => Math.abs(s.x - L.cx) * 2 + s.w + 4))

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

      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas bounds={{ x: L.cx - span / 2, y: -maxH, w: span, h: maxH + 2 }} grid={{ x: L.cx - span / 2, y: -maxH, w: span, h: maxH }} onBackground={() => select(null)}>
          <FrontContext />
          {[...set]
            .sort((a, b) => a.y - b.y)
            .map((s) => (
              <PieceNode key={s.id} s={s} />
            ))}
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Front view, as the audience sees it · drag to move · corners to resize · pieces snap to each other · mirrored pieces follow their twin</div>
      </div>

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
            <p className="text-[11px] text-mute leading-relaxed">Pick a kit or add blocks on the left. Click a piece to change its size, skin, lights or artwork. Open the 3D view to walk around it and press Drop to fire the effects.</p>
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

// Ground line, stage decks and existing LED screens in the front view, for reference.
function FrontContext() {
  const p = useStore((s) => s.project)
  const v = useView()
  const L = setLine(p)
  return (
    <Group listening={false}>
      <Line points={[L.cx - 200, 0, L.cx + 200, 0]} stroke="#ffffff" opacity={0.5} strokeWidth={1.5} strokeScaleEnabled={false} />
      <Text x={L.cx - 100} y={6 / v.scale} text="GROUND" fontSize={10 / v.scale} fill="#6b6b6b" fontFamily="JetBrains Mono" />
      {p.decks.length > 0 && <Rect x={L.cx - L.w / 2} y={-L.deckH} width={L.w} height={L.deckH} fill="#ffffff10" stroke="#ffffff55" strokeWidth={1} strokeScaleEnabled={false} />}
      {p.decks.length > 0 && <Text x={L.cx - L.w / 2} y={-L.deckH + 0.1} width={L.w} align="center" text="STAGE" fontSize={10 / v.scale} fill="#6b6b6b" fontFamily="JetBrains Mono" />}
      {/* Person for scale */}
      <Group x={L.cx + L.w / 2 + 1} y={0}>
        <Circle y={-1.6} radius={0.13} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[0, -1.47, 0, -0.85, -0.2, 0, 0, -0.85, 0.2, 0]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
        <Line points={[-0.3, -1.2, 0, -1.3, 0.3, -1.2]} stroke="#777" strokeWidth={1} strokeScaleEnabled={false} />
      </Group>
      {/* Height marks */}
      {Array.from({ length: 8 }, (_, i) => (i + 1) * 2.5).map((h) => (
        <Text key={h} x={L.cx - 200} y={-h - 5 / v.scale} text={`${h} m`} fontSize={9 / v.scale} fill="#3f3f3f" fontFamily="JetBrains Mono" />
      ))}
    </Group>
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

// Snap an edge or centre to nearby pieces' edges/centres, else to a 0.25 m grid.
function snapTo(v: number, half: number, targets: number[], tol: number) {
  let best = Math.round(v * 4) / 4
  let d = Infinity
  for (const t of targets)
    for (const off of [-half, 0, half]) {
      const dd = Math.abs(v + off - t)
      if (dd < tol && dd < d) {
        d = dd
        best = t - off
      }
    }
  return best
}

function PieceNode({ s }: { s: SetPiece }) {
  const v = useView()
  const sel = useStore((st) => st.ui.selection)
  const set = useStore((st) => st.project.set ?? [])
  const deckH = useStore((st) => setLine(st.project).deckH)
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
  }, [selected, locked])
  const others = set.filter((o) => o.id !== s.id && o.mirrorOf !== s.id)
  const xs = others.flatMap((o) => [o.x - o.w / 2, o.x, o.x + o.w / 2])
  const zs = [0, deckH, ...others.flatMap((o) => [o.z, o.z + o.h])]
  const tol = 10 / v.scale
  const fill = fillOf(s.skin, s.color)
  const stroke = selected ? '#ffffff' : s.outline ? s.outline.color : '#ffffff40'
  const sw = selected ? 2 : s.outline ? 2 : 1
  const b = s.border ?? 0.6
  const innerFill = s.inner === 'open' || !s.inner ? undefined : fillOf(s.inner as Skin, s.color)

  return (
    <>
      <Group
        ref={ref}
        x={s.x - s.w / 2}
        y={-(s.z + s.h)}
        opacity={(locked ? 0.85 : 1) * (s.y - setLine(useStore.getState().project).y > 6 ? 0.4 : 1)}
        draggable={!locked}
        onPointerDown={(e) => {
          e.cancelBubble = true
          select({ kind: 'set', id: s.mirrorOf && !selected ? s.mirrorOf : s.id })
        }}
        onDragMove={(e) => {
          const n = e.target
          const cx = snapTo(n.x() + s.w / 2, s.w / 2, xs, tol)
          const bottom = snapTo(-(n.y() + s.h), 0, zs, tol)
          const top = snapTo(-(n.y() + s.h) + s.h, 0, zs, tol)
          const z = Math.abs(top - s.h - -(n.y() + s.h)) < Math.abs(bottom - -(n.y() + s.h)) ? top - s.h : bottom
          n.position({ x: cx - s.w / 2, y: -(Math.max(0, z) + s.h) })
        }}
        onDragEnd={(e) => {
          const n = e.target
          mutate((p) => {
            const t = p.set!.find((x) => x.id === s.id)!
            t.x = +(n.x() + s.w / 2).toFixed(2)
            t.z = +Math.max(0, -n.y() - s.h).toFixed(2)
          })
        }}
        onTransformEnd={(e) => {
          const n = e.target
          const w = Math.max(0.2, Math.round(s.w * n.scaleX() * 4) / 4)
          const h = Math.max(0.2, Math.round(s.h * n.scaleY() * 4) / 4)
          n.scale({ x: 1, y: 1 })
          mutate((p) => {
            const t = p.set!.find((x) => x.id === s.id)!
            t.w = w
            t.h = h
            t.x = +(n.x() + w / 2).toFixed(2)
            t.z = +Math.max(0, -n.y() - h).toFixed(2)
          })
        }}
      >
        <Shape2D s={s} fill={fill} stroke={stroke} sw={sw} b={b} innerFill={innerFill} img={img} />
        {s.outline && <Bulbs s={s} />}
      </Group>
      {v.scale > 6 && (
        <Text x={s.x - s.w / 2} y={-(s.z + s.h) - 12 / v.scale} width={s.w} align="center" text={`${s.label}${s.mirrorOf ? ' ⇄' : ''}`} fontSize={9 / v.scale} fill="#8a8a8a" fontFamily="Inter" listening={false} />
      )}
      {selected && !locked && <Transformer ref={tr} rotateEnabled={false} keepRatio={false} borderStroke="#fff" anchorStroke="#fff" anchorFill="#000" anchorSize={8} />}
    </>
  )
}

function Shape2D({ s, fill, stroke, sw, b, innerFill, img }: { s: SetPiece; fill: string; stroke: string; sw: number; b: number; innerFill?: string; img: HTMLImageElement | null }) {
  const common = { stroke, strokeWidth: sw, strokeScaleEnabled: false }
  const W = s.w
  const H = s.h
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
        <div className="grid grid-cols-3 gap-2">
          <Num label="Width" value={s.w} onChange={(w) => up({ w: Math.max(0.2, w) })} unit="m" step={0.5} />
          <Num label="Height" value={s.h} onChange={(h) => up({ h: Math.max(0.2, h) })} unit="m" step={0.5} />
          <Num label="Depth" value={s.d} onChange={(d) => up({ d: Math.max(0.05, d) })} unit="m" step={0.1} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Off the ground" value={s.z} onChange={(z) => up({ z: Math.max(0, z) })} unit="m" step={0.5} tip="Height of the bottom edge. Put a header beam on top of towers this way." />
          <Num label="Distance from back" value={s.y} onChange={(y) => up({ y })} unit="m" step={0.5} tip="How far from the back of the venue it stands. Bigger numbers come forward, towards the audience." />
        </div>
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
