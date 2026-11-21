import { ContextBar } from './components/ContextBar'
import { deleteSelection, duplicateSelection, nudgeSelection, selectAll } from './lib/actions'
import { SavePoints } from './components/SavePoints'
import { exportProject } from './lib/export/files'
import { loadSummary } from './lib/loads'
import { AppCrash, ErrorBoundary, retryImport, Safe3D } from './components/Safe3D'
import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CompanyPanel } from './components/SiteSections'
import { ThemeToggle } from './components/ThemeToggle'
import { ThemeButton } from './components/ThemePicker'
import { Info, Shapes, AlertTriangle, Armchair, Castle, ClipboardList, Sparkles, Box, ChevronDown, Map as MapIcon, MonitorPlay, Send, Spline, Square, Copy, FolderOpen, HelpCircle, History, Home as HomeIcon, Keyboard, Magnet, PanelLeft, PanelRight, MoreHorizontal, MousePointer2, Hand, Plus, Redo2, Ruler, Save, Trash2, Undo2, Volume2 } from 'lucide-react'
import { redo, saveNow, undo, useSave, useStore } from './store'
import type { Project, Workspace } from './types'
import { fmt, totals } from './lib/calc'
import { getWarnings } from './lib/warnings'
import { readProjectFile, readShareHash } from './lib/export/files'
import { fetchShare, shareCodeFromPath, useAuth } from './lib/cloud'
import { AccountButton } from './components/Account'
import { generateProject, EVENT_TYPES, TEMPLATES, type EventType, type WizardInput } from './lib/templates'
import { LedWorkspace, newScreen } from './workspaces/Led'
import { SoundWorkspace } from './workspaces/Sound'
import { GroundWorkspace } from './workspaces/Ground'
import { StageWorkspace } from './workspaces/Stage'
import { TrussWorkspace } from './workspaces/Truss'
import { DeliverWorkspace } from './workspaces/Deliver'
import { SeatingWorkspace } from './workspaces/Seating'
import { DecorWorkspace } from './workspaces/Decor'
import { SetDesignWorkspace } from './workspaces/SetDesign'
import { PlanWorkspace } from './workspaces/Plan'
import { ClientFeedback } from './components/ClientFeedback'
import { seatCount } from './lib/seating'
import { Check, Modal, Num, Seg, Sel, Txt } from './components/ui'
import { Home } from './components/Home'
import { VenueFinder } from './components/VenueFinder'
import { Guide } from './components/Guide'
import { aiConfig, planToProject, readBrief, rulePlan } from './lib/brief'
import { THEMES } from './lib/themes'
import { useDevice, isCompact, type DevicePref } from './lib/device'

// The 3D engine is large, so it loads only when someone opens a 3D view.
const Viz3DWorkspace = lazy(() => retryImport(() => import('./workspaces/Viz3D')).then((m) => ({ default: m.Viz3DWorkspace })))
const ModelWorkspace = lazy(() => retryImport(() => import('./workspaces/Model')).then((m) => ({ default: m.ModelWorkspace })))
const Viewer = lazy(() => retryImport(() => import('./workspaces/Viz3D')).then((m) => ({ default: m.Viewer })))

function Loading3D() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-xs text-mute">
      <div className="h-6 w-6 rounded-full border-2 border-line border-t-white animate-spin" />
      Loading 3D engine…
    </div>
  )
}

const TABS: { id: Workspace; label: string; short: string; kicker: string; icon: typeof MapIcon; tip: string }[] = [
  { id: 'ground', label: 'Ground Plan', short: 'Ground', kicker: '01', icon: MapIcon, tip: 'Venue size, crowd areas, exits and facilities' },
  { id: 'stage', label: 'Stage', short: 'Stage', kicker: '02', icon: Square, tip: 'Build the stage from decks, risers and runways' },
  { id: 'set', label: 'Set Design', short: 'Set', kicker: '03', icon: Castle, tip: 'Festival facades: towers, frames, arches, LED, bulb outlines, cut-outs, themes' },
  { id: 'truss', label: 'Truss & Rigging', short: 'Truss', kicker: '04', icon: Spline, tip: 'Truss, hoists, lights and speakers, with live weights' },
  { id: 'led', label: 'LED Screens', short: 'LED', kicker: '05', icon: MonitorPlay, tip: 'Screen sizes, pixels, cabling and power' },
  { id: 'sound', label: 'Sound', short: 'Sound', kicker: '06', icon: Volume2, tip: 'Speakers, coverage map, delay towers, input list and monitor mixes' },
  { id: 'seating', label: 'Seating', short: 'Seats', kicker: '07', icon: Armchair, tip: 'Tables, chairs, guest list and meals' },
  { id: 'decor', label: 'Decor & FX', short: 'Decor', kicker: '08', icon: Sparkles, tip: 'Wedding decor, pyro, smoke, sponsor banners, your own 3D models' },
  { id: 'model', label: '3D Model', short: 'Model', kicker: '★', icon: Shapes, tip: 'Blender-style 3D modelling: shapes, spin, extrude, arrays, groups, materials' },
  { id: 'viz', label: '3D Visualizer', short: '3D', kicker: '09', icon: Box, tip: 'See everything in 3D, render images and videos' },
  { id: 'plan', label: 'Plan', short: 'Plan', kicker: '10', icon: ClipboardList, tip: 'Quotation with GST, run of show, crew, stock, permits and client feedback' },
  { id: 'deliver', label: 'Deliver', short: 'Deliver', kicker: '11', icon: Send, tip: 'Client link, PDF, CAD and spreadsheets' },
]

