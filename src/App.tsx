import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Armchair, ClipboardList, Sparkles, Box, ChevronDown, Map as MapIcon, MonitorPlay, Send, Spline, Square, Copy, FolderOpen, HelpCircle, Home as HomeIcon, Keyboard, Magnet, PanelLeft, PanelRight, MoreHorizontal, MousePointer2, Hand, Plus, Redo2, Ruler, Save, Undo2 } from 'lucide-react'
import { redo, saveNow, undo, useStore } from './store'
import type { Project, Workspace } from './types'
import { fmt, totals } from './lib/calc'
import { getWarnings } from './lib/warnings'
import { readProjectFile, readShareHash } from './lib/export/files'
import { fetchShare, shareCodeFromPath, useAuth } from './lib/cloud'
import { AccountButton } from './components/Account'
import { generateProject, EVENT_TYPES, TEMPLATES, type EventType, type WizardInput } from './lib/templates'
import { LedWorkspace, newScreen } from './workspaces/Led'
import { GroundWorkspace } from './workspaces/Ground'
import { StageWorkspace } from './workspaces/Stage'
import { TrussWorkspace } from './workspaces/Truss'
import { DeliverWorkspace } from './workspaces/Deliver'
import { SeatingWorkspace } from './workspaces/Seating'
import { DecorWorkspace } from './workspaces/Decor'
import { PlanWorkspace } from './workspaces/Plan'
import { ClientFeedback } from './components/ClientFeedback'
import { seatCount } from './lib/seating'
import { Check, Modal, Num, Seg, Sel, Txt } from './components/ui'
import { Home } from './components/Home'
import { VenueFinder } from './components/VenueFinder'
import { Guide } from './components/Guide'
import { nanoid } from 'nanoid'
import { briefToProject, parseBrief } from './lib/smartLayout'
import { decorPreset, newDecor } from './lib/decor'
import { useDevice, isCompact, type DevicePref } from './lib/device'

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

