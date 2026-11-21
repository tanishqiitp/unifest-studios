// Sound tab: design the PA on the ground plan, see how loud every part of the crowd will be, and write the
// input list and monitor mixes for the crew. Everything feeds weight, power, the quote, 3D and the PDF.
import { KitMenu } from '../components/KitMenu'
import { useMemo } from 'react'
import { Circle, Group, Image as KImage, Line, Rect, Text, Wedge } from 'react-konva'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { AlertTriangle, Copy, Plus, Sparkles, Speaker, Trash2, Wand2 } from 'lucide-react'
import { useStore } from '../store'
import type { Project, SoundPlan, SoundRole, SoundSource } from '../types'
import { PlanCanvas, useView } from '../components/PlanCanvas'
import { TopView } from '../components/TopView'
import { Check, Num, Section, Sel, Stat } from '../components/ui'
import { fmt } from '../lib/calc'
import { autoDesign, coverage, delayFor, emptyPlan, EVENTS, hangKg, INPUT_PRESETS, MIX_PRESETS, newSource, ROLE_NAMES, soundPower, soundRows, soundWarnings, SPEAKERS, stageFront, targetOf, type Coverage, type SoundEvent, type SpeakerId } from '../lib/sound'
import { stageBounds } from '../lib/calc'

type MapMode = 'tops' | 'subs' | 'off'
const useSoundUI = create<{ sel: string | null; map: MapMode; tab: 'design' | 'inputs'; set: (p: Partial<{ sel: string | null; map: MapMode; tab: 'design' | 'inputs' }>) => void }>((set) => ({
  sel: null,
  map: 'tops',
  tab: 'design',
  set: (p) => set(p),
}))

const editSound = (fn: (s: SoundPlan, p: Project) => void) =>
  useStore.getState().mutate((p) => {
    p.sound ??= emptyPlan(p)
    fn(p.sound, p)
  })
const editSource = (id: string, patch: Partial<SoundSource>) => editSound((s) => void Object.assign(s.sources.find((x) => x.id === id) ?? {}, patch))

// Level against the target: blue too quiet, green right, red too loud.
const BANDS: [number, string, string][] = [
  [-6, '#3b6cf6', 'more than 6 dB too quiet'],
  [-3, '#38bdf8', '3–6 dB quiet'],
  [3, '#22c55e', 'within 3 dB of target'],
  [6, '#f59e0b', '3–6 dB loud'],
  [Infinity, '#ef4444', 'more than 6 dB too loud'],
]
const colourFor = (d: number) => (BANDS.find(([lim]) => d < lim) ?? BANDS[BANDS.length - 1])[1]

export function SoundWorkspace() {
  const project = useStore((s) => s.project)
  const plan = project.sound
  const ui = useSoundUI()
  const sel = plan?.sources.find((s) => s.id === ui.sel)
  const cov = useMemo(() => (plan?.sources.length && ui.map !== 'off' ? coverage(project, plan, ui.map) : null), [project, plan, ui.map])
  const tops = useMemo(() => (plan?.sources.length ? coverage(project, plan, 'tops') : null), [project, plan])
  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <KitMenu kind="sound" />
        <DesignPanel />
        <SourceList />
      </aside>
      <div className="relative flex-1 min-w-0 bg-canvas">
        <PlanCanvas bounds={{ x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }} grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }} onBackground={() => ui.set({ sel: null })}>
          <TopView edit="sound" />
          {cov && plan && <CoverageLayer cov={cov} target={targetOf(plan)} />}
          {plan?.sources.map((s) => <SourceNode key={s.id} s={s} selected={s.id === ui.sel} />)}
        </PlanCanvas>
        <div className="absolute top-3 left-3 glass rounded-xl p-1 flex gap-0.5 text-[11px]" role="group" aria-label="Coverage map">
          {(
            [
              ['tops', 'Coverage'],
              ['subs', 'Subwoofers'],
              ['off', 'No map'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`btn h-7 px-2 ${ui.map === k ? 'btn-on' : ''}`} onClick={() => ui.set({ map: k })}>
              {l}
            </button>
          ))}
        </div>
        {cov && plan && (
          <div className="absolute left-3 bottom-3 glass rounded-xl px-3 py-2 text-[10px] space-y-0.5">
            <div className="font-medium text-[11px] mb-1">
              {ui.map === 'subs' ? 'Bass level' : 'Level'} vs target {targetOf(plan)} dB
            </div>
            {BANDS.map(([, c, l]) => (
              <div key={l} className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm" style={{ background: c }} /> {l}
              </div>
            ))}
            <div className="text-mute pt-1">Planning estimate, ±3–6 dB</div>
          </div>
        )}
        {!plan?.sources.length && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="glass rounded-2xl p-5 max-w-sm text-center pointer-events-auto">
              <Speaker className="mx-auto mb-2" size={22} />
              <div className="text-sm font-medium">Plan the sound system</div>
              <p className="text-[11px] text-mute mt-1 mb-3">One click sizes and places mains, subwoofers, front fills, delay towers and monitors for this venue, stage and crowd. Then adjust anything on the plan.</p>
              <button className="btn btn-primary h-9" onClick={runAuto}>
                <Wand2 size={14} /> Auto design
              </button>
            </div>
          </div>
        )}
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        <div className="flex gap-1 p-2 border-b border-line">
          {(
            [
              ['design', 'Coverage & system'],
              ['inputs', 'Inputs & monitors'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={`btn h-8 flex-1 justify-center text-[11px] ${ui.tab === k ? 'btn-on' : ''}`} onClick={() => ui.set({ tab: k })}>
              {l}
            </button>
          ))}
        </div>
        {ui.tab === 'inputs' ? <InputsPanel /> : sel ? <SourcePanel s={sel} /> : <Overview cov={tops} />}
      </aside>
    </div>
  )
}

