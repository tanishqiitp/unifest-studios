import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Box, Building2, Users, Cloud, CloudUpload, Copy, FileText, FolderOpen, Layers, MonitorPlay, Plus, Ruler, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import type { Project } from '../types'
import { screenColumns, screenStats } from '../lib/calc'
import { deleteProject, readLibrary, readProject, writeProject, type LibEntry } from '../lib/library'
import { deleteCloudProject, fetchCloudProject, listCloudProjects, pushProject, useAuth } from '../lib/cloud'
import { AccountButton } from './Account'
import { readProjectFile } from '../lib/export/files'
import { generateProject, TEMPLATES } from '../lib/templates'

const GROUND_FILL: Record<string, string> = { crowd: '#1c1c1c', seating: '#202020', vip: '#262626', foh: '#3a3a3a', barricade: '#6a6a6a', exit: '#9a9a9a', entry: '#5a5a5a' }

// Small top-view drawing of a project for cards.
export function ProjectThumb({ p }: { p: Project }) {
  const { w, l } = p.venue
  return (
    <svg viewBox={`${-2} ${-2} ${w + 4} ${l + 4}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={w} height={l} fill="#0b0b0b" stroke="#333" strokeWidth={Math.max(w, l) / 200} />
      {p.ground.map((g) => (
        <rect
          key={g.id}
          x={g.x}
          y={g.y}
          width={g.w}
          height={g.h}
          fill={GROUND_FILL[g.kind] ?? '#2c2c2c'}
          transform={`rotate(${g.rotation} ${g.x + g.w / 2} ${g.y + g.h / 2})`}
        />
      ))}
      {p.decks.map((d) => (
        <rect key={d.id} x={d.x} y={d.y} width={d.w} height={d.l} fill="#d8d8d8" />
      ))}
      {(p.tables ?? []).map((t) =>
        t.kind === 'round' || t.kind === 'cocktail' ? <circle key={t.id} cx={t.x} cy={t.y} r={t.w / 2 + 0.4} fill="#6a6a6a" /> : <rect key={t.id} x={t.x - t.w / 2} y={t.y - 0.5} width={t.w} height={1} fill="#6a6a6a" transform={`rotate(${t.rotation} ${t.x} ${t.y})`} />,
      )}
      {p.truss.map((t) => (
        <line key={t.id} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#8a8a8a" strokeWidth={0.4} />
      ))}
      {p.screens.map((s) => {
        const st = screenStats(s, p.customPanels)
        const cols = screenColumns(s, st.panel)
        return <polyline key={s.id} points={cols.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="#fff" strokeWidth={0.8} strokeLinecap="round" />
      })}
    </svg>
  )
}

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} d ago` : new Date(t).toLocaleDateString('en-IN')
}

export function Home() {
  const { setUI, setProject, notify } = useStore.getState()
  const current = useStore((s) => s.project)
  const [lib, setLib] = useState<LibEntry[]>(() => readLibrary())
  const [confirm, setConfirm] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const templates = useMemo(() => TEMPLATES.map((t) => ({ t, p: generateProject(t) })), [])
  const projects = useMemo(() => lib.map((e) => ({ e, p: readProject(e.id) })).filter((x): x is { e: LibEntry; p: Project } => !!x.p), [lib])
  const user = useAuth((a) => a.user)
  const [cloudIds, setCloudIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)

  // Signed in: bring down anything newer in the cloud so this browser has every project.
  useEffect(() => {
    if (!user) return setCloudIds(new Set())
    let live = true
    listCloudProjects()
      .then(async (cloud) => {
        const local = new Map(readLibrary().map((e) => [e.id, e.updatedAt]))
        const stale = cloud.filter((c) => !local.has(c.id) || c.updatedAt > (local.get(c.id) ?? 0) + 1000)
        for (const c of stale.slice(0, 50)) {
          const p = await fetchCloudProject(c.id)
          if (p) writeProject({ ...p, id: c.id }, false)
        }
        if (live) {
          setCloudIds(new Set(cloud.map((c) => c.id)))
          setLib(readLibrary())
        }
      })
      .catch(() => notify('Could not reach the cloud. Showing projects saved in this browser.'))
    return () => {
      live = false
    }
  }, [user, notify])

  const localOnly = user ? projects.filter(({ e }) => !cloudIds.has(e.id)) : []
  const uploadAll = async () => {
    setUploading(true)
    try {
      for (const { p } of localOnly) await pushProject(p)
      setCloudIds(new Set([...cloudIds, ...localOnly.map(({ e }) => e.id)]))
      notify(`Uploaded ${localOnly.length} project${localOnly.length === 1 ? '' : 's'} to your account`)
    } catch (e) {
      notify(`Upload failed: ${(e as Error).message}`)
    }
    setUploading(false)
  }

  const open = (p: Project, ws: 'ground' | 'viz' = 'ground') => {
    setProject(p)
    useStore.temporal.getState().clear()
    setUI({ home: false, workspace: ws, tool: 'select' })
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-line sticky top-0 bg-ink/90 backdrop-blur z-10">
        <div className="flex items-center gap-2 select-none">
          <div className="h-7 w-7 rounded-lg bg-white text-black flex items-center justify-center font-display font-bold text-sm">U</div>
          <div className="leading-none">
            <div className="font-display font-semibold text-[13px] tracking-tight">UNIFEST</div>
            <div className="text-[8px] tracking-[0.3em] text-mute">STUDIOS</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccountButton />
          <button className="btn" onClick={() => setUI({ venuesOpen: true })}>
            <Building2 size={13} /> Venues
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            <FolderOpen size={13} /> Open file
          </button>
          <button className="btn btn-primary" onClick={() => setUI({ wizardOpen: true })}>
            <Plus size={13} /> New event
          </button>
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
              .then((p) => (open({ ...p, id: undefined }), notify(`Opened ${p.name}`)))
              .catch((err) => notify(err.message))
            e.target.value = ''
          }}
        />
      </header>

      <div className="max-w-6xl mx-auto px-8">
        <section className="pt-16 pb-12 grid grid-cols-5 gap-10 items-center fade-in">
          <div className="col-span-3">
            <div className="label">Production design studio</div>
            <h1 className="font-display text-5xl font-semibold tracking-tight leading-[1.05] mt-3">
              Design the show
              <br />
              <span className="text-dim">before you build it.</span>
            </h1>
            <p className="text-sm text-dim mt-5 max-w-lg leading-relaxed">
              Plan the ground, stage, truss and LED screens in one place. See it live in 3D, check every load and circuit, then send a link to your client and a full technical pack to your crew.
            </p>
            <div className="flex gap-2 mt-7">
              <button className="btn btn-primary h-11 px-5 text-sm" onClick={() => setUI({ wizardOpen: true })}>
                Start a new event <ArrowRight size={14} />
              </button>
              <button className="btn h-11 px-5 text-sm" onClick={() => setUI({ venuesOpen: true })}>
                <Building2 size={14} /> Find a venue
              </button>
              {projects.length > 0 && (
                <button className="btn h-11 px-5 text-sm" onClick={() => open(projects[0].p)}>
                  Continue “{projects[0].e.name}”
                </button>
              )}
            </div>
          </div>
          <div className="col-span-2 card p-3 glow aspect-[4/3]">
            <ProjectThumb p={projects[0]?.p ?? current} />
          </div>
        </section>

        <section className="grid grid-cols-7 gap-2 pb-12">
          {(
            [
              [<Layers size={15} key="i" />, 'Ground plan', 'Zones, capacity, sightlines'],
              [<Box size={15} key="i" />, 'Stage', 'Decks, risers, runways'],
              [<Ruler size={15} key="i" />, 'Truss & rigging', 'Live kg per hoist, auto-rig'],
              [<MonitorPlay size={15} key="i" />, 'LED screens', 'Pixels, data, 3-phase power'],
              [<Users size={15} key="i" />, 'Seating', 'Tables, guests, meals'],
              [<Box size={15} key="i" />, '3D visualizer', 'Night show, renders, video'],
              [<FileText size={15} key="i" />, 'Deliver', 'Client link, PDF, DXF, XML'],
            ] as const
          ).map(([icon, t, s], i) => (
            <div key={t} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between text-mute">
                {icon}
                <span className="mono text-[10px]">0{i + 1}</span>
              </div>
              <div className="text-xs font-medium mt-3">{t}</div>
              <div className="text-[10px] text-mute mt-0.5 leading-snug">{s}</div>
            </div>
          ))}
        </section>

        {projects.length > 0 && (
          <section className="pb-12">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-semibold">Your projects</h2>
                <p className="text-xs text-mute mt-0.5">
                  {user ? 'Synced with your account and saved in this browser.' : 'Saved in this browser. Sign in to keep them in the cloud and open them anywhere.'}
                </p>
              </div>
              {localOnly.length > 0 && (
                <button className="btn" onClick={uploadAll} disabled={uploading}>
                  <CloudUpload size={13} /> {uploading ? 'Uploading…' : `Upload ${localOnly.length} browser project${localOnly.length === 1 ? '' : 's'} to my account`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {projects.map(({ e, p }) => (
                <div key={e.id} className="group rounded-xl border border-line hover:border-line-hi transition-colors overflow-hidden">
                  <button className="block w-full aspect-[16/10] bg-black p-2" onClick={() => open(p)} aria-label={`Open ${e.name}`}>
                    <ProjectThumb p={p} />
                  </button>
                  <div className="p-3 border-t border-line flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {cloudIds.has(e.id) && <Cloud size={12} className="shrink-0 text-dim" aria-label="Saved in the cloud" />}
                        {e.name}
                      </div>
                      <div className="text-[11px] text-mute">
                        {e.eventType} · {e.audience.toLocaleString('en-IN')} guests · {ago(e.updatedAt)}
                      </div>
                    </div>
                    {confirm === e.id ? (
                      <div className="flex gap-1">
                        <button
                          className="btn h-7 text-[11px] border-err/60 text-err"
                          onClick={() => {
                            deleteProject(e.id)
                            if (cloudIds.has(e.id)) deleteCloudProject(e.id).catch(() => notify('Deleted here, but the cloud copy could not be removed. Try again later.'))
                            setLib(readLibrary())
                            setConfirm(null)
                            notify(`Deleted ${e.name}`)
                          }}
                        >
                          Delete
                        </button>
                        <button className="btn h-7 text-[11px]" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="btn btn-icon h-7 w-7" title="Open in 3D" onClick={() => open(p, 'viz')}>
                          <Box size={12} />
                        </button>
                        <button className="btn btn-icon h-7 w-7" title="Duplicate" onClick={() => open({ ...structuredClone(p), id: undefined, name: `${p.name} copy`, updatedAt: Date.now() })}>
                          <Copy size={12} />
                        </button>
                        <button className="btn btn-icon h-7 w-7" title="Delete" onClick={() => setConfirm(e.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="pb-20">
          <h2 className="font-display text-xl font-semibold">Start from a template</h2>
          <p className="text-xs text-mute mt-0.5 mb-4">Complete, safe starting layouts. Every part is editable.</p>
          <div className="grid grid-cols-4 gap-3">
            {templates.map(({ t, p }) => (
              <button key={t.name} className="text-left rounded-xl border border-line hover:border-white transition-colors overflow-hidden" onClick={() => open({ ...p, id: undefined })}>
                <div className="aspect-[4/3] bg-black p-2">
                  <ProjectThumb p={p} />
                </div>
                <div className="p-3 border-t border-line">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-mute mt-0.5 leading-snug line-clamp-2">{t.blurb}</div>
                  <div className="mono text-[10px] text-dim mt-2">
                    {t.audience.toLocaleString('en-IN')} ppl · {t.venueW}×{t.venueL} m
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
