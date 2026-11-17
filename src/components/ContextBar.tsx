import { useRef, useState } from 'react'
import { ArrowDownToLine, Copy, Crosshair, FlipHorizontal2, ImageIcon, Maximize2, SlidersHorizontal, Trash2, Wand2, X } from 'lucide-react'
import { useStore } from '../store'
import { useDevice } from '../lib/device'
import { deleteSelection, duplicateSelection } from '../lib/actions'
import { fixAutoRig, fixGroundInside, fixTableInside, stageFit, stageKey } from '../lib/fixes'
import { runAlign, useAlignTargets } from './Align'
import { readImage } from '../workspaces/Decor'
import { nanoid } from 'nanoid'
import type { Project } from '../types'

// "Not now" on the stage suggestion lasts until the stage changes again.
const dismissed = new Map<string, string>()
const STAGE_WS = ['stage', 'led', 'truss']

type Act = { label: string; icon: React.ReactNode; run: () => void; tip?: string }

/** A small bar at the top of the canvas: actions for what is selected, and suggestions for the scene. */
export function ContextBar() {
  const project = useStore((s) => s.project)
  const ws = useStore((s) => s.ui.workspace)
  const sel = useStore((s) => s.ui.selection)
  const extra = useStore((s) => s.ui.extra.length)
  const compact = useDevice((d) => d.kind !== 'desktop')
  const targets = useAlignTargets(ws)
  const file = useRef<HTMLInputElement>(null)
  const [, bump] = useState(0)
  const { mutate, notify, select, setUI } = useStore.getState()

  const fit = STAGE_WS.includes(ws) ? stageFit(project) : null
  const showFit = fit && dismissed.get(project.id ?? '') !== stageKey(project)

  const acts: Act[] = []
  let title = ''
  if (sel) {
    const one = extra === 0
    const outside = (r: { x: number; y: number; w: number; h: number }) => r.x < -0.01 || r.y < -0.01 || r.x + r.w > project.venue.w + 0.01 || r.y + r.h > project.venue.l + 0.01
    if (sel.kind === 'screen' && one) {
      const s = project.screens.find((x) => x.id === sel.id)
      if (s) {
        title = s.name
        acts.push({ label: 'Content', icon: <ImageIcon size={13} />, tip: 'Show a picture on this screen in 3D', run: () => file.current?.click() })
        if (!s.mirrorOf && !project.screens.some((x) => x.mirrorOf === s.id))
          acts.push({
            label: 'Mirror',
            icon: <FlipHorizontal2 size={13} />,
            tip: 'Add a matching screen on the other side; it follows this one',
            run: () => mutate((p) => void p.screens.push({ ...structuredClone(s), id: nanoid(8), name: `${s.name} MIRROR`, mirrorOf: s.id })),
          })
      }
    }
    if (sel.kind === 'ground' && one) {
      const g = project.ground.find((x) => x.id === sel.id)
      if (g) {
        title = g.label
        if (outside(g)) acts.push({ label: 'Move inside', icon: <Maximize2 size={13} />, run: () => mutate((p) => fixGroundInside(g.id).apply(p)) })
      }
    }
    if (sel.kind === 'table' && one) {
      const t = project.tables.find((x) => x.id === sel.id)
      if (t) {
        title = t.kind === 'row' ? t.label : `Table ${t.label}`
        const r = Math.max(t.w, t.l) / 2
        if (outside({ x: t.x - r, y: t.y - r, w: r * 2, h: r * 2 })) acts.push({ label: 'Move inside', icon: <Maximize2 size={13} />, run: () => mutate((p) => fixTableInside(t.id).apply(p)) })
      }
    }
    if (sel.kind === 'truss' && one) {
      title = 'Truss'
      acts.push({ label: 'Auto-rig', icon: <Wand2 size={13} />, tip: 'Place hoists so every point is within its rating', run: () => mutate((p) => fixAutoRig.apply(p)) })
    }
    if (sel.kind === 'deck') title = one ? 'Stage deck' : `${extra + 1} decks`
    if (sel.kind === 'decor' && one) title = project.decor?.find((x) => x.id === sel.id)?.label ?? 'Decor'
    if (sel.kind === 'set' && one) title = 'Set piece'
    if (sel.kind === 'fixture' && one) title = 'Light / speaker'
    if (!title) title = `${extra + 1} items`
    // Placement helpers for things that stand on the floor or stage.
    if (targets.length && ['decor', 'set'].includes(sel.kind)) {
      acts.push({ label: 'Floor', icon: <ArrowDownToLine size={13} />, tip: 'Drop to the ground', run: () => runAlign(targets, 'floor') })
      acts.push({ label: 'Centre', icon: <Crosshair size={13} />, tip: 'Centre on the stage', run: () => runAlign(targets, 'stage-centre') })
    }
    acts.push({ label: 'Duplicate', icon: <Copy size={13} />, tip: 'Duplicate (Ctrl+D)', run: duplicateSelection })
    if (compact) acts.push({ label: 'Settings', icon: <SlidersHorizontal size={13} />, run: () => setUI({ panel: 'right' }) })
    acts.push({ label: 'Delete', icon: <Trash2 size={13} />, tip: 'Delete (Del)', run: deleteSelection })
  }

  if (!sel && !showFit) return null
  return (
    <div className="flex flex-col items-start gap-1.5 min-w-0 max-w-full pointer-events-none">
      {sel && (
        <div className="glass rounded-xl flex items-center gap-0.5 p-1 pointer-events-auto max-w-full overflow-x-auto no-scrollbar" role="toolbar" aria-label={`Actions for ${title}`}>
          <span className="px-2 text-[11px] font-medium truncate max-w-[160px]">{title}</span>
          {acts.map((a) => (
            <button key={a.label} className={`btn h-7 px-2 text-[11px] shrink-0 ${a.label === 'Delete' ? 'hover:text-err' : ''}`} title={a.tip ?? a.label} onClick={a.run}>
              {a.icon}
              <span className="hidden md:inline">{a.label}</span>
            </button>
          ))}
          <button className="btn btn-icon h-7 w-7 shrink-0" title="Deselect (Esc)" aria-label="Deselect" onClick={() => select(null)}>
            <X size={13} />
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f || sel?.kind !== 'screen') return
              try {
                const img = await readImage(f)
                mutate((p) => void (p.screens.find((x) => x.id === sel.id)!.image = img))
                notify('Picture set on the screen · see it in 3D')
              } catch {
                notify('Could not read that picture. Try a JPG or PNG.')
              }
            }}
          />
        </div>
      )}
      {/* The suggestion waits while something is selected, so it never stacks over the canvas tools. */}
      {!sel && showFit && fit && <StageFitCard fit={fit} project={project} onDismiss={() => (dismissed.set(project.id ?? '', stageKey(project)), bump((n) => n + 1))} />}
    </div>
  )
}

function StageFitCard({ fit, project, onDismiss }: { fit: NonNullable<ReturnType<typeof stageFit>>; project: Project; onDismiss: () => void }) {
  const [open, setOpen] = useState(false)
  const { mutate, notify } = useStore.getState()
  return (
    <div className="glass rounded-xl p-2 pointer-events-auto text-[11px] max-w-md fade-in" role="status">
      <div className="flex items-center gap-2">
        <Wand2 size={13} className="shrink-0" aria-hidden />
        <span className="flex-1">The stage changed. Keep the screens and truss in step with it?</span>
        <button className="btn h-7 text-[11px]" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Preview'}
        </button>
        <button
          className="btn btn-primary h-7 text-[11px]"
          onClick={() => {
            mutate((p) => fit.apply(p))
            notify('Screens and truss fitted to the stage · Ctrl+Z to undo')
          }}
        >
          Apply
        </button>
        <button className="btn btn-icon h-7 w-7" title="Not now" aria-label={`Dismiss suggestion for ${project.name}`} onClick={onDismiss}>
          <X size={12} />
        </button>
      </div>
      {open && (
        <ul className="mt-2 ml-5 space-y-0.5 text-dim list-disc">
          {fit.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