function runAuto() {
  const p = useStore.getState().project
  if (p.sound?.sources.length && !confirm('Replace the current speakers with a new automatic design? (Ctrl+Z brings them back)')) return
  const legacy = p.fixtures.filter((f) => f.kind === 'line-array' || f.kind === 'sub').length
  useStore.getState().mutate((q) => {
    const plan = autoDesign(q, q.sound)
    q.sound = { ...plan, inputs: q.sound?.inputs, mixes: q.sound?.mixes }
    // The basic speaker boxes placed in rigging are replaced by the planned system.
    q.fixtures = q.fixtures.filter((f) => f.kind !== 'line-array' && f.kind !== 'sub')
  })
  useSoundUI.getState().set({ sel: null, map: 'tops' })
  useStore.getState().notify(`Sound system designed${legacy ? `; replaced ${legacy} basic speaker boxes from rigging` : ''}. Drag speakers to adjust.`)
}

// ---------------------------------------------------------------- left: design and add

function DesignPanel() {
  const project = useStore((s) => s.project)
  const plan = project.sound ?? emptyPlan(project)
  const target = targetOf(plan)
  const add = (kind: SpeakerId, role: SoundRole, extra: Partial<SoundSource> = {}) => {
    const p = useStore.getState().project
    const sb = stageBounds(p)
    const front = stageFront(p) ?? p.venue.l * 0.2
    const cx = sb ? sb.x + sb.w / 2 : p.venue.w / 2
    const y = role === 'delay' ? front + Math.min(40, p.venue.l * 0.45) : role === 'monitor' ? front - 1.2 : front + 0.5
    const s = newSource(kind, role, cx + (role === 'main' ? -(sb ? sb.w / 2 + 2 : 8) : 0), y, extra)
    editSound((pl) => {
      pl.sources.push(s)
      if (role === 'delay' || role === 'fill') s.delay = delayFor(pl, s)
      Object.assign(pl.sources[pl.sources.length - 1], { delay: s.delay })
    })
    useSoundUI.getState().set({ sel: s.id, tab: 'design' })
  }
  return (
    <Section title="Sound system">
      <Sel
        label="Kind of event"
        value={plan.event}
        onChange={(v) => editSound((s) => void ((s.event = v as SoundEvent), (s.target = undefined)))}
        options={(Object.keys(EVENTS) as SoundEvent[]).map((k) => ({ value: k, label: EVENTS[k].name }))}
        tip={EVENTS[plan.event].tip}
      />
      <label className="block">
        <span className="flex justify-between text-[11px] text-dim mb-1">
          <span>Target level at the mixing desk</span>
          <b className="text-fg tabular-nums">{target} dB</b>
        </span>
        <input type="range" min={75} max={108} step={1} value={target} onChange={(e) => editSound((s) => void (s.target = +e.target.value))} className="w-full" aria-label="Target level" />
        <span className="text-[10px] text-mute">Speech 80–88 · weddings 90–95 · concerts 96–100 · EDM 100–104 (A-weighted, at FOH)</span>
      </label>
      <button className="btn btn-primary w-full justify-center h-9" onClick={runAuto} title="Size and place the whole system for this venue, stage, crowd and event">
        <Wand2 size={14} /> {plan.sources.length ? 'Redesign automatically' : 'Auto design'}
      </button>
      <div className="label pt-1">Add</div>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('la12', 'main', { boxes: 8, flown: true, z: 9 })}>
          <Plus size={12} /> Main hang
        </button>
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('sub18', 'sub', { boxes: 2 })}>
          <Plus size={12} /> Subwoofers
        </button>
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('fill8', 'fill', { z: 1 })}>
          <Plus size={12} /> Front fill
        </button>
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('top15', 'delay', { boxes: 2, z: 3.5 })}>
          <Plus size={12} /> Delay speaker
        </button>
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('top12', 'main', { boxes: 1 })}>
          <Plus size={12} /> Speaker on stand
        </button>
        <button className="btn h-8 text-[11px] justify-center" onClick={() => add('mon12', 'monitor', { aim: 180, z: 1 })}>
          <Plus size={12} /> Stage monitor
        </button>
      </div>
    </Section>
  )
}

