import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Copy, FolderOpen, HelpCircle, Home as HomeIcon, Keyboard, Magnet, MousePointer2, Hand, Plus, Redo2, Ruler, Save, Undo2 } from 'lucide-react'
import { redo, saveNow, undo, useStore } from './store'
import type { Workspace } from './types'
import { fmt, totals } from './lib/calc'
import { getWarnings } from './lib/warnings'
import { readProjectFile, readShareHash } from './lib/export/files'
import { generateProject, EVENT_TYPES, TEMPLATES, type EventType, type WizardInput } from './lib/templates'
import { LedWorkspace, newScreen } from './workspaces/Led'
import { GroundWorkspace } from './workspaces/Ground'
import { StageWorkspace } from './workspaces/Stage'
import { TrussWorkspace } from './workspaces/Truss'
import { DeliverWorkspace } from './workspaces/Deliver'
import { Check, Modal, Num, Seg, Sel, Txt } from './components/ui'
import { Home } from './components/Home'
import { Guide } from './components/Guide'
import { nanoid } from 'nanoid'

// The 3D engine is large, so it loads only when someone opens a 3D view.
const Viz3DWorkspace = lazy(() => import('./workspaces/Viz3D').then((m) => ({ default: m.Viz3DWorkspace })))
const Viewer = lazy(() => import('./workspaces/Viz3D').then((m) => ({ default: m.Viewer })))

function Loading3D() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-xs text-mute">
      <div className="h-6 w-6 rounded-full border-2 border-line border-t-white animate-spin" />
      Loading 3D engine…
    </div>
  )
}

const TABS: { id: Workspace; label: string; short: string; kicker: string }[] = [
  { id: 'ground', label: 'Ground Plan', short: 'Ground', kicker: '01' },
  { id: 'stage', label: 'Stage', short: 'Stage', kicker: '02' },
  { id: 'truss', label: 'Truss & Rigging', short: 'Truss', kicker: '03' },
  { id: 'led', label: 'LED Screens', short: 'LED', kicker: '04' },
  { id: 'viz', label: '3D Visualizer', short: '3D', kicker: '05' },
  { id: 'deliver', label: 'Deliver', short: 'Deliver', kicker: '06' },
]

export default function App() {
  const [shared] = useState(() => readShareHash())
  if (shared) return <SharedView />
  return <Studio />
}

function SharedView() {
  const [p, setP] = useState(() => readShareHash())
  useEffect(() => {
    const h = () => setP(readShareHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  if (!p) return <div className="h-full flex items-center justify-center text-dim text-sm">This link is broken or incomplete.</div>
  return (
    <div className="h-full flex flex-col">
      <header className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-line">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="w-px h-5 bg-line" />
          <div className="text-sm font-medium truncate">{p.name}</div>
        </div>
        <div className="text-[11px] text-mute hidden sm:block">Interactive 3D preview · designed with Unifest Studios</div>
      </header>
      <div className="flex-1 min-h-0">
        <Suspense fallback={<Loading3D />}>
          <Viewer project={p} compact />
        </Suspense>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="h-7 w-7 rounded-lg bg-white text-black flex items-center justify-center font-display font-bold text-sm">U</div>
      <div className="leading-none">
        <div className="font-display font-semibold text-[13px] tracking-tight">UNIFEST</div>
        <div className="text-[8px] tracking-[0.3em] text-mute">STUDIOS</div>
      </div>
    </div>
  )
}

function Studio() {
  const ui = useStore((s) => s.ui)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const r = () => setNarrow(window.innerWidth < 1024)
    window.addEventListener('resize', r)
    return () => window.removeEventListener('resize', r)
  }, [])
  useShortcuts()

  if (narrow) return <DesktopGate />
  if (ui.home)
    return (
      <>
        <Home />
        {ui.wizardOpen && <Wizard />}
        {ui.toast && <Toast msg={ui.toast} />}
      </>
    )
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="relative flex-1 min-h-0">
        {ui.workspace === 'ground' && <GroundWorkspace />}
        {ui.workspace === 'stage' && <StageWorkspace />}
        {ui.workspace === 'truss' && <TrussWorkspace />}
        {ui.workspace === 'led' && <LedWorkspace />}
        {ui.workspace === 'viz' && (
          <Suspense fallback={<Loading3D />}>
            <Viz3DWorkspace />
          </Suspense>
        )}
        {ui.workspace === 'deliver' && <DeliverWorkspace />}
        {['ground', 'stage', 'truss', 'led'].includes(ui.workspace) && <Hud />}
        {['ground', 'stage', 'truss', 'led'].includes(ui.workspace) && <ToolRail />}
        <Guide />
      </div>
      <WarningsBar />
      {ui.wizardOpen && <Wizard />}
      {ui.shortcutsOpen && <Shortcuts />}
      {ui.toast && <Toast msg={ui.toast} />}
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div role="status" className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-white text-black text-xs font-medium px-4 py-2 fade-in shadow-2xl">
      {msg}
    </div>
  )
}

