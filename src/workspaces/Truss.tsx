import { useState } from 'react'
import { Line } from 'react-konva'
import { nanoid } from 'nanoid'
import { Anchor, MousePointer2, PenLine, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Fixture, Truss, TrussType } from '../types'
import { PlanCanvas, useSnap } from '../components/PlanCanvas'
import { TopView } from '../components/TopView'
import { autoRig, FIXTURE_INFO, fmt, rigging, stageBounds, stockPieces, trussLength, TRUSS_INFO } from '../lib/calc'
import { Check, Num, Section, Sel, Stat } from '../components/ui'

export function TrussWorkspace() {
  const project = useStore((s) => s.project)
  const ui = useStore((s) => s.ui)
  const { mutate, select, setUI } = useStore.getState()
  const snap = useSnap()
  const [type, setType] = useState<TrussType>('box30')
  const [height, setHeight] = useState(8)
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const sb = stageBounds(project)
  const rig = rigging(project)
  const truss = ui.selection?.kind === 'truss' ? project.truss.find((t) => t.id === ui.selection!.id) : undefined
  const hoist = ui.selection?.kind === 'hoist' ? project.hoists.find((h) => h.id === ui.selection!.id) : undefined

  const preset = (kind: 'goal' | 'roof' | 'front') =>
    mutate((p) => {
      const b = stageBounds(p) ?? { x: p.venue.w / 2 - 6, y: 2, w: 12, l: 8, h: 1.2 }
      const x1 = b.x - 1
      const x2 = b.x + b.w + 1
      const mk = (a: number, bb: number, c: number, d: number, legs: boolean): Truss => ({ id: nanoid(8), type, x1: a, y1: bb, x2: c, y2: d, height, legs })
      if (kind === 'goal') p.truss.push(mk(x1, b.y + 0.6, x2, b.y + 0.6, true))
      if (kind === 'front') p.truss.push(mk(x1, b.y + b.l - 0.5, x2, b.y + b.l - 0.5, true))
      if (kind === 'roof') {
        const y1 = b.y - 0.5
        const y2 = b.y + b.l - 0.5
        p.truss.push(mk(x1, y1, x2, y1, true), mk(x1, y2, x2, y2, true), mk(x1, y1, x1, y2, false), mk(x2, y1, x2, y2, false))
      }
    })

  const addFixtures = (kind: Fixture['kind'], n: number) =>
    mutate((p) => {
      const t = p.truss.find((x) => x.id === truss?.id)
      if (!t) return
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n
        p.fixtures.push({ id: nanoid(8), kind, x: t.x1 + (t.x2 - t.x1) * u, y: t.y1 + (t.y2 - t.y1) * u, z: t.height })
      }
    })

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <Section title="Draw truss">
          <Sel label="Truss type" value={type} onChange={setType} options={(Object.keys(TRUSS_INFO) as TrussType[]).map((k) => ({ value: k, label: TRUSS_INFO[k].name }))} tip="Box truss is the square aluminium beam used to hang screens and lights. Bigger = stronger." />
          <Num label="Trim height" value={height} onChange={setHeight} unit="m" step={0.5} min={2} max={20} tip="Height of the truss above the ground." />
          <button className={`btn w-full justify-center ${ui.tool === 'draw-truss' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: ui.tool === 'draw-truss' ? 'select' : 'draw-truss' })}>
            <PenLine size={13} /> {ui.tool === 'draw-truss' ? 'Drawing: drag on canvas' : 'Draw a truss line'}
          </button>
          <button className={`btn w-full justify-center ${ui.tool === 'hoist' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: ui.tool === 'hoist' ? 'select' : 'hoist' })}>
            <Anchor size={13} /> {ui.tool === 'hoist' ? 'Click to place hoists' : 'Place chain hoists'}
          </button>
        </Section>
        <Section title="Auto-rig">
          <p className="text-[11px] text-mute leading-relaxed">Places chain hoists on every truss so no point goes over 80% of its rating and no span is overloaded.</p>
          <button
            className="btn btn-primary w-full justify-center"
            onClick={() => {
              const before = project.hoists.length
              mutate((p) => void (p.hoists = autoRig(p)))
              const after = useStore.getState().project.hoists.length
              useStore.getState().notify(`Auto-rig placed ${after} hoists (${after - before >= 0 ? '+' : ''}${after - before})`)
            }}
          >
            <Anchor size={13} /> Auto-rig all truss
          </button>
        </Section>
        <Section title="Presets">
          <div className="grid grid-cols-1 gap-1.5">
            <button className="btn" onClick={() => preset('goal')}>
              Goal-post (upstage, screen truss)
            </button>
            <button className="btn" onClick={() => preset('front')}>
              Front lighting truss
            </button>
            <button className="btn" onClick={() => preset('roof')}>
              Roof system over stage
            </button>
          </div>
        </Section>
        <Section title="Hang on selected truss">
          {truss ? (
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(FIXTURE_INFO) as Fixture['kind'][])
                .filter((k) => FIXTURE_INFO[k].flown)
                .map((k) => (
                  <button key={k} className="rounded-lg border border-line px-2 py-2 text-[11px] text-left hover:border-line-hi hover:bg-raised" onClick={() => addFixtures(k, k === 'line-array' ? 8 : 6)}>
                    + {k === 'line-array' ? 8 : 6} {FIXTURE_INFO[k].name}
                    <div className="mono text-[10px] text-mute">{FIXTURE_INFO[k].weight} kg each</div>
                  </button>
                ))}
            </div>
          ) : (
            <p className="text-[11px] text-mute">Select a truss to hang lights or speakers on it.</p>
          )}
        </Section>
      </aside>
      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 glass rounded-xl flex gap-1 p-1">
          <button className={`btn h-8 ${ui.tool === 'select' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: 'select' })}>
            <MousePointer2 size={13} /> Select
          </button>
          <button className={`btn h-8 ${ui.tool === 'draw-truss' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: 'draw-truss' })}>
            <PenLine size={13} /> Truss
          </button>
          <button className={`btn h-8 ${ui.tool === 'hoist' ? 'btn-on' : ''}`} onClick={() => setUI({ tool: 'hoist' })}>
            <Anchor size={13} /> Hoist
          </button>
        </div>
        <PlanCanvas
          bounds={sb ? { x: sb.x - 8, y: Math.max(-2, sb.y - 3), w: sb.w + 16, h: sb.l + 8 } : { x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }}
          grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }}
          cursor={ui.tool === 'draw-truss' || ui.tool === 'hoist' ? 'crosshair' : undefined}
          onBackground={() => ui.tool === 'select' && select(null)}
          onWorldDown={(w) => {
            if (ui.tool === 'draw-truss') setDraft({ x1: snap(w.x), y1: snap(w.y), x2: snap(w.x), y2: snap(w.y) })
            if (ui.tool === 'hoist')
              mutate((p) => {
                const h = { id: nanoid(8), x: snap(w.x, 0.25), y: snap(w.y, 0.25), capacity: 1000 }
                p.hoists.push(h)
              })
          }}
          onWorldMove={(w) => {
            if (!draft) return
            // Hold to straight lines: snap to horizontal/vertical when close
            let x2 = snap(w.x)
            let y2 = snap(w.y)
            if (Math.abs(y2 - draft.y1) < Math.abs(x2 - draft.x1) * 0.15) y2 = draft.y1
            else if (Math.abs(x2 - draft.x1) < Math.abs(y2 - draft.y1) * 0.15) x2 = draft.x1
            setDraft({ ...draft, x2, y2 })
          }}
          onWorldUp={() => {
            if (draft && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) >= 0.5) {
              const t: Truss = { id: nanoid(8), type, height, legs: false, ...draft }
              mutate((p) => void p.truss.push(t))
              select({ kind: 'truss', id: t.id })
            }
            setDraft(null)
          }}
        >
          <TopView edit="truss" />
          {draft && <Line points={[draft.x1, draft.y1, draft.x2, draft.y2]} stroke="#fff" strokeWidth={2} dash={[6, 4]} strokeScaleEnabled={false} />}
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Top view · ◆ hoist · square = ground-support tower · labels show kg on each point</div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {truss && <TrussProps t={truss} />}
        {hoist && (
          <Section
            title="Chain hoist"
            right={
              <button className="btn btn-icon h-7 w-7" onClick={() => (mutate((p) => void (p.hoists = p.hoists.filter((h) => h.id !== hoist.id))), select(null))}>
                <Trash2 size={13} />
              </button>
            }
          >
            <Sel
              label="Motor rating"
              value={String(hoist.capacity)}
              onChange={(v) => mutate((p) => void (p.hoists.find((h) => h.id === hoist.id)!.capacity = Number(v)))}
              options={[
                { value: '250', label: '250 kg' },
                { value: '500', label: '500 kg (½ t)' },
                { value: '1000', label: '1000 kg (1 t)' },
                { value: '2000', label: '2000 kg (2 t)' },
              ]}
              tip="Electric chain motors lift the truss. Never load above the rating."
            />
            <Stat label="Load on this point" value={`${Math.round(rig.supports.find((s) => s.id === hoist.id)?.kg ?? 0)} kg`} />
          </Section>
        )}
        <Section title="Rigging summary">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Truss" value={`${fmt(project.truss.reduce((a, t) => a + trussLength(t), 0), 1)} m`} />
            <Stat label="Hoists" value={project.hoists.length} />
            <Stat label="Flown load" value={`${Math.round(rig.trusses.reduce((a, t) => a + t.total, 0))} kg`} />
            <Stat label="Fixtures" value={project.fixtures.length} />
          </div>
          <table className="w-full text-[11px] mono">
            <thead>
              <tr className="text-mute">
                <th className="text-left font-normal py-1">Point</th>
                <th className="text-right font-normal">Load</th>
                <th className="text-right font-normal">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rig.supports.map((s) => (
                <tr key={s.id} className={`border-t border-line ${s.kg > s.capacity ? 'text-err' : ''}`}>
                  <td className="py-1">{s.label}</td>
                  <td className="text-right">{Math.round(s.kg)} kg</td>
                  <td className="text-right">{s.capacity || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-mute leading-relaxed">Indicative figures for planning only. A certified rigger must verify every load with the manufacturer's tables before the build.</p>
        </Section>
      </aside>
    </div>
  )
}

function TrussProps({ t }: { t: Truss }) {
  const project = useStore((s) => s.project)
  const { mutate, select } = useStore.getState()
  const r = rigging(project).trusses.find((x) => x.truss.id === t.id)
  const up = (patch: Partial<Truss>) => mutate((p) => Object.assign(p.truss.find((x) => x.id === t.id)!, patch))
  const len = trussLength(t)
  const pieces = stockPieces(len)
  const counts = new Map<number, number>()
  pieces.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1))
  return (
    <Section
      title="Truss run"
      right={
        <button
          className="btn btn-icon h-7 w-7"
          onClick={() => {
            mutate((p) => {
              p.truss = p.truss.filter((x) => x.id !== t.id)
              p.fixtures = p.fixtures.filter((f) => !(Math.abs(f.z - t.height) < 0.01 && Math.min(t.x1, t.x2) - 0.1 <= f.x && f.x <= Math.max(t.x1, t.x2) + 0.1 && Math.min(t.y1, t.y2) - 0.1 <= f.y && f.y <= Math.max(t.y1, t.y2) + 0.1))
            })
            select(null)
          }}
        >
          <Trash2 size={13} />
        </button>
      }
    >
      <Sel label="Type" value={t.type} onChange={(type) => up({ type })} options={(Object.keys(TRUSS_INFO) as TrussType[]).map((k) => ({ value: k, label: TRUSS_INFO[k].name }))} />
      <Num label="Trim height" value={t.height} onChange={(height) => up({ height })} unit="m" step={0.5} min={1} />
      <Check label="Ground-support towers at both ends" checked={t.legs} onChange={(legs) => up({ legs })} tip="Towers stand on the floor and lift the truss: use them when there is no roof to hang motors from." />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Length" value={`${fmt(len, 2)} m`} />
        <Stat label="Self weight" value={`${Math.round(len * TRUSS_INFO[t.type].kgPerM)} kg`} />
        {r && <Stat label="Longest span" value={`${fmt(r.maxSpan, 1)} m`} />}
        {r && <Stat label="Live load" value={`${Math.round(r.total - r.selfWeight)} kg`} sub={`limit ≈ ${Math.round(r.allowable)} kg`} />}
      </div>
      {r && r.attached.length > 0 && (
        <div className="text-[11px] space-y-0.5">
          <div className="text-dim">Hanging on it</div>
          {r.attached.map((a) => (
            <div key={a.label} className="flex justify-between mono">
              <span>{a.label}</span>
              <span>{a.kg} kg</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px]">
        <div className="text-dim mb-0.5">Stock pieces</div>
        <div className="mono">{[...counts].map(([l, n]) => `${n}× ${l} m`).join(' · ')}</div>
      </div>
    </Section>
  )
}