function SourceList() {
  const sources = useStore((s) => s.project.sound?.sources)
  const sel = useSoundUI((s) => s.sel)
  if (!sources?.length) return null
  return (
    <Section title={`Speakers (${sources.length})`}>
      <div className="space-y-0.5">
        {sources.map((s) => (
          <button key={s.id} className={`w-full text-left rounded-md px-2 py-1 text-[11px] flex items-center gap-2 hover:bg-raised ${sel === s.id ? 'bg-raised text-fg' : 'text-dim'}`} onClick={() => useSoundUI.getState().set({ sel: s.id, tab: 'design' })}>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ROLE_COLOUR[s.role] }} />
            <span className="truncate flex-1">{s.label || ROLE_NAMES[s.role]}</span>
            <span className="text-mute tabular-nums">
              {s.boxes}× {SPEAKERS[s.kind as SpeakerId]?.name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </Section>
  )
}

const ROLE_COLOUR: Record<SoundRole, string> = { main: '#ffffff', sub: '#a78bfa', fill: '#fbbf24', delay: '#38bdf8', monitor: '#f472b6', side: '#fb923c' }

// ---------------------------------------------------------------- plan: coverage and speakers

function CoverageLayer({ cov, target }: { cov: Coverage; target: number }) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = cov.cols
    c.height = cov.rows
    const g = c.getContext('2d')!
    const img = g.createImageData(cov.cols, cov.rows)
    for (let i = 0; i < cov.levels.length; i++) {
      const L = cov.levels[i]
      if (isNaN(L)) continue
      const hex = colourFor(L - target)
      img.data[i * 4] = parseInt(hex.slice(1, 3), 16)
      img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16)
      img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16)
      img.data[i * 4 + 3] = 150
    }
    g.putImageData(img, 0, 0)
    return c
  }, [cov, target])
  return <KImage image={canvas} x={cov.x0} y={cov.y0} width={cov.cols * cov.cell} height={cov.rows * cov.cell} listening={false} imageSmoothingEnabled={false} />
}