function DesktopGate() {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-sm text-center fade-in">
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Design on desktop.</h1>
        <p className="text-sm text-dim mt-2 leading-relaxed">Unifest Studios is a precision design tool. Open it on a laptop or desktop (1024 px or wider) to design stages, truss, LED screens and ground plans.</p>
        <button className="btn btn-primary mt-6" onClick={() => navigator.clipboard?.writeText(location.href)}>
          Copy link for desktop
        </button>
        <p className="text-[11px] text-mute mt-4">Client 3D links open fine on phones.</p>
      </div>
    </div>
  )
}

function TopBar() {
  const ui = useStore((s) => s.ui)
  const project = useStore((s) => s.project)
  const { setUI, mutate, notify, setProject } = useStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState(false)
  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-line bg-ink">
      <button title="All projects" onClick={() => (saveNow(), setUI({ home: true, wizardOpen: false }))}>
        <Logo />
      </button>
      <div className="w-px h-6 bg-line" />
      <input
        className="bg-transparent text-sm font-medium w-32 xl:w-44 rounded-md px-2 h-8 border border-transparent hover:border-line focus:border-white outline-none"
        value={project.name}
        onChange={(e) => mutate((p) => void (p.name = e.target.value))}
        aria-label="Project name"
      />
      <nav className="flex items-center gap-0.5 rounded-xl border border-line p-1 mx-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setUI({ workspace: t.id, tool: 'select' })}
            className={`h-8 px-2.5 xl:px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${ui.workspace === t.id ? 'bg-white text-black' : 'text-dim hover:text-white hover:bg-lift'}`}
          >
            <span className={`mono text-[9px] hidden xl:inline ${ui.workspace === t.id ? 'text-black/50' : 'text-mute'}`}>{t.kicker}</span>
            <span className="hidden xl:inline">{t.label}</span>
            <span className="xl:hidden">{t.short}</span>
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-1.5">
        <div className="w-36">
          <Seg
            value={ui.mode}
            onChange={(mode) => setUI({ mode, overlay: mode === 'simple' ? 'none' : ui.overlay })}
            options={[
              { value: 'simple', label: 'Simple' },
              { value: 'pro', label: 'Pro' },
            ]}
          />
        </div>
        <button className="btn btn-icon" title="Undo (Ctrl+Z)" onClick={undo}>
          <Undo2 size={14} />
        </button>
        <button className="btn btn-icon" title="Redo (Ctrl+Shift+Z)" onClick={redo}>
          <Redo2 size={14} />
        </button>
        <div className="relative">
          <button className="btn" onClick={() => setMenu(!menu)}>
            File <ChevronDown size={12} />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-40 w-56 card p-1 fade-in" onMouseLeave={() => setMenu(false)}>
              <MenuItem icon={<HomeIcon size={13} />} label="All projects" onClick={() => (saveNow(), setUI({ home: true }), setMenu(false))} />
              <MenuItem icon={<Plus size={13} />} label="New event…" onClick={() => (setUI({ wizardOpen: true }), setMenu(false))} />
              <MenuItem
                icon={<Copy size={13} />}
                label="Duplicate project"
                onClick={() => {
                  saveNow()
                  setProject({ ...structuredClone(project), id: undefined, name: `${project.name} copy`, updatedAt: Date.now() })
                  notify('Duplicated. You are now editing the copy.')
                  setMenu(false)
                }}
              />
              <MenuItem icon={<FolderOpen size={13} />} label="Open .unifest file…" onClick={() => (file.current?.click(), setMenu(false))} />
              <MenuItem icon={<Save size={13} />} label="Save to this browser" hint="Ctrl+S" onClick={() => (saveNow() ? notify('Saved') : notify('Could not save: storage blocked'), setMenu(false))} />
              <div className="h-px bg-line my-1" />
              <Sel
                label="Units"
                value={project.units}
                onChange={(units) => mutate((p) => void (p.units = units))}
                options={[
                  { value: 'm', label: 'Metres' },
                  { value: 'ft', label: 'Feet (display)' },
                ]}
              />
            </div>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept=".unifest,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            readProjectFile(f)
              .then((p) => (setProject({ ...p, id: undefined }), notify(`Opened ${p.name}`)))
              .catch((err) => notify(err.message))
            e.target.value = ''
          }}
        />
        <button className="btn btn-icon" title="Show the guide for this workspace" onClick={() => setUI({ guideOpen: true })}>
          <HelpCircle size={14} />
        </button>
        <button className="btn btn-icon" title="Keyboard shortcuts (?)" onClick={() => setUI({ shortcutsOpen: true })}>
          <Keyboard size={14} />
        </button>
        <button className="btn btn-primary" onClick={() => setUI({ workspace: 'deliver' })}>
          Deliver
        </button>
      </div>
    </header>
  )
}

function MenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button className="w-full flex items-center gap-2 px-3 h-8 rounded-md text-xs hover:bg-lift text-left" onClick={onClick}>
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="mono text-[10px] text-mute">{hint}</span>}
    </button>
  )
}

function Hud() {
  const project = useStore((s) => s.project)
  const t = totals(project)
  // [label, value, shown only on wide screens]
  const items: [string, string, boolean?][] = [
    ['Total pixels', `${t.pxW} × ${t.pxH}`],
    ['LED area', `${fmt(t.ledArea, 1)} m²`, true],
    ['Stage', t.stage, true],
    ['Weight', `${Math.round(t.weight).toLocaleString('en-IN')} kg`],
    ['Power', `${fmt(t.powerKw, 1)} kW`],
    ['Capacity', `${t.capacity.toLocaleString('en-IN')}`, true],
  ]
  const ws = useStore((s) => s.ui.workspace)
  const left = ws === 'led' || ws === 'ground' || ws === 'stage' || ws === 'truss' ? 'left-[272px]' : 'left-4'
  return (
    <div className={`absolute top-4 ${left} z-10 glass rounded-xl flex divide-x divide-line pointer-events-none`}>
      {items.map(([k, v, wide]) => (
        <div key={k} className={`px-3 py-1.5 ${wide ? 'hidden 2xl:block' : ''}`}>
          <div className="text-[9px] tracking-widest uppercase text-mute font-semibold">{k}</div>
          <div className="mono text-[13px] font-medium whitespace-nowrap">{v}</div>
        </div>
      ))}
    </div>
  )
}

function ToolRail() {
  const ui = useStore((s) => s.ui)
  const { setUI } = useStore.getState()
  const tools: { id: typeof ui.tool; icon: React.ReactNode; tip: string }[] = [
    { id: 'select', icon: <MousePointer2 size={15} />, tip: 'Select (V)' },
    { id: 'pan', icon: <Hand size={15} />, tip: 'Pan (H, or hold Space)' },
    { id: 'measure', icon: <Ruler size={15} />, tip: 'Measure (D)' },
  ]
  return (
    <div className="absolute right-[336px] top-1/2 -translate-y-1/2 z-10 glass rounded-xl flex flex-col gap-1 p-1">
      {tools.map((t) => (
        <button key={t.id} className={`btn btn-icon ${ui.tool === t.id ? 'btn-on' : ''}`} title={t.tip} onClick={() => setUI({ tool: t.id })}>
          {t.icon}
        </button>
      ))}
      <div className="h-px bg-line mx-1" />
      <button className={`btn btn-icon ${ui.magnet ? 'btn-on' : ''}`} title="Magnet / smart snap (M)" onClick={() => setUI({ magnet: !ui.magnet })}>
        <Magnet size={15} />
      </button>
    </div>
  )
}

