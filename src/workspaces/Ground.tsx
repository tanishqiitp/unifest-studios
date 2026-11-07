import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Building2, Copy, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { GroundItem } from '../types'
import { PlanCanvas } from '../components/PlanCanvas'
import { GROUND_STYLE, TopView } from '../components/TopView'
import { capacity, DENSITY, fmt } from '../lib/calc'
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
  label: [6, 1.5],
}

export function GroundWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select } = useStore.getState()
  const [sight, setSight] = useState(true)
  const item = sel?.kind === 'ground' ? project.ground.find((g) => g.id === sel.id) : undefined
  const cap = capacity(project.ground)
  const file = useRef<HTMLInputElement>(null)

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
      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas bounds={{ x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }} grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }} onBackground={() => select(null)}>
          <TopView edit="ground" sightlines={sight} />
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
                {DENSITY[item.kind] && <Stat label="Holds" value={`${Math.round(item.w * item.h * DENSITY[item.kind]!)} ppl`} />}
              </div>
            </Section>
          </div>
        ) : (
          <Section title="Plan summary">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Capacity" value={cap.toLocaleString('en-IN')} sub="from crowd + seats" />
              <Stat label="Expected" value={project.audience.toLocaleString('en-IN')} sub={cap >= project.audience ? 'fits' : 'over capacity'} />
              <Stat label="Venue area" value={`${fmt(project.venue.w * project.venue.l, 0)} m²`} />
              <Stat label="Exits" value={project.ground.filter((g) => g.kind === 'exit').length} />
            </div>
            <p className="text-[11px] text-mute leading-relaxed flex gap-1.5">
              <Tip text="Densities used: standing 2/m², seating 1 per 0.6 m², VIP 1/m². Check local fire-safety rules for your venue." />
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