function SourceNode({ s, selected }: { s: SoundSource; selected: boolean }) {
  const v = useView()
  const sp = SPEAKERS[s.kind as SpeakerId] ?? SPEAKERS.top12
  const col = ROLE_COLOUR[s.role]
  // Aim 0° = towards the audience (+y); Konva angles run clockwise from +x.
  const dirDeg = 90 - s.aim
  const reach = s.role === 'sub' ? 0 : s.role === 'monitor' ? 3 : s.role === 'fill' ? 6 : 14
  const rad = (dirDeg * Math.PI) / 180
  const hx = Math.cos(rad) * Math.max(4, reach * 0.6)
  const hy = Math.sin(rad) * Math.max(4, reach * 0.6)
  const size = Math.max(0.8, 10 / v.scale)
  const pick = () => useSoundUI.getState().set({ sel: s.id, tab: 'design' })
  return (
    <Group x={s.x} y={s.y} draggable onDragStart={pick} onDragMove={(e) => editSource(s.id, { x: +e.target.x().toFixed(2), y: +e.target.y().toFixed(2) })} onDragEnd={() => fixDelays()} onClick={pick} onTap={pick}>
      {reach > 0 && <Wedge radius={reach} angle={Math.min(359, sp.h)} rotation={dirDeg - Math.min(359, sp.h) / 2} fill={col} opacity={selected ? 0.16 : 0.07} listening={false} />}
      {s.role === 'sub' ? (
        <Circle radius={size * 0.7} fill="#1a1a1a" stroke={col} strokeWidth={selected ? 3 : 1.5} strokeScaleEnabled={false} />
      ) : (
        <Rect x={-size * 0.6} y={-size * 0.35} width={size * 1.2} height={size * 0.7} rotation={-s.aim} fill="#111" stroke={col} strokeWidth={selected ? 3 : 1.5} strokeScaleEnabled={false} />
      )}
      {/* Names for the big pieces (and whatever is selected), so the stage front doesn't turn into a word cloud. */}
      {(selected || s.role === 'main' || s.role === 'delay' || s.role === 'side') && (
        <Text text={`${s.label || ROLE_NAMES[s.role]}${s.boxes > 1 ? ` ×${s.boxes}` : ''}${s.delay ? ` · ${s.delay} ms` : ''}`} x={size * 0.8} y={s.role === 'main' ? -size * 1.6 : -size * 0.5} fontSize={11 / v.scale} fill={col} listening={false} />
      )}
      {selected && reach > 0 && (
        <>
          <Line points={[0, 0, hx, hy]} stroke={col} strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />
          <Circle
            x={hx}
            y={hy}
            radius={7 / v.scale}
            fill={col}
            draggable
            onDragMove={(e) => {
              e.cancelBubble = true
              const a = (Math.atan2(e.target.x(), e.target.y()) * 180) / Math.PI
              editSource(s.id, { aim: Math.round(a) })
              e.target.position({ x: hx, y: hy })
            }}
            onDragStart={(e) => (e.cancelBubble = true)}
            onDragEnd={(e) => (e.cancelBubble = true)}
          />
        </>
      )}
    </Group>
  )
}

/** Keep fills' and delays' delay times right after a move (only those still on the automatic value). */
function fixDelays() {
  editSound((pl) => {
    for (const s of pl.sources) if ((s.role === 'delay' || s.role === 'fill') && !s.manualDelay) s.delay = delayFor(pl, s)
  })
}

// ---------------------------------------------------------------- right: overview, selected speaker, inputs