function WarningsBar() {
  const project = useStore((s) => s.project)
  const open = useStore((s) => s.ui.warningsOpen)
  const { setUI, select } = useStore.getState()
  const w = getWarnings(project)
  const errors = w.filter((x) => x.level === 'error').length
  return (
    <>
      {open && (
        <div className="absolute bottom-10 left-0 right-0 z-30 max-h-72 overflow-y-auto border-t border-line bg-panel fade-in">
          {w.length === 0 && <div className="px-5 py-4 text-xs text-dim">No issues found. Your plan passes every automatic check.</div>}
          {w.map((x, i) => (
            <button
              key={i}
              className="w-full flex items-start gap-3 px-5 py-2.5 border-b border-line text-left hover:bg-raised"
              onClick={() => {
                setUI({ workspace: x.workspace, warningsOpen: false })
                if (x.target) select(x.target)
              }}
            >
              <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${x.level === 'error' ? 'bg-err' : 'bg-warn'}`} />
              <span className="flex-1">
                <span className="text-xs">{x.text}</span>
                {x.fix && <span className="block text-[11px] text-mute">{x.fix}</span>}
              </span>
              <span className="text-[10px] text-mute uppercase tracking-wider">{TABS.find((t) => t.id === x.workspace)?.label}</span>
            </button>
          ))}
        </div>
      )}
      <footer className="h-10 shrink-0 border-t border-line flex items-center justify-between px-4 text-[11px] bg-ink">
        <button className="flex items-center gap-2 text-dim hover:text-white" onClick={() => setUI({ warningsOpen: !open })}>
          {w.length ? <AlertTriangle size={13} className={errors ? 'text-err' : 'text-warn'} /> : <span className="h-2 w-2 rounded-full bg-white" />}
          {w.length ? `${errors} errors · ${w.length - errors} warnings` : 'All checks passed'}
        </button>
        <span className="text-mute">Autosaved in this browser · {project.eventType} · {project.audience.toLocaleString('en-IN')} guests</span>
      </footer>
    </>
  )
}

function Wizard() {
  const { setUI, setProject, notify } = useStore.getState()
  const [inp, setInp] = useState<WizardInput>({ name: 'My event', eventType: 'College Fest', audience: 1500, venueW: 50, venueL: 70, outdoor: true })
  const create = (w: WizardInput) => {
    setProject(generateProject(w))
    setUI({ wizardOpen: false, home: false, workspace: 'ground' })
    useStore.temporal.getState().clear()
    notify('Starter layout generated. Every part is editable.')
  }
  return (
    <Modal title="New event" onClose={() => setUI({ wizardOpen: false })} wide>
      <div className="grid grid-cols-5 gap-8">
        <div className="col-span-2 space-y-3">
          <div className="label">Tell us about your event</div>
          <Txt label="Event name" value={inp.name} onChange={(name) => setInp({ ...inp, name })} />
          <Sel label="Event type" value={inp.eventType} onChange={(eventType) => setInp({ ...inp, eventType: eventType as EventType })} options={EVENT_TYPES.map((e) => ({ value: e, label: e }))} />
          <Num label="Expected audience" value={inp.audience} onChange={(audience) => setInp({ ...inp, audience })} int step={100} min={20} />
          <div className="grid grid-cols-2 gap-2">
            <Num label="Venue width" value={inp.venueW} onChange={(venueW) => setInp({ ...inp, venueW })} unit="m" step={5} min={10} />
            <Num label="Venue length" value={inp.venueL} onChange={(venueL) => setInp({ ...inp, venueL })} unit="m" step={5} min={10} />
          </div>
          <Check label="Outdoor venue" checked={inp.outdoor} onChange={(outdoor) => setInp({ ...inp, outdoor })} />
          <button className="btn btn-primary w-full justify-center h-10" onClick={() => create(inp)}>
            Generate my layout
          </button>
          <button
            className="btn w-full justify-center"
            onClick={() => {
              setProject({ ...generateProject(inp), screens: [], truss: [], hoists: [], fixtures: [], decks: [], ground: [] })
              useStore.temporal.getState().clear()
              setUI({ wizardOpen: false, home: false, workspace: 'ground' })
            }}
          >
            Start blank
          </button>
        </div>
        <div className="col-span-3">
          <div className="label mb-3">Or start from a template</div>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} className="text-left rounded-xl border border-line p-3 hover:border-white transition-colors" onClick={() => create(t)}>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-[11px] text-mute mt-0.5 leading-snug">{t.blurb}</div>
                <div className="mono text-[10px] text-dim mt-2">
                  {t.audience.toLocaleString('en-IN')} ppl · {t.venueW}×{t.venueL} m
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Shortcuts() {
  const { setUI } = useStore.getState()
  const rows: [string, string][] = [
    ['V', 'Select'],
    ['H / hold Space', 'Pan'],
    ['D', 'Measure'],
    ['B', 'Paint empty LED panels'],
    ['M', 'Magnet snap on/off'],
    ['F', 'Fit to view'],
    ['+ / −', 'Zoom'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+D', 'Duplicate selected screen'],
    ['Delete', 'Delete selection'],
    ['Ctrl+S', 'Save'],
    ['1 – 6', 'Switch workspace'],
  ]
  return (
    <Modal title="Keyboard shortcuts" onClose={() => setUI({ shortcutsOpen: false })}>
      <div className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-2 text-xs">
            <span className="text-dim">{v}</span>
            <span className="mono">{k}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return
      const { ui, setUI, mutate, select, notify, project } = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? redo() : undo()
      }
      if (mod && e.key.toLowerCase() === 'y') return (e.preventDefault(), redo())
      if (mod && e.key.toLowerCase() === 's') return (e.preventDefault(), notify(saveNow() ? 'Saved' : 'Could not save'))
      if (mod && e.key.toLowerCase() === 'd' && ui.selection?.kind === 'screen') {
        e.preventDefault()
        const s = project.screens.find((x) => x.id === ui.selection!.id)
        if (s) mutate((p) => void p.screens.push({ ...s, id: nanoid(8), name: `${s.name} COPY`, x: s.x + 1, mirrorOf: undefined }))
        return
      }
      if (mod) return
      const k = e.key.toLowerCase()
      if (k === 'v') setUI({ tool: 'select' })
      if (k === 'h') setUI({ tool: 'pan' })
      if (k === 'd') setUI({ tool: ui.tool === 'measure' ? 'select' : 'measure' })
      if (k === 'm') setUI({ magnet: !ui.magnet })
      if (k === 'b' && ui.workspace === 'led') setUI({ tool: ui.tool === 'paint' ? 'select' : 'paint' })
      if (k === '?') setUI({ shortcutsOpen: true })
      if (k === 'escape') setUI({ tool: 'select' })
      if (/^[1-6]$/.test(k)) setUI({ workspace: TABS[Number(k) - 1].id, tool: 'select' })
      if ((k === 'delete' || k === 'backspace') && ui.selection) {
        const { kind, id } = ui.selection
        mutate((p) => {
          if (kind === 'screen') p.screens = p.screens.filter((s) => s.id !== id && s.mirrorOf !== id)
          if (kind === 'ground') p.ground = p.ground.filter((g) => g.id !== id)
          if (kind === 'deck') p.decks = p.decks.filter((d) => d.id !== id)
          if (kind === 'truss') p.truss = p.truss.filter((t) => t.id !== id)
          if (kind === 'hoist') p.hoists = p.hoists.filter((h) => h.id !== id)
        })
        select(null)
      }
      if (k === 'n' && ui.workspace === 'led') mutate((p) => void p.screens.push(newScreen(p)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

