import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Deck, Project } from '../types'
import { PlanCanvas } from '../components/PlanCanvas'
import { TopView } from '../components/TopView'
import { fmt, stageBounds } from '../lib/calc'
import { Check, Num, Section, Sel, Stat } from '../components/ui'

const DECKS = [
  { value: '2x1', label: '2 × 1 m deck', w: 2, l: 1 },
  { value: '1x1', label: '1 × 1 m deck', w: 1, l: 1 },
  { value: '8x4', label: "8 × 4 ft deck (2.44 × 1.22 m)", w: 2.44, l: 1.22 },
] as const
type DeckSize = (typeof DECKS)[number]['value']

function fill(x: number, y: number, W: number, L: number, h: number, size: DeckSize): Deck[] {
  const d = DECKS.find((k) => k.value === size)!
  const out: Deck[] = []
  for (let c = 0; c < Math.max(1, Math.round(W / d.w)); c++) for (let r = 0; r < Math.max(1, Math.round(L / d.l)); r++) out.push({ id: nanoid(8), x: x + c * d.w, y: y + r * d.l, w: d.w, l: d.l, h })
  return out
}

export function StageWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select } = useStore.getState()
  const sb = stageBounds(project)
  const [W, setW] = useState(sb ? Math.round(sb.w) : 12)
  const [L, setL] = useState(sb ? Math.round(sb.l) : 8)
  const [H, setH] = useState(sb?.h ?? 1.2)
  const [size, setSize] = useState<DeckSize>('2x1')
  const deck = sel?.kind === 'deck' ? project.decks.find((d) => d.id === sel.id) : undefined

  const preset = (kind: 'end' | 'thrust' | 't' | 'runway' | 'centre') =>
    mutate((p) => {
      const x = Math.round((p.venue.w - W) / 2 * 2) / 2
      const y = kind === 'centre' ? Math.round((p.venue.l - L) / 2) : 2
      const decks = fill(x, y, W, L, H, size)
      const cx = x + W / 2
      if (kind === 'thrust') decks.push(...fill(cx - 3, y + L, 6, 4, H, size))
      if (kind === 't') decks.push(...fill(cx - 1, y + L, 2, 8, H, size), ...fill(cx - 4, y + L + 8, 8, 3, H, size))
      if (kind === 'runway') decks.push(...fill(cx - 1, y + L, 2, Math.min(16, p.venue.l - y - L - 8), H, size))
      p.decks = decks
    })

  const addRiser = (name: 'dj' | 'drum' | 'podium') =>
    mutate((p) => {
      const b = stageBounds(p)
      const base = b?.h ?? 0
      const [w, l, dh] = name === 'dj' ? [4, 2, 0.6] : name === 'drum' ? [3, 3, 0.4] : [1, 1, 0.2]
      const cx = b ? b.x + b.w / 2 : p.venue.w / 2
      const y = b ? b.y + (name === 'podium' ? b.l - 2 : 1) : 2
      p.decks.push({ id: nanoid(8), x: Math.round((cx - w / 2) * 2) / 2 + (name === 'podium' ? 3 : 0), y, w, l, h: base + dh })
    })

  const shiftAll = (dx: number, dy: number) => mutate((p) => p.decks.forEach((d) => ((d.x += dx), (d.y += dy))))

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <Section title="Stage builder">
          <Sel label="Deck size" value={size} onChange={setSize} options={DECKS.map((d) => ({ value: d.value, label: d.label }))} tip="Stages are built from standard platform decks clamped together on legs." />
          <div className="grid grid-cols-3 gap-2">
            <Num label="Width" value={W} onChange={setW} unit="m" step={1} min={2} />
            <Num label="Depth" value={L} onChange={setL} unit="m" step={1} min={1} />
            <Num label="Height" value={H} onChange={setH} unit="m" step={0.2} min={0.2} max={3} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['end', 'End stage'],
                ['thrust', 'Thrust'],
                ['t', 'T-stage'],
                ['runway', 'Runway'],
                ['centre', 'Centre / 360'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className="rounded-lg border border-line px-2 py-2 text-[11px] text-left hover:border-line-hi hover:bg-raised" onClick={() => preset(k)}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-mute">Presets replace the current stage.</p>
        </Section>
        <Section title="Add on top">
          <div className="grid grid-cols-3 gap-1.5">
            <button className="btn justify-center px-1" onClick={() => addRiser('dj')}>
              DJ riser
            </button>
            <button className="btn justify-center px-1" onClick={() => addRiser('drum')}>
              Drum riser
            </button>
            <button className="btn justify-center px-1" onClick={() => addRiser('podium')}>
              Podium
            </button>
          </div>
          <button className="btn w-full justify-center" onClick={() => mutate((p) => void p.decks.push({ id: nanoid(8), x: p.venue.w / 2 - 1, y: 1, w: 2, l: 1, h: H }))}>
            + Single deck
          </button>
        </Section>
      </aside>
      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas bounds={sb ? { x: sb.x - 6, y: sb.y - 3, w: sb.w + 12, h: sb.l + 8 } : { x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }} grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }} onBackground={() => select(null)}>
          <TopView edit="stage" />
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Top view · lighter decks are higher · numbers show deck height in m</div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {deck ? (
          <Section
            title="Deck"
            right={
              <button className="btn btn-icon h-7 w-7" onClick={() => (mutate((p) => void (p.decks = p.decks.filter((d) => d.id !== deck.id))), select(null))} title="Delete">
                <Trash2 size={13} />
              </button>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <Num label="X" value={deck.x} onChange={(x) => updDeck(deck.id, { x })} unit="m" step={0.5} />
              <Num label="Y" value={deck.y} onChange={(y) => updDeck(deck.id, { y })} unit="m" step={0.5} />
              <Num label="Width" value={deck.w} onChange={(w) => updDeck(deck.id, { w })} unit="m" step={0.5} min={0.5} />
              <Num label="Depth" value={deck.l} onChange={(l) => updDeck(deck.id, { l })} unit="m" step={0.5} min={0.5} />
              <Num label="Height" value={deck.h} onChange={(h) => updDeck(deck.id, { h })} unit="m" step={0.1} min={0.1} />
            </div>
            <DeckLook ids={[deck.id]} d={deck} />
          </Section>
        ) : null}
        <StageSummary project={project} onShift={shiftAll} />
      </aside>
    </div>
  )
}