function Overview({ cov }: { cov: Coverage | null }) {
  const project = useStore((s) => s.project)
  const plan = project.sound
  if (!plan?.sources.length || !cov) {
    return (
      <Section title="Coverage">
        <p className="text-[11px] text-mute leading-relaxed">Use Auto design, or add speakers on the left. The map then shows how loud each part of the audience will be compared with the target, and warns about quiet or too-loud areas.</p>
      </Section>
    )
  }
  const st = cov.stats
  const t = targetOf(plan)
  const warnings = soundWarnings(project, cov)
  const rows = soundRows(project)
  const boxes = rows.filter((r) => /speaker|line array|subwoofer|monitor/i.test(r.item))
  const kg = rows.reduce((a, r) => a + r.weightKg, 0)
  return (
    <>
      <Section title="Coverage">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="At the desk" value={st.foh !== null ? `${Math.round(st.foh)} dB` : '—'} sub={`target ${t} dB`} />
          <Stat label="Even (±3 dB)" value={`${Math.round(st.even * 100)}%`} sub="of the audience" />
          <Stat label="Front / back" value={`${st.front !== null ? Math.round(st.front) : '—'} / ${st.back !== null ? Math.round(st.back) : '—'}`} sub="dB, centre line" />
          <Stat label="Headroom" value={`${st.headroom >= 0 ? '' : '−'}${Math.abs(Math.round(st.headroom))} dB`} sub={st.headroom >= 6 ? 'plenty' : st.headroom >= 3 ? 'enough' : 'too little'} />
        </div>
        {warnings.length ? (
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w} className="flex gap-1.5 text-[11px] text-warn leading-snug">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-dim">No problems found: even coverage, enough headroom, delays in time.</p>
        )}
      </Section>
      <Section title="System">
        <div className="space-y-1 text-[11px]">
          {boxes.map((r) => (
            <div key={r.item} className="flex justify-between gap-2">
              <span className="text-dim truncate">{r.item}</span>
              <span className="tabular-nums">{r.qty}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Weight" value={`${fmt(kg / 1000, 1)} t`} sub="speakers, frames, desk" />
          <Stat label="Power" value={`${fmt(soundPower(project) / 1000, 1)} kW`} sub="typical draw" />
        </div>
        <p className="text-[10px] text-mute leading-relaxed">Added to the equipment list, generator sizing, crew and quote. Generic speaker types; swap in your brand's specs when ordering. Flown hangs need their own motors.</p>
      </Section>
    </>
  )
}

function SourcePanel({ s }: { s: SoundSource }) {
  const plan = useStore((st) => st.project.sound)!
  const sp = SPEAKERS[s.kind as SpeakerId] ?? SPEAKERS.top12
  const up = (patch: Partial<SoundSource>) => editSource(s.id, patch)
  const auto = delayFor(plan, s)
  const kinds = (Object.keys(SPEAKERS) as SpeakerId[]).filter((k) => (s.role === 'sub' ? SPEAKERS[k].kind === 'sub' : s.role === 'monitor' ? SPEAKERS[k].kind !== 'sub' : SPEAKERS[k].kind !== 'sub' && SPEAKERS[k].kind !== 'monitor'))
  return (
    <>
      <Section
        title={s.label || ROLE_NAMES[s.role]}
        right={
          <div className="flex gap-1">
            <button
              className="btn btn-icon h-7 w-7"
              title="Duplicate (mirrored across the stage centre)"
              onClick={() => {
                const p = useStore.getState().project
                const sb = stageBounds(p)
                const cx = sb ? sb.x + sb.w / 2 : p.venue.w / 2
                const c = { ...s, id: nanoid(6), x: +(2 * cx - s.x).toFixed(2), aim: -s.aim, label: s.label?.replace(/left/i, 'right') ?? s.label }
                editSound((pl) => void pl.sources.push(c))
                useSoundUI.getState().set({ sel: c.id })
              }}
            >
              <Copy size={13} />
            </button>
            <button
              className="btn btn-icon h-7 w-7 hover:text-err"
              title="Delete"
              onClick={() => {
                editSound((pl) => void (pl.sources = pl.sources.filter((x) => x.id !== s.id)))
                useSoundUI.getState().set({ sel: null })
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        }
      >
        <label className="block">
          <span className="block mb-1 text-[11px] text-dim">Name</span>
          <input className="field" value={s.label ?? ''} placeholder={ROLE_NAMES[s.role]} onChange={(e) => up({ label: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Sel label="Role" value={s.role} onChange={(v) => up({ role: v as SoundRole })} options={(Object.keys(ROLE_NAMES) as SoundRole[]).map((k) => ({ value: k, label: ROLE_NAMES[k] }))} />
          <Sel label="Speaker" value={s.kind as SpeakerId} onChange={(v) => up({ kind: v, flown: SPEAKERS[v].kind === 'array' ? s.flown : false })} options={kinds.map((k) => ({ value: k, label: SPEAKERS[k].name }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Num label={sp.kind === 'array' ? 'Boxes in the hang' : 'Speakers here'} value={s.boxes} onChange={(n) => up({ boxes: Math.max(1, Math.min(24, Math.round(n))) })} step={1} int />
          <Num label="Aim" value={s.aim} onChange={(n) => up({ aim: Math.round(((((n + 180) % 360) + 360) % 360) - 180) })} unit="°" step={5} tip="0° points straight at the audience; positive turns towards audience-left. Or drag the dot on the plan." />
        </div>
        {sp.kind === 'array' && <Check label="Flown (hung from a motor)" checked={s.flown} onChange={(v) => up({ flown: v })} />}
        <div className="grid grid-cols-3 gap-2">
          <Num label="Across" value={s.x} onChange={(n) => up({ x: n })} unit="m" step={0.5} />
          <Num label="Depth" value={s.y} onChange={(n) => up({ y: n })} unit="m" step={0.5} />
          <Num label={s.flown ? 'Hang top' : 'Base'} value={s.z} onChange={(n) => up({ z: Math.max(0, n) })} unit="m" step={0.5} />
        </div>
        {(s.role === 'delay' || s.role === 'fill') && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Num label="Delay" value={s.delay ?? 0} onChange={(n) => up({ delay: Math.max(0, +n.toFixed(1)), manualDelay: true })} unit="ms" step={1} tip="So its sound arrives just after the mains' (about 10 ms later, so the stage still sounds like the source)." />
            </div>
            <button className="btn h-9 text-[11px]" title={`Set from the distance to the mains: ${auto} ms`} onClick={() => up({ delay: auto, manualDelay: false })}>
              Auto ({auto} ms)
            </button>
          </div>
        )}
        <div className="text-[11px] text-dim space-y-0.5">
          <div>
            {sp.name}: {sp.h === 360 ? 'all directions' : `${sp.h}° wide`}, {sp.kg} kg each, about {sp.drawW} W each
          </div>
          {s.flown && <div>Hang weight with frame: {Math.round(hangKg(s))} kg</div>}
        </div>
      </Section>
    </>
  )
}

function InputsPanel() {
  const plan = useStore((s) => s.project.sound ?? emptyPlan(s.project))
  const inputs = plan.inputs ?? []
  const mixes = plan.mixes ?? []
  const fill = () => {
    if (inputs.length && !confirm('Replace the input list and monitor mixes with the standard ones for this kind of event?')) return
    editSound((s) => {
      s.inputs = INPUT_PRESETS[s.event].map(([name, source, stand]) => ({ id: nanoid(6), name, source, stand, phantom: /condenser/i.test(source) }))
      s.mixes = MIX_PRESETS[s.event].map(([name, feeds]) => ({ id: nanoid(6), name, feeds }))
    })
  }
  const upIn = (id: string, patch: Partial<NonNullable<SoundPlan['inputs']>[number]>) => editSound((s) => void Object.assign(s.inputs?.find((x) => x.id === id) ?? {}, patch))
  return (
    <>
      <Section
        title={`Input list (${inputs.length})`}
        right={
          <button className="btn h-7 text-[11px]" onClick={fill} title={`Standard channels for: ${EVENTS[plan.event].name}`}>
            <Sparkles size={12} /> Fill for event
          </button>
        }
      >
        {inputs.length === 0 && <p className="text-[11px] text-mute">Every microphone and line the mixing desk needs, numbered for the crew. Start with “Fill for event”, then edit.</p>}
        <div className="space-y-1">
          {inputs.map((c, i) => (
            <div key={c.id} className="grid grid-cols-[22px_1fr_1fr_auto_auto] gap-1 items-center">
              <span className="text-[10px] text-mute tabular-nums text-right">{i + 1}</span>
              <input className="field h-7 text-[11px]" value={c.name} onChange={(e) => upIn(c.id, { name: e.target.value })} aria-label={`Channel ${i + 1} name`} />
              <input className="field h-7 text-[11px]" value={c.source} onChange={(e) => upIn(c.id, { source: e.target.value })} aria-label={`Channel ${i + 1} mic or DI`} />
              <label className="text-[10px] text-mute flex items-center gap-0.5" title="Phantom power (48 V) for condenser mics">
                <input type="checkbox" checked={!!c.phantom} onChange={(e) => upIn(c.id, { phantom: e.target.checked })} />
                48V
              </label>
              <button className="text-mute hover:text-err" aria-label={`Remove channel ${i + 1}`} onClick={() => editSound((s) => void (s.inputs = (s.inputs ?? []).filter((x) => x.id !== c.id)))}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn h-7 w-full justify-center text-[11px]" onClick={() => editSound((s) => void (s.inputs = [...(s.inputs ?? []), { id: nanoid(6), name: `Channel ${(s.inputs?.length ?? 0) + 1}`, source: 'Dynamic mic' }]))}>
          <Plus size={12} /> Add channel
        </button>
      </Section>
      <Section title={`Monitor mixes (${mixes.length})`}>
        <div className="space-y-1">
          {mixes.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[22px_1fr_1.4fr_auto] gap-1 items-center">
              <span className="text-[10px] text-mute tabular-nums text-right">{i + 1}</span>
              <input className="field h-7 text-[11px]" value={m.name} onChange={(e) => editSound((s) => void Object.assign(s.mixes?.find((x) => x.id === m.id) ?? {}, { name: e.target.value }))} aria-label={`Mix ${i + 1} name`} />
              <input className="field h-7 text-[11px]" value={m.feeds} placeholder="What they hear" onChange={(e) => editSound((s) => void Object.assign(s.mixes?.find((x) => x.id === m.id) ?? {}, { feeds: e.target.value }))} aria-label={`Mix ${i + 1} contents`} />
              <button className="text-mute hover:text-err" aria-label={`Remove mix ${i + 1}`} onClick={() => editSound((s) => void (s.mixes = (s.mixes ?? []).filter((x) => x.id !== m.id)))}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <button className="btn h-7 w-full justify-center text-[11px]" onClick={() => editSound((s) => void (s.mixes = [...(s.mixes ?? []), { id: nanoid(6), name: `Mix ${(s.mixes?.length ?? 0) + 1}`, feeds: '' }]))}>
          <Plus size={12} /> Add mix
        </button>
        <p className="text-[10px] text-mute">The input list, monitor mixes and speaker plan go into the technical PDF for the sound crew.</p>
      </Section>
    </>
  )
}