const EDIT_WS = ['ground', 'stage', 'set', 'truss', 'led', 'sound', 'seating', 'decor']

// Number keys 1-9 open these, in order (the Model tab is opened by clicking).
const KEYED = TABS.filter((t) => t.id !== 'model')

// The four steps of a job; every page belongs to one. The top bar shows the steps, and the pages of the current step.
const STEPS: { id: 'site' | 'build' | 'show' | 'deliver'; label: string; hint: string; tabs: Workspace[] }[] = [
  { id: 'site', label: 'Site', hint: 'The venue: size, site photo, crowd areas, exits and facilities', tabs: ['ground'] },
  { id: 'build', label: 'Build', hint: 'Stage, set, truss and lights, LED screens, sound, seating, decor and 3D models', tabs: ['stage', 'set', 'truss', 'led', 'sound', 'seating', 'decor', 'model'] },
  { id: 'show', label: 'Present', hint: 'See it in 3D, play the show, render images and videos', tabs: ['viz'] },
  { id: 'deliver', label: 'Deliver', hint: 'Quote, run of show, crew and permits; client link, PDF and files', tabs: ['plan', 'deliver'] },
]
const stepOf = (ws: Workspace) => STEPS.find((s) => s.tabs.includes(ws)) ?? STEPS[0]
// The page last used in each step, so going back to a step returns to it.
const lastTab: Partial<Record<(typeof STEPS)[number]['id'], Workspace>> = {}
useStore.subscribe((s) => void (lastTab[stepOf(s.ui.workspace).id] = s.ui.workspace))

export default function App() {
  const [shared] = useState(() => !!readShareHash() || !!shareCodeFromPath())
  if (shared) return <SharedView />
  return <Studio />
}

function SharedView() {
  const code = shareCodeFromPath()
  const [p, setP] = useState<Project | null>(() => (code ? null : readShareHash()))
  const [loading, setLoading] = useState(!!code)
  useEffect(() => {
    if (code) {
      // Short links fetch the latest version of the design each time they open.
      fetchShare(code)
        .then((x) => setP(x))
        .catch(() => setP(null))
        .finally(() => setLoading(false))
      return
    }
    const h = () => setP(readShareHash())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [code])
  if (loading) return <Loading3D />
  if (!p) return <div className="h-full flex items-center justify-center text-dim text-sm">This link is broken, incomplete or was removed by its owner.</div>
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
      <div className="flex-1 min-h-0 relative">
        <Safe3D>
          <Suspense fallback={<Loading3D />}>
            <Viewer project={p} compact />
          </Suspense>
        </Safe3D>
        {code && <ClientFeedback code={code} />}
      </div>
    </div>
  )
}

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="h-7 w-7 rounded-lg bg-white text-black flex items-center justify-center font-display font-bold text-sm">U</div>
      <div className="leading-none logo-text">
        <div className="font-display font-semibold text-[13px] tracking-tight">UNIFEST</div>
        <div className="text-[8px] tracking-[0.3em] text-mute">STUDIOS</div>
      </div>
    </div>
  )
}