function StageSummary({ project, onShift }: { project: Project; onShift: (dx: number, dy: number) => void }) {
  const { mutate } = useStore.getState()
  const sb = stageBounds(project)
  if (!sb) return <Section title="Stage">{<p className="text-xs text-mute">Pick a preset on the left to build a stage.</p>}</Section>
  const area = project.decks.reduce((a, d) => a + d.w * d.l, 0)
  const counts = new Map<string, number>()
  project.decks.forEach((d) => counts.set(`${fmt(d.w, 2)}×${fmt(d.l, 2)} m`, (counts.get(`${fmt(d.w, 2)}×${fmt(d.l, 2)} m`) ?? 0) + 1))
  return (
    <>
      <Section title="Whole stage">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Footprint" value={`${fmt(sb.w, 1)} × ${fmt(sb.l, 1)} m`} />
          <Stat label="Deck area" value={`${fmt(area, 1)} m²`} />
          <Stat label="Decks" value={project.decks.length} />
          <Stat label="Skirting" value={`${fmt(sb.w + sb.l * 2, 1)} m`} sub="front + sides" />
        </div>
        <Num
          label="Stage width"
          value={+sb.w.toFixed(2)}
          onChange={(w) => mutate((p) => resizeStage(p, w, sb.l))}
          unit="m"
          step={0.5}
          min={2}
          tip="Stretches the whole stage, keeping it centred. Deck sizes change to match; check they are standard sizes before ordering."
        />
        <Num label="Stage depth" value={+sb.l.toFixed(2)} onChange={(l) => mutate((p) => resizeStage(p, sb.w, l))} unit="m" step={0.5} min={1} />
        <Num label="Set all main decks to height" value={sb.h} onChange={(h) => mutate((p) => p.decks.forEach((d) => d.h >= sb.h - 0.01 && (d.h = h)))} unit="m" step={0.1} min={0.1} />
        <div>
          <div className="text-[11px] text-dim mb-1">Move whole stage</div>
          <div className="grid grid-cols-4 gap-1">
            <button className="btn justify-center" onClick={() => onShift(-0.5, 0)}>
              ←
            </button>
            <button className="btn justify-center" onClick={() => onShift(0.5, 0)}>
              →
            </button>
            <button className="btn justify-center" onClick={() => onShift(0, -0.5)}>
              ↑
            </button>
            <button className="btn justify-center" onClick={() => onShift(0, 0.5)}>
              ↓
            </button>
          </div>
        </div>
      </Section>
      <Section title="Stage look">
        <DeckLook ids={project.decks.map((d) => d.id)} d={project.decks[0]} />
      </Section>
      <Section title="Deck list">
        {[...counts].map(([k, n]) => (
          <div key={k} className="flex justify-between text-xs mono">
            <span className="text-dim">{k}</span>
            <span>× {n}</span>
          </div>
        ))}
      </Section>
    </>
  )
}

// Scale every deck about the stage's centre line and front edge.
function resizeStage(p: Project, W: number, L: number) {
  const sb = stageBounds(p)
  if (!sb || W <= 0 || L <= 0) return
  const kx = W / sb.w
  const ky = L / sb.l
  const cx = sb.x + sb.w / 2
  const front = sb.y + sb.l
  for (const d of p.decks) {
    d.x = +(cx + (d.x - cx) * kx).toFixed(3)
    d.w = +(d.w * kx).toFixed(3)
    d.y = +(front + (d.y - front) * ky).toFixed(3)
    d.l = +(d.l * ky).toFixed(3)
  }
}

const SKIRTS = ['#060606', '#f5f0e6', '#7a0f1f', '#1b2a5a', '#c9a14a']

function DeckLook({ ids, d }: { ids: string[]; d: Deck }) {
  const { mutate } = useStore.getState()
  const set = (patch: Partial<Deck>) => mutate((p) => p.decks.forEach((x) => ids.includes(x.id) && Object.assign(x, patch)))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="label">Floor colour</span>
        <input type="color" value={d.color ?? '#151515'} onChange={(e) => set({ color: e.target.value })} className="h-7 w-14 bg-transparent border border-line rounded" />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="label">Skirt colour</span>
        <div className="flex gap-1 items-center">
          {SKIRTS.map((c) => (
            <button key={c} className="h-5 w-5 rounded border border-line" style={{ background: c }} onClick={() => set({ skirt: c })} title={c} />
          ))}
          <input type="color" value={d.skirt ?? '#060606'} onChange={(e) => set({ skirt: e.target.value })} className="h-6 w-8 bg-transparent border border-line rounded" />
        </div>
      </div>
      <Check label="LED strip on the front edge" checked={d.edgeLight !== false} onChange={(edgeLight) => set({ edgeLight })} />
    </div>
  )
}

function updDeck(id: string, patch: Partial<Deck>) {
  useStore.getState().mutate((p) => {
    const d = p.decks.find((x) => x.id === id)
    if (d) Object.assign(d, patch)
  })
}