const TABS: { id: Workspace; label: string; short: string; kicker: string; icon: typeof MapIcon; tip: string }[] = [
  { id: 'ground', label: 'Ground Plan', short: 'Ground', kicker: '01', icon: MapIcon, tip: 'Venue size, crowd areas, exits and facilities' },
  { id: 'stage', label: 'Stage', short: 'Stage', kicker: '02', icon: Square, tip: 'Build the stage from decks, risers and runways' },
  { id: 'truss', label: 'Truss & Rigging', short: 'Truss', kicker: '03', icon: Spline, tip: 'Truss, hoists, lights and speakers, with live weights' },
  { id: 'led', label: 'LED Screens', short: 'LED', kicker: '04', icon: MonitorPlay, tip: 'Screen sizes, pixels, cabling and power' },
  { id: 'seating', label: 'Seating', short: 'Seats', kicker: '05', icon: Armchair, tip: 'Tables, chairs, guest list and meals' },
  { id: 'decor', label: 'Decor & FX', short: 'Decor', kicker: '06', icon: Sparkles, tip: 'Wedding decor, pyro, smoke, sponsor banners, your own 3D models' },
  { id: 'viz', label: '3D Visualizer', short: '3D', kicker: '07', icon: Box, tip: 'See everything in 3D, render images and videos' },
  { id: 'plan', label: 'Plan', short: 'Plan', kicker: '08', icon: ClipboardList, tip: 'Quotation with GST, run of show, crew, stock, permits and client feedback' },
  { id: 'deliver', label: 'Deliver', short: 'Deliver', kicker: '09', icon: Send, tip: 'Client link, PDF, CAD and spreadsheets' },
]

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
      fetchShare(code).then((x) => (setP(x), setLoading(false)))
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
        <Suspense fallback={<Loading3D />}>
          <Viewer project={p} compact />
        </Suspense>
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
        {ui.workspace === 'ground' && <GroundWorkspace />}
        {ui.workspace === 'stage' && <StageWorkspace />}
        {ui.workspace === 'truss' && <TrussWorkspace />}
        {ui.workspace === 'led' && <LedWorkspace />}
        {ui.workspace === 'seating' && <SeatingWorkspace />}
        {ui.workspace === 'viz' && (
          <Suspense fallback={<Loading3D />}>
            <Viz3DWorkspace />
          </Suspense>
        )}
        {ui.workspace === 'decor' && <DecorWorkspace />}
        {ui.workspace === 'plan' && <PlanWorkspace />}
        {ui.workspace === 'deliver' && <DeliverWorkspace />}
        {['ground', 'stage', 'truss', 'led', 'seating', 'decor'].includes(ui.workspace) && <Hud />}
        {['ground', 'stage', 'truss', 'led', 'seating', 'decor'].includes(ui.workspace) && <ToolRail />}
        {compact && ['ground', 'stage', 'truss', 'led', 'seating', 'decor'].includes(ui.workspace) && <PanelToggles />}
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
  const tabs = (
    <nav className={`flex items-center gap-0.5 rounded-xl border border-line p-1 ${phone ? 'w-max' : 'mx-auto'}`}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setUI({ workspace: t.id, tool: 'select' })}
          title={`${t.tip} (${TABS.indexOf(t) + 1})`}
          className={`h-8 px-2.5 xl:px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${ui.workspace === t.id ? 'bg-white text-black' : 'text-dim hover:text-white hover:bg-lift'}`}
        >
          <t.icon size={13} className={ui.workspace === t.id ? '' : 'text-mute'} />
          <span className={desktop ? 'hidden xl:inline' : 'hidden'}>{t.label}</span>
          <span className={desktop ? 'xl:hidden' : ''}>{t.short}</span>
        </button>
      ))}
    </nav>
  )
  return (
    <header className="shrink-0 border-b border-line bg-ink" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
    <div className={`h-14 flex items-center ${phone ? 'gap-1.5 px-2' : 'gap-3 px-4'}`}>
      <button title="All projects" onClick={() => (saveNow(), setUI({ home: true, wizardOpen: false }))}>
        <Logo />
      </button>
      {!phone && <div className="w-px h-6 bg-line" />}
      <input
        className={`bg-transparent text-sm font-medium ${phone ? 'flex-1 min-w-0' : 'w-32 xl:w-44'} rounded-md px-2 h-8 border border-transparent hover:border-line focus:border-white outline-none`}
        value={project.name}
        onChange={(e) => mutate((p) => void (p.name = e.target.value))}
        aria-label="Project name"
      />
      {!phone && tabs}
      <div className={`flex items-center gap-1.5 ${phone ? 'ml-auto' : ''}`}>
        {!phone && <div className="w-36">{modeSeg}</div>}
        <button className="btn btn-icon" title="Undo (Ctrl+Z)" onClick={undo}>
          <Undo2 size={14} />
        </button>
        <button className="btn btn-icon" title="Redo (Ctrl+Shift+Z)" onClick={redo}>
          <Redo2 size={14} />
        </button>
        <div className="relative">
          <button className="btn" onClick={() => setMenu(!menu)}>
            {phone ? <MoreHorizontal size={14} /> : <>File <ChevronDown size={12} /></>}
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
        {!phone && (
          <button className="btn btn-icon" title="Show the guide for this workspace" onClick={() => setUI({ guideOpen: true })}>
            <HelpCircle size={14} />
          </button>
        )}
        {desktop && (
          <button className="btn btn-icon" title="Keyboard shortcuts (?)" onClick={() => setUI({ shortcutsOpen: true })}>
            <Keyboard size={14} />
          </button>
        )}
        {device !== 'tablet' && <button className={`btn btn-primary ${phone ? 'btn-icon' : ''}`} title="Deliver" onClick={() => setUI({ workspace: 'deliver' })}>
          {phone ? <Send size={14} /> : 'Deliver'}
        </button>}
      </div>
    </div>
    {phone && <div className="px-2 pb-2 overflow-x-auto hide-scrollbar">{tabs}</div>}
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
    ...(project.tables.length ? ([['Seats', seatCount(project).toLocaleString('en-IN')]] as [string, string][]) : []),
  ]
  const ws = useStore((s) => s.ui.workspace)
  const device = useDevice((s) => s.kind)
  const left = device !== 'desktop' ? 'left-3' : ws === 'led' || ws === 'ground' || ws === 'stage' || ws === 'truss' || ws === 'seating' ? 'left-[272px]' : 'left-4'
  // Phones show the three most useful numbers only.
  const shown = device === 'phone' ? items.filter(([k]) => k === 'Total pixels' || k === 'Weight' || k === 'Power') : items
  return (
    <div className={`absolute top-4 ${left} z-10 glass rounded-xl flex divide-x divide-line pointer-events-none`}>
      {shown.map(([k, v, wide]) => (
        <div key={k} className={`${device === 'phone' ? 'px-2 py-1' : 'px-3 py-1.5'} ${wide && device === 'desktop' ? 'hidden 2xl:block' : ''}`}>
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
    </div>
  )
}

const SAVE_LABEL = { idle: 'Autosaved · cloud sync on', saving: 'Saving to cloud…', saved: 'Saved to cloud', offline: 'Saved in this browser · cloud unreachable' } as const

function WarningsBar() {
  const project = useStore((s) => s.project)
  const { user, sync } = useAuth()
  const saveLabel = user ? SAVE_LABEL[sync] : 'Autosaved in this browser'
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
        <span className="text-mute truncate ml-3">{saveLabel}<span className="hidden md:inline"> · {project.eventType}</span><span className="hidden md:inline"> · {project.audience.toLocaleString('en-IN')} guests</span></span>
      </footer>
    </>
  )
}

// "Describe your event" → a full starter layout, including decor and effects the brief mentions.
function Brief({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const go = () => {
    const { project, notes } = briefToProject(text)
    const { extras } = parseBrief(text)
    const want = new Set(extras.decor ?? [])
    const d = project.decor ?? []
    if (want.has('mandap')) d.push(newDecor('mandap', project.venue.w / 2, Math.min(project.venue.l - 4, (project.decks.length ? Math.max(...project.decks.map((x) => x.y + x.l)) : 8) + 6)))
    if (want.has('floral') || want.has('drapes')) d.push(...decorPreset(project, 'wedding-stage'))
    if (want.has('cold pyro')) d.push(...decorPreset(project, 'pyro-front'))
    if (want.has('smoke')) d.push(...decorPreset(project, 'smoke-wings'))
    if (want.has('co2')) d.push(...decorPreset(project, 'co2-row'))
    if (want.has('fireworks')) d.push(...decorPreset(project, 'fireworks-finale'))
    if (want.has('confetti')) d.push(newDecor('confetti', project.venue.w / 2 - 4, 4), newDecor('confetti', project.venue.w / 2 + 4, 4))
    if (want.has('flames')) d.push(newDecor('flame', project.venue.w / 2 - 8, 3), newDecor('flame', project.venue.w / 2 + 8, 3))
    if (want.has('chandelier')) for (let i = 0; i < 4; i++) d.push(newDecor('chandelier', project.venue.w * (0.2 + i * 0.2), project.venue.l * 0.6))
    if (want.has('photo booth')) d.push(newDecor('photo-booth', project.venue.w - 4, project.venue.l - 4))
    project.decor = d
    useStore.getState().setProject(project)
    useStore.temporal.getState().clear()
    setNotes(notes)
    useStore.getState().notify('Layout built from your description. Check the notes and adjust anything.')
    onDone()
  }
  return (
    <div className="card p-3 glow">
      <div className="label mb-1 flex items-center gap-1.5">
        <Sparkles size={12} /> Describe your event
      </div>
      <textarea
        className="field min-h-[72px] py-2"
        placeholder="e.g. 500 guests sangeet on a lawn, 40x20 ft stage, round tables, 2 side screens, mandap, cold pyro and smoke"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && go()}
      />
      <button className="btn btn-primary w-full justify-center mt-2" disabled={!text.trim()} onClick={go}>
        <Sparkles size={13} /> Build it for me
      </button>
      <p className="text-[10px] text-mute mt-1">Works in English or Hinglish ("500 log ki shaadi, mandap, lawn"). Runs in your browser; nothing is sent anywhere.</p>
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
      if (/^[1-9]$/.test(k)) setUI({ workspace: TABS[Number(k) - 1].id, tool: 'select' })
      if ((k === 'delete' || k === 'backspace') && ui.selection) {
        const { kind, id } = ui.selection
        mutate((p) => {
          if (kind === 'screen') p.screens = p.screens.filter((s) => s.id !== id && s.mirrorOf !== id)
          if (kind === 'ground') p.ground = p.ground.filter((g) => g.id !== id)
          if (kind === 'deck') p.decks = p.decks.filter((d) => d.id !== id)
          if (kind === 'truss') p.truss = p.truss.filter((t) => t.id !== id)
          if (kind === 'hoist') p.hoists = p.hoists.filter((h) => h.id !== id)
          if (kind === 'table') {
            p.tables = p.tables.filter((t) => t.id !== id)
            p.guests.forEach((g) => g.tableId === id && (g.tableId = undefined))
          }
        })
        select(null)
      }
      if (k === 'n' && ui.workspace === 'led') mutate((p) => void p.screens.push(newScreen(p)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