function Studio() {
  const ui = useStore((s) => s.ui)
  const device = useDevice((s) => s.kind)
  const compact = isCompact(device)
  useShortcuts()
  // Phones and tablets show the side panels as drawers; CSS reads html[data-panel].
  useEffect(() => {
    document.documentElement.dataset.panel = compact && ui.panel ? ui.panel : ''
  }, [compact, ui.panel])
  // Picking something on a small screen opens its properties; switching workspace closes drawers.
  useEffect(() => {
    if (compact && ui.selection) useStore.getState().setUI({ panel: 'right' })
  }, [compact, ui.selection])
  useEffect(() => {
    useStore.getState().setUI({ panel: null })
  }, [ui.workspace])

  if (ui.home)
    return (
      <>
        <Home />
        {ui.venuesOpen && <Venues />}
        {ui.wizardOpen && <Wizard />}
        {ui.toast && <Toast msg={ui.toast} />}
      </>
    )
  return (
    <div className="h-full flex flex-col">
      <TopBar />
      <div className="relative flex-1 min-h-0">
        <ErrorBoundary key={ui.workspace} where={`workspace ${ui.workspace}`} fallback={(_, reset) => <AppCrash onHome={() => (useStore.getState().setUI({ workspace: 'ground' }), reset())} />}>
        {ui.workspace === 'ground' && <GroundWorkspace />}
        {ui.workspace === 'stage' && <StageWorkspace />}
        {ui.workspace === 'truss' && <TrussWorkspace />}
        {ui.workspace === 'led' && <LedWorkspace />}
        {ui.workspace === 'sound' && <SoundWorkspace />}
        {ui.workspace === 'seating' && <SeatingWorkspace />}
        {ui.workspace === 'viz' && (
          <Safe3D onExit={() => useStore.getState().setUI({ workspace: 'ground' })} exitLabel="Back to Ground plan">
            <Suspense fallback={<Loading3D />}>
              <Viz3DWorkspace />
            </Suspense>
          </Safe3D>
        )}
        {ui.workspace === 'decor' && <DecorWorkspace />}
        {ui.workspace === 'model' && (
          <Safe3D onExit={() => useStore.getState().setUI({ workspace: 'set' })} exitLabel="Back to Set Design">
            <Suspense fallback={<Loading3D />}>
              <ModelWorkspace />
            </Suspense>
          </Safe3D>
        )}
        {ui.workspace === 'set' && <SetDesignWorkspace />}
        {ui.workspace === 'plan' && <PlanWorkspace />}
        {ui.workspace === 'deliver' && <DeliverWorkspace />}
        </ErrorBoundary>
        {EDIT_WS.includes(ui.workspace) && <TopStrip />}
        {['ground', 'stage', 'set', 'truss', 'led', 'seating', 'decor'].includes(ui.workspace) && <ToolRail />}
        {compact && ['ground', 'stage', 'set', 'truss', 'led', 'seating', 'decor', 'model'].includes(ui.workspace) && <PanelToggles />}
        <Guide />
      </div>
      <WarningsBar />
      {ui.venuesOpen && <Venues />}
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

// From the home screen a picked space starts a new event; inside a project it resizes the venue.
function Venues() {
  const home = useStore((s) => s.ui.home)
  const { setUI, mutate, notify } = useStore.getState()
  return (
    <VenueFinder
      onClose={() => setUI({ venuesOpen: false })}
      onPick={(v, r) => {
        const cap = r.banquet || r.theatre || r.standing
        if (home) {
          setUI({ venuesOpen: false, wizardOpen: true, wizardPrefill: { name: `${v.name} event`, venueW: r.w, venueL: r.l, outdoor: !v.indoor, ...(cap ? { audience: cap } : {}) } })
          return
        }
        mutate((p) => {
          p.venue.w = r.w
          p.venue.l = r.l
        })
        setUI({ venuesOpen: false })
        notify(`Venue set to ${v.name} · ${r.name}: ${r.w} × ${r.l} m`)
      }}
    />
  )
}

function PanelToggles() {
  const panel = useStore((s) => s.ui.panel)
  const ws = useStore((s) => s.ui.workspace)
  const { setUI } = useStore.getState()
  const phone = useDevice((d) => d.kind === 'phone')
  if (phone && panel)
    return (
      <button className="btn fixed left-1/2 -translate-x-1/2 z-40 shadow-2xl" style={{ bottom: 'calc(62vh + 48px)' }} onClick={() => setUI({ panel: null })}>
        <ChevronDown size={14} /> Close panel
      </button>
    )
  const left = ws === 'ground' ? 'Add items' : ws === 'led' ? 'Screens' : ws === 'seating' ? 'Tables' : 'Add'
  return (
    <div className="absolute left-3 bottom-3 z-20 glass rounded-xl flex gap-1 p-1">
      <button className={`btn ${panel === 'left' ? 'btn-on' : ''}`} onClick={() => setUI({ panel: panel === 'left' ? null : 'left' })}>
        <PanelLeft size={14} /> {left}
      </button>
      <button className={`btn ${panel === 'right' ? 'btn-on' : ''}`} onClick={() => setUI({ panel: panel === 'right' ? null : 'right' })}>
        <PanelRight size={14} /> Properties
      </button>
    </div>
  )
}

const LAYOUTS: { value: DevicePref; label: string }[] = [
  { value: 'auto', label: 'Auto (fit this device)' },
  { value: 'phone', label: 'Phone' },
  { value: 'tablet', label: 'Tablet / iPad' },
  { value: 'desktop', label: 'Desktop' },
]

function TopBar() {
  const ui = useStore((s) => s.ui)
  const project = useStore((s) => s.project)
  const { setUI, mutate, notify, setProject } = useStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState(false)
  const [help, setHelp] = useState(false)
  const [company, setCompany] = useState(false)
  const [points, setPoints] = useState(false)
  const device = useDevice((s) => s.kind)
  const pref = useDevice((s) => s.pref)
  const phone = device === 'phone'
  const desktop = device === 'desktop'
  const modeSeg = (
    <Seg
      value={ui.mode}
      onChange={(mode) => setUI({ mode, overlay: mode === 'simple' ? 'none' : ui.overlay })}
      options={[
        { value: 'simple', label: 'Simple' },
        { value: 'pro', label: 'Pro' },
      ]}
    />
  )
  const step = stepOf(ui.workspace)
  const go = (ws: Workspace) => setUI({ workspace: ws, tool: 'select' })
  // ① Site → ② Build → ③ Present → ④ Deliver: the whole job in four steps, always visible.
  const steps = (
    <nav className={`flex items-center gap-1 ${desktop ? 'mx-auto' : 'w-max mx-auto'}`} aria-label="Steps">
      {STEPS.map((st, i) => {
        const on = st.id === step.id
        return (
          <div key={st.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-mute text-[10px]" aria-hidden>→</span>}
            <button
              onClick={() => go(lastTab[st.id] ?? st.tabs[0])}
              title={st.hint}
              aria-current={on ? 'step' : undefined}
              className={`h-8 pl-1.5 pr-3 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors ${on ? 'bg-white text-black' : 'text-dim hover:text-white hover:bg-lift'}`}
            >
              <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] font-bold ${on ? 'bg-black text-white' : 'bg-lift text-dim'}`}>{i + 1}</span>
              {st.label}
            </button>
          </div>
        )
      })}
    </nav>
  )
  // The pages of the current step, each with its name; the active page's purpose is spelled out beside them.
  const tab = TABS.find((t) => t.id === ui.workspace)
  const pages = (
    <div className={`flex items-center gap-2 ${phone ? 'px-2' : 'px-4'} h-10 border-t border-line`}>
      <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar" aria-label={`${step.label} pages`}>
        {step.tabs.map((id) => {
          const t = TABS.find((x) => x.id === id)!
          return (
            <button
              key={id}
              onClick={() => go(id)}
              title={KEYED.includes(t) ? `${t.tip} (${KEYED.indexOf(t) + 1})` : t.tip}
              className={`h-7 px-2.5 rounded-lg text-xs whitespace-nowrap transition-colors flex items-center gap-1.5 ${ui.workspace === id ? 'bg-lift text-white font-medium' : 'text-dim hover:text-white hover:bg-lift'}`}
            >
              <t.icon size={13} className={ui.workspace === id ? '' : 'text-mute'} />
              <span className="hidden xl:inline">{t.label}</span>
              <span className="xl:hidden">{t.short}</span>
            </button>
          )
        })}
      </nav>
      {tab && !phone && <span className="text-[11px] text-mute truncate min-w-0 hidden 2xl:inline">· {tab.tip}</span>}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {(step.id === 'build' || step.id === 'show') && <ThemeButton />}
        {!phone && <div className="w-32" title="Simple shows the essentials; Pro shows every setting">{modeSeg}</div>}
      </div>
    </div>
  )
  return (
    <header className="shrink-0 border-b border-line bg-ink" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
    <div className={`h-14 flex items-center ${phone ? 'gap-1.5 px-2' : 'gap-3 px-4'}`}>
      <button title="All projects" onClick={() => (saveNow(), setUI({ home: true, wizardOpen: false }))}>
        <Logo />
      </button>
      {!phone && <div className="w-px h-6 bg-line" />}
      <input
        className={`bg-transparent text-sm font-medium ${phone ? 'flex-1 min-w-0' : 'w-32 shrink-0 2xl:w-44'} rounded-md px-2 h-8 border border-transparent hover:border-line focus:border-white outline-none`}
        value={project.name}
        onChange={(e) => mutate((p) => void (p.name = e.target.value))}
        aria-label="Project name"
      />
      {desktop ? steps : <div className="flex-1" />}
      <div className={`flex items-center gap-1.5 shrink-0 ${phone ? 'ml-auto' : ''}`}>
        <button className="btn btn-icon" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}>
          <Undo2 size={14} />
        </button>
        <button className="btn btn-icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}>
          <Redo2 size={14} />
        </button>
        <div className="relative">
          {points && <SavePoints onClose={() => setPoints(false)} />}
          <button className="btn" onClick={() => (setMenu(!menu), setHelp(false))} aria-expanded={menu}>
            {phone ? <MoreHorizontal size={14} /> : <>File <ChevronDown size={12} /></>}
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-40 w-56 card p-1 fade-in" onMouseLeave={() => setMenu(false)}>
              <MenuItem icon={<HomeIcon size={13} />} label="All projects" onClick={() => (saveNow(), setUI({ home: true }), setMenu(false))} />
              <MenuItem icon={<Plus size={13} />} label="New event…" onClick={() => (setUI({ wizardOpen: true }), setMenu(false))} />
              <MenuItem
                icon={<Copy size={13} />}
                label="Duplicate as a new option"
                onClick={() => {
                  saveNow()
                  setProject({ ...structuredClone(project), id: undefined, name: `${project.name} (option B)`, updatedAt: Date.now() })
                  notify('Copied as a separate option. The original is unchanged in All projects.')
                  setMenu(false)
                }}
              />
              <MenuItem icon={<History size={13} />} label="Save points…" onClick={() => (setPoints(true), setMenu(false))} />
              <MenuItem icon={<FolderOpen size={13} />} label="Open .unifest file…" onClick={() => (file.current?.click(), setMenu(false))} />
              <MenuItem icon={<Save size={13} />} label="Save to this browser" hint="Ctrl+S" onClick={() => (saveNow() ? notify('Saved') : notify('Could not save: storage blocked'), setMenu(false))} />
              <div className="h-px bg-line my-1" />
              {phone && (
                <>
                  <div className="px-1 py-1">{modeSeg}</div>
                  <MenuItem icon={<HelpCircle size={13} />} label="Guide for this workspace" onClick={() => (setUI({ guideOpen: true }), setMenu(false))} />
                </>
              )}
              <Sel
                label="Layout"
                value={pref}
                onChange={(v) => {
                  useDevice.getState().setPref(v as DevicePref)
                  notify(v === 'auto' ? 'Layout follows this device' : `${LAYOUTS.find((l) => l.value === v)?.label} layout`)
                }}
                options={LAYOUTS}
              />
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
        <div className="relative">
          <button className="btn" onClick={() => (setHelp(!help), setMenu(false))} aria-expanded={help} title="Guide, shortcuts, light or dark, about">
            {phone ? <HelpCircle size={14} /> : <>Help <ChevronDown size={12} /></>}
          </button>
          {help && (
            <div className="absolute right-0 top-10 z-40 w-60 card p-1 fade-in" onMouseLeave={() => setHelp(false)}>
              <MenuItem icon={<HelpCircle size={13} />} label="How this page works" onClick={() => (setUI({ guideOpen: true }), setHelp(false))} />
              {desktop && <MenuItem icon={<Keyboard size={13} />} label="Keyboard shortcuts" hint="?" onClick={() => (setUI({ shortcutsOpen: true }), setHelp(false))} />}
              <MenuItem icon={<Info size={13} />} label="About, contact and support" onClick={() => (setCompany(true), setHelp(false))} />
              <div className="h-px bg-line my-1" />
              <div className="flex items-center justify-between px-3 h-8 text-xs">
                Light or dark
                <ThemeToggle />
              </div>
            </div>
          )}
          {company && <CompanyPanel onClose={() => setCompany(false)} />}
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
        <AccountButton />
      </div>
    </div>
    {!desktop && <div className="px-2 pb-2 overflow-x-auto no-scrollbar">{steps}</div>}
    {pages}
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

// Top of the canvas: project numbers, then actions for the selection and scene suggestions beside them.
function TopStrip() {
  const ws = useStore((s) => s.ui.workspace)
  const device = useDevice((s) => s.kind)
  const left = device !== 'desktop' ? 'left-3' : 'left-[272px]'
  return (
    <div className={`absolute top-4 ${left} right-4 z-20 flex flex-wrap items-start gap-2 pointer-events-none`} data-ws={ws}>
      <Hud />
      <ContextBar />
    </div>
  )
}

function Hud() {
  const project = useStore((s) => s.project)
  const t = totals(project)
  const ls = loadSummary(project)
  // [label, value, shown only on wide screens]
  const items: [string, string, boolean?][] = [
    ['Total pixels', `${t.pxW} × ${t.pxH}`],
    ['LED area', `${fmt(t.ledArea, 1)} m²`, true],
    ['Stage', t.stage, true],
    ['Weight', `${Math.round(ls.weightKg).toLocaleString('en-IN')} kg`],
    ['Power max', `${fmt(ls.continuousMaxW / 1000, 1)} kW`],
    ['Space est.', t.capacityStatus === 'ok' ? `~${t.capacity.toLocaleString('en-IN')}` : t.capacityStatus === 'check' ? 'unverified' : '—', true],
    ...(project.tables.length ? ([['Seats', seatCount(project).toLocaleString('en-IN')]] as [string, string][]) : []),
  ]
  const device = useDevice((s) => s.kind)
  // Phones show the three most useful numbers only.
  const shown = device === 'phone' ? items.filter(([k]) => k === 'Total pixels' || k === 'Weight' || k === 'Power max') : items
  return (
    <div className="glass rounded-xl flex divide-x divide-line pointer-events-none shrink-0">
      {shown.map(([k, v, wide]) => (
        <div key={k} className={`${device === 'phone' ? 'px-2 py-1' : 'px-3 py-1.5'} ${wide && device === 'desktop' ? 'hidden 2xl:block' : ''}`}>
          <div className="text-[9px] tracking-widest uppercase text-mute font-semibold">{k}</div>
          <div className="mono text-[13px] font-medium whitespace-nowrap">{v}</div>
        </div>
      ))}
    </div>
  )
}

// Undo, redo, duplicate and delete as buttons, paired with Ctrl+Z, Ctrl+Shift+Z, Ctrl+D and Delete.
export function EditButtons({ vertical }: { vertical?: boolean }) {
  const canUndo = useSyncExternalStore(useStore.temporal.subscribe, () => useStore.temporal.getState().pastStates.length > 0)
  const canRedo = useSyncExternalStore(useStore.temporal.subscribe, () => useStore.temporal.getState().futureStates.length > 0)
  const count = useStore((s) => (s.ui.selection ? 1 + s.ui.extra.length : 0))
  const b = 'btn btn-icon disabled:opacity-30 disabled:cursor-not-allowed'
  return (
    <div className={`flex ${vertical ? 'flex-col' : ''} gap-1`}>
      <button className={b} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <Undo2 size={15} />
      </button>
      <button className={b} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <Redo2 size={15} />
      </button>
      <button className={b} title="Duplicate (Ctrl+D)" aria-label="Duplicate selection" disabled={!count} onClick={duplicateSelection}>
        <Copy size={15} />
      </button>
      <button className={`${b} hover:text-err`} title={count > 1 ? `Delete ${count} items (Delete)` : 'Delete (Delete)'} aria-label="Delete selection" disabled={!count} onClick={deleteSelection}>
        <Trash2 size={15} />
      </button>
    </div>
  )
}

function ToolRail() {
  const ui = useStore((s) => s.ui)
  const { setUI } = useStore.getState()
  const device = useDevice((s) => s.kind)
  const tools: { id: typeof ui.tool; icon: React.ReactNode; tip: string }[] = [
    { id: 'select', icon: <MousePointer2 size={15} />, tip: 'Select (V)' },
    { id: 'pan', icon: <Hand size={15} />, tip: 'Pan (H, or hold Space)' },
    { id: 'measure', icon: <Ruler size={15} />, tip: 'Measure (D)' },
  ]
  return (
    <div className={`absolute ${device === 'desktop' ? 'right-[336px]' : 'right-3'} top-1/2 -translate-y-1/2 z-10 glass rounded-xl flex flex-col gap-1 p-1`}>
      {tools.map((t) => (
        <button key={t.id} className={`btn btn-icon ${ui.tool === t.id ? 'btn-on' : ''}`} title={t.tip} onClick={() => setUI({ tool: t.id })}>
          {t.icon}
        </button>
      ))}
      <div className="h-px bg-line mx-1" />
      <button className={`btn btn-icon ${ui.magnet ? 'btn-on' : ''}`} title="Magnet / smart snap (M)" onClick={() => setUI({ magnet: !ui.magnet })}>
        <Magnet size={15} />
      </button>
      <div className="h-px bg-line mx-1" />
      <EditButtons vertical />
    </div>
  )
}

// Where the latest edit is stored: this device, the cloud, or neither (failed).
const CLOUD_LABEL = { idle: 'Saved on this device · cloud sync on', saving: 'Saved on this device · saving to cloud…', saved: 'Saved on this device and to cloud', offline: 'Saved on this device · offline, cloud will retry' } as const

function WarningsBar() {
  const project = useStore((s) => s.project)
  const { user, sync } = useAuth()
  const local = useSave((s) => s.local)
  const saveLabel = local === 'saving' ? 'Saving…' : local === 'failed' ? 'Save failed on this device (storage full or blocked)' : user ? CLOUD_LABEL[sync] : 'Saved on this device only'
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
            <div key={i} className="flex items-center gap-2 border-b border-line hover:bg-raised pr-3">
              <button
                className="flex-1 flex items-start gap-3 pl-5 py-2.5 text-left"
                onClick={() => {
                  setUI({ workspace: x.workspace, warningsOpen: false })
                  if (x.target) select(x.target)
                }}
              >
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${x.level === 'error' ? 'bg-err' : 'bg-warn'}`} aria-hidden />
                <span className="flex-1">
                  <span className="text-xs">
                    <span className="sr-only">{x.level === 'error' ? 'Error: ' : 'Warning: '}</span>
                    {x.text}
                  </span>
                  {x.fix && <span className="block text-[11px] text-mute">{x.fix}</span>}
                </span>
                <span className="text-[10px] text-mute uppercase tracking-wider">{TABS.find((t) => t.id === x.workspace)?.label}</span>
              </button>
              {x.action && (
                <button
                  className="btn h-7 text-[11px] shrink-0"
                  title="Applies the change in one step; Ctrl+Z undoes it"
                  onClick={() => {
                    useStore.getState().mutate((p) => x.action!.apply(p))
                    if (x.target) select(x.target)
                    useStore.getState().notify(`${x.action!.label}: done · Ctrl+Z to undo`)
                  }}
                >
                  {x.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <footer className="h-10 shrink-0 border-t border-line flex items-center justify-between px-4 text-[11px] bg-ink">
        <button className="flex items-center gap-2 text-dim hover:text-white" onClick={() => setUI({ warningsOpen: !open })}>
          {w.length ? <AlertTriangle size={13} className={errors ? 'text-err' : 'text-warn'} /> : <span className="h-2 w-2 rounded-full bg-white" />}
          {w.length ? `${errors} errors · ${w.length - errors} warnings` : 'All checks passed'}
        </button>
        {local === 'failed' && (
          <button className="ml-3 underline text-white shrink-0" onClick={() => exportProject(project)} title="Download the project as a file so nothing is lost">
            Save a copy as a file
          </button>
        )}
        <span className={`truncate ml-3 ${local === 'failed' ? 'text-err' : 'text-mute'}`} role="status" aria-live="polite">{saveLabel}<span className="hidden md:inline"> · {project.eventType}</span><span className="hidden md:inline"> · {project.audience.toLocaleString('en-IN')} guests</span></span>
      </footer>
    </>
  )
}

// "Describe your event" → a full first draft: venue, stage, screens, seating, decor, effects, sound and theme.
function Brief({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => (text.trim().length > 8 ? rulePlan(text) : null), [text])
  const go = async () => {
    setBusy(true)
    try {
      const { plan, engine } = await readBrief(text)
      const { project, notes } = planToProject(plan)
      useStore.getState().setProject(project)
      useStore.temporal.getState().clear()
      setNotes(notes)
      useStore.getState().notify(`First draft built${engine === 'ai' ? ' with AI' : ''}. Check the notes and adjust anything.`)
      onDone()
    } finally {
      setBusy(false)
    }
  }
  const chips = preview
    ? [
        preview.eventType,
        `${preview.audience.toLocaleString('en-IN')} guests`,
        `${preview.venue.w}×${preview.venue.l} m ${preview.venue.outdoor ? 'outdoor' : 'indoor'}`,
        preview.stage?.w ? `stage ${preview.stage.w}×${preview.stage.l} m` : '',
        preview.screens ? (preview.screens.center || preview.screens.sides ? [preview.screens.center && 'centre LED', preview.screens.sides && 'side LEDs'].filter(Boolean).join(' + ') : 'no LED') : '',
        preview.seating ?? '',
        ...preview.decor,
        ...preview.effects,
        preview.theme ? `${THEMES.find((t) => t.id === preview.theme)?.name} theme` : '',
      ].filter(Boolean)
    : []
  return (
    <div className="card p-3 glow">
      <div className="label mb-1 flex items-center gap-1.5">
        <Sparkles size={12} /> Describe your event
      </div>
      <textarea
        className="field min-h-[72px] py-2"
        placeholder="e.g. 1,500-guest sangeet on a 60×40 lawn, 40×20 ft stage, two LED sides, round tables, cold pyro, royal theme"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && void go()}
      />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5" aria-label="What was understood">
          {chips.map((c) => (
            <span key={c} className="rounded-full border border-line px-2 py-0.5 text-[10px] text-dim">
              {c}
            </span>
          ))}
        </div>
      )}
      <button className="btn btn-primary w-full justify-center mt-2" disabled={!text.trim() || busy} onClick={() => void go()}>
        <Sparkles size={13} /> {busy ? 'Building…' : 'Build it for me'}
      </button>
      <p className="text-[10px] text-mute mt-1">English or Hinglish ("500 log ki shaadi, mandap, lawn"). Builds the stage, screens, seating, decor, effects, sound and theme. {aiConfig() ? 'AI reading is on.' : 'Runs in your browser; nothing is sent anywhere.'}</p>
      {notes.length > 0 && <ul className="text-[10px] text-dim mt-1">{notes.map((n, i) => <li key={i}>· {n}</li>)}</ul>}
    </div>
  )
}

function Wizard() {
  const { setUI, setProject, notify } = useStore.getState()
  const prefill = useStore((s) => s.ui.wizardPrefill)
  const [inp, setInp] = useState<WizardInput>(() => ({ name: 'My event', eventType: 'College Fest', audience: 1500, venueW: 50, venueL: 70, outdoor: true, ...prefill }))
  const create = (w: WizardInput) => {
    setProject(generateProject(w))
    setUI({ wizardOpen: false, home: false, workspace: 'ground', wizardPrefill: null })
    useStore.temporal.getState().clear()
    notify('Starter layout generated. Every part is editable.')
  }
  return (
    <Modal title="New event" onClose={() => setUI({ wizardOpen: false, wizardPrefill: null })} wide>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
        <div className="md:col-span-2 space-y-3">
          <Brief onDone={() => setUI({ wizardOpen: false, home: false, workspace: 'ground', wizardPrefill: null })} />
          <div className="label pt-2">Or fill in the details</div>
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
        <div className="md:col-span-3">
          <div className="label mb-3">Or start from a template</div>
          <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
            {TEMPLATES.map((t, i) => (
              <Fragment key={t.name}>
              {t.region && t.region !== TEMPLATES[i - 1]?.region && <div className="col-span-2 label mt-2">{t.region}</div>}
              <button key={t.name} className="text-left rounded-xl border border-line p-3 hover:border-white transition-colors" onClick={() => create(t)}>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-[11px] text-mute mt-0.5 leading-snug">{t.blurb}</div>
                <div className="mono text-[10px] text-dim mt-2">
                  {t.audience.toLocaleString('en-IN')} ppl · {t.venueW}×{t.venueL} m
                </div>
              </button>
              </Fragment>
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
    ['M', 'Smart snap on/off: line up with other items (pink guides)'],
    ['Shift+click', 'Pick more items to align, level or space evenly'],
    ['F', 'Fit to view'],
    ['+ / −', 'Zoom'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+D', 'Duplicate selected screen'],
    ['Delete', 'Delete selection (or the bin button)'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo (also Ctrl+Y)'],
    ['Ctrl+D', 'Duplicate selection'],
    ['Ctrl+A', 'Select everything in this workspace'],
    ['Arrow keys', 'Nudge 0.1 m (Shift: 1 m)'],
    ['Esc', 'Deselect'],
    ['Ctrl+S', 'Save'],
    ['1 – 7', 'Switch workspace'],
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
      const { ui, setUI, mutate, select, notify } = useStore.getState()
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? redo() : undo()
      }
      if (mod && e.key.toLowerCase() === 'y') return (e.preventDefault(), redo())
      if (mod && e.key.toLowerCase() === 's') return (e.preventDefault(), notify(saveNow() ? 'Saved' : 'Could not save'))
      // Edit shortcuts work in the 2D workspaces; the 3D views have their own keys.
      const editing = EDIT_WS.includes(ui.workspace) && !ui.home
      if (mod && e.key.toLowerCase() === 'd' && editing) return (e.preventDefault(), duplicateSelection())
      if (mod && e.key.toLowerCase() === 'a' && editing) return (e.preventDefault(), selectAll())
      if (mod) return
      const k = e.key.toLowerCase()
      if (k === 'v') setUI({ tool: 'select' })
      if (k === 'h') setUI({ tool: 'pan' })
      if (k === 'd') setUI({ tool: ui.tool === 'measure' ? 'select' : 'measure' })
      if (k === 'm') setUI({ magnet: !ui.magnet })
      if (k === 'b' && ui.workspace === 'led') setUI({ tool: ui.tool === 'paint' ? 'select' : 'paint' })
      if (k === '?') setUI({ shortcutsOpen: true })
      if (k === 'escape') setUI({ tool: 'select' })
      if (/^[1-9]$/.test(k) && KEYED[Number(k) - 1]) setUI({ workspace: KEYED[Number(k) - 1].id, tool: 'select' })
      if ((k === 'delete' || k === 'backspace') && ui.selection && editing) return (e.preventDefault(), deleteSelection())
      if (k === 'escape' && editing) select(null)
      // Arrow keys nudge the selection: 0.1 m, or 1 m with Shift. In LED screens up/down change height.
      const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }
      if (arrows[k] && ui.selection && editing) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 0.1
        const [ax, ay] = arrows[k]
        if (ui.workspace === 'led') nudgeSelection(ax * step, 0, -ay * step)
        else nudgeSelection(ax * step, ay * step)
      }
      if (k === 'n' && ui.workspace === 'led') mutate((p) => void p.screens.push(newScreen(p)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}


// Contact details, feedback and company info, kept out of the canvas.
