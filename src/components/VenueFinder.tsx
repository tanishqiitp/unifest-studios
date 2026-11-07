import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, Building2, Loader2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { cloudEnabled, deleteVenue, saveVenue, searchVenues, useAuth, VENUE_KINDS, type Venue, type VenueRoom } from '../lib/cloud'
import { useStore } from '../store'
import { AccountButton } from './Account'

const kindName = (k: string) => VENUE_KINDS.find((x) => x.id === k)?.name ?? k
const fmtN = (n?: number) => (n ? n.toLocaleString('en-IN') : '—')

// Venue library: search rooms with real dimensions, use one for the plan, or add your own venue.
export function VenueFinder({ onPick, onClose }: { onPick: (v: Venue, r: VenueRoom) => void; onClose: () => void }) {
  const user = useAuth((a) => a.user)
  const notify = useStore((s) => s.notify)
  const [q, setQ] = useState('')
  const [list, setList] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Venue | null>(null)
  const [editing, setEditing] = useState<Venue | 'new' | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!cloudEnabled) return
    let live = true
    setLoading(true)
    const t = setTimeout(
      () =>
        searchVenues(q)
          .then((v) => live && (setList(v), setError(null)))
          .catch((e) => live && setError((e as Error).message))
          .finally(() => live && setLoading(false)),
      250,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [q, refresh])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (editing ? setEditing(null) : onClose())
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [editing, onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink flex flex-col fade-in" role="dialog" aria-label="Venue library">
      <header className="h-14 shrink-0 flex items-center gap-3 px-5 border-b border-line">
        <Building2 size={16} />
        <div className="font-display font-semibold">Venue library</div>
        <div className="relative flex-1 max-w-xl mx-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input autoFocus className="field pl-9 h-9" placeholder="Search by venue name, city or area" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <button className="btn" onClick={() => setEditing('new')}>
              <Plus size={13} /> Add a venue
            </button>
          ) : (
            cloudEnabled && <span className="text-[11px] text-mute hidden lg:inline">Sign in to add venues</span>
          )}
          <AccountButton />
          <button className="btn btn-icon" onClick={onClose} aria-label="Close venue library">
            <X size={14} />
          </button>
        </div>
      </header>
      {!cloudEnabled ? (
        <Empty text="The venue library needs the online version of Unifest Studios." />
      ) : editing ? (
        <VenueForm
          initial={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSaved={(v) => {
            setEditing(null)
            setSel(v)
            setRefresh((n) => n + 1)
            notify(`Saved ${v.name}`)
          }}
        />
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="w-96 shrink-0 border-r border-line overflow-y-auto">
            {loading && (
              <div className="p-5 text-xs text-mute flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Searching…
              </div>
            )}
            {error && <div className="p-5 text-xs text-err">Could not load venues: {error}</div>}
            {!loading && !error && list.length === 0 && (
              <div className="p-6 text-center">
                <Building2 size={22} className="mx-auto text-mute" />
                <div className="text-sm font-medium mt-3">{q ? 'No venues match' : 'The library is empty for now'}</div>
                <p className="text-[11px] text-mute mt-1 leading-relaxed">{user ? 'Add a venue you know, with its room sizes, so you and others can plan with it.' : 'Sign in to add the first venue with its room sizes.'}</p>
                {user && (
                  <button className="btn btn-primary mt-4" onClick={() => setEditing('new')}>
                    <Plus size={13} /> Add a venue
                  </button>
                )}
              </div>
            )}
            {list.map((v) => {
              const big = [...v.rooms].filter((r) => r.w > 0 && r.l > 0).sort((a, b) => b.w * b.l - a.w * a.l)[0]
              return (
                <button key={v.id} onClick={() => setSel(v)} className={`w-full text-left px-5 py-3 border-b border-line hover:bg-raised ${sel?.id === v.id ? 'bg-raised' : ''}`}>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {v.name}
                    {v.verified && <BadgeCheck size={13} aria-label="Verified" />}
                  </div>
                  <div className="text-[11px] text-mute flex items-center gap-1">
                    <MapPin size={10} /> {[v.city, v.state].filter(Boolean).join(', ') || 'Location not set'} · {kindName(v.kind)}
                  </div>
                  <div className="mono text-[10px] text-dim mt-1">
                    {v.rooms.length} {v.rooms.length === 1 ? 'space' : 'spaces'}
                    {big ? ` · largest ${big.approx ? '≈' : ''}${big.w}×${big.l} m` : ''}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto">
            {sel ? (
              <VenueDetail
                v={sel}
                mine={!!user && sel.created_by === user.id}
                onPick={onPick}
                onEdit={() => setEditing(sel)}
                onDeleted={() => {
                  setSel(null)
                  setRefresh((n) => n + 1)
                }}
              />
            ) : (
              <Empty text="Pick a venue to see its spaces and dimensions." />
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

function Empty({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center p-10 text-xs text-mute">{text}</div>
}

function VenueDetail({ v, mine, onPick, onEdit, onDeleted }: { v: Venue; mine: boolean; onPick: (v: Venue, r: VenueRoom) => void; onEdit: () => void; onDeleted: () => void }) {
  const notify = useStore((s) => s.notify)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="max-w-3xl px-8 py-8 fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="label">{kindName(v.kind)} · {v.indoor ? 'Indoor' : 'Outdoor'}</div>
          <h2 className="font-display text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            {v.name} {v.verified && <BadgeCheck size={18} aria-label="Verified" />}
          </h2>
          <div className="text-xs text-dim mt-1">{[v.address, v.city, v.state, v.country].filter((x, i) => x && (i === 0 || !v.address.toLowerCase().includes(x.toLowerCase()))).join(', ')}</div>
          {v.website && /^https?:\/\//.test(v.website) && (
            <a className="text-[11px] underline text-dim" href={v.website} target="_blank" rel="noreferrer noopener">
              {v.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {!v.verified && <div className="text-[10px] text-mute mt-2">Added by the community. Confirm dimensions with the venue before you build.</div>}
        </div>
        {mine && (
          <div className="flex gap-1">
            <button className="btn" onClick={onEdit}>
              <Pencil size={12} /> Edit
            </button>
            {confirm ? (
              <button
                className="btn text-err"
                onClick={() =>
                  deleteVenue(v.id)
                    .then(() => (notify(`Deleted ${v.name}`), onDeleted()))
                    .catch((e) => notify((e as Error).message))
                }
              >
                Delete for good
              </button>
            ) : (
              <button className="btn btn-icon" title="Delete" onClick={() => setConfirm(true)}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      {v.notes && <Notes text={v.notes} />}
      <div className="label mt-8 mb-2">Spaces</div>
      {v.rooms.length === 0 && <p className="text-xs text-mute">No spaces listed yet.</p>}
      <div className="space-y-2">
        {v.rooms.map((r, i) => (
          <div key={i} className="rounded-xl border border-line px-4 py-3 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{r.name}</div>
              <div className="mono text-[11px] text-dim mt-0.5">
                {r.w > 0 && r.l > 0 ? (
                  <>
                    {r.approx ? '≈ ' : ''}
                    {r.w} × {r.l} m · {(r.w * r.l).toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²{r.approx ? ' (approx. size from published area)' : ''}
                  </>
                ) : (
                  'Size not published'
                )}
                {r.h ? ` · ${r.h} m ceiling` : ''}
              </div>
              <div className="text-[10px] text-mute mt-0.5">
                Theatre {fmtN(r.theatre)} · Banquet {fmtN(r.banquet)} · Standing {fmtN(r.standing)}
              </div>
            </div>
            <button className="btn btn-primary" disabled={!(r.w > 0 && r.l > 0)} title={r.w > 0 ? undefined : 'No size published for this space yet'} onClick={() => onPick(v, r)}>
              Use this space
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const emptyRoom = (): VenueRoom => ({ name: 'Main hall', w: 30, l: 20 })

function VenueForm({ initial, onCancel, onSaved }: { initial?: Venue; onCancel: () => void; onSaved: (v: Venue) => void }) {
  const [v, setV] = useState(() => initial ?? { name: '', kind: 'banquet', city: '', state: '', country: 'India', address: '', website: '', notes: '', indoor: true, rooms: [emptyRoom()] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })
  const setRoom = (i: number, patch: Partial<VenueRoom>) => set({ rooms: v.rooms.map((r, k) => (k === i ? { ...r, ...patch } : r)) })
  const num = (s: string) => (s === '' ? undefined : Math.max(0, Number(s)))
  const valid = v.name.trim().length >= 2 && v.rooms.some((r) => r.name.trim() && r.w > 0 && r.l > 0)
  return (
    <div className="flex-1 overflow-y-auto">
      <form
        className="max-w-3xl mx-auto px-8 py-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          setBusy(true)
          setErr(null)
          saveVenue({ ...v, id: initial?.id })
            .then(onSaved)
            .catch((e) => setErr((e as Error).message))
            .finally(() => setBusy(false))
        }}
      >
        <h2 className="font-display text-xl font-semibold">{initial ? `Edit ${initial.name}` : 'Add a venue'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Venue name *" value={v.name} onChange={(name) => set({ name })} placeholder="e.g. Grand Ballroom, Hotel Example" />
          <label className="block">
            <span className="label">Type</span>
            <select className="field mt-1" value={v.kind} onChange={(e) => set({ kind: e.target.value })}>
              {VENUE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="City" value={v.city} onChange={(city) => set({ city })} />
          <Field label="State" value={v.state} onChange={(state) => set({ state })} />
          <Field label="Address" value={v.address} onChange={(address) => set({ address })} />
          <Field label="Website" value={v.website} onChange={(website) => set({ website })} placeholder="https://" />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={v.indoor} onChange={(e) => set({ indoor: e.target.checked })} /> Indoor venue
        </label>
        <div>
          <div className="flex items-center justify-between">
            <div className="label">Spaces and dimensions</div>
            <button type="button" className="btn h-7" onClick={() => set({ rooms: [...v.rooms, { ...emptyRoom(), name: `Space ${v.rooms.length + 1}` }] })}>
              <Plus size={12} /> Add space
            </button>
          </div>
          <div className="grid grid-cols-[1.6fr_repeat(6,1fr)_auto] gap-1.5 mt-2 text-[10px] text-mute px-1">
            <span>Name</span>
            <span>Width m</span>
            <span>Length m</span>
            <span>Ceiling m</span>
            <span>Theatre</span>
            <span>Banquet</span>
            <span>Standing</span>
            <span />
          </div>
          {v.rooms.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.6fr_repeat(6,1fr)_auto] gap-1.5 mt-1.5 items-center">
              <input className="field h-8" value={r.name} onChange={(e) => setRoom(i, { name: e.target.value })} aria-label="Space name" />
              <input className="field h-8 mono" type="number" min={1} step={0.5} value={r.w || ''} onChange={(e) => setRoom(i, { w: num(e.target.value) ?? 0 })} aria-label="Width" />
              <input className="field h-8 mono" type="number" min={1} step={0.5} value={r.l || ''} onChange={(e) => setRoom(i, { l: num(e.target.value) ?? 0 })} aria-label="Length" />
              <input className="field h-8 mono" type="number" min={0} step={0.5} value={r.h ?? ''} onChange={(e) => setRoom(i, { h: num(e.target.value) })} aria-label="Ceiling height" />
              <input className="field h-8 mono" type="number" min={0} value={r.theatre ?? ''} onChange={(e) => setRoom(i, { theatre: num(e.target.value) })} aria-label="Theatre capacity" />
              <input className="field h-8 mono" type="number" min={0} value={r.banquet ?? ''} onChange={(e) => setRoom(i, { banquet: num(e.target.value) })} aria-label="Banquet capacity" />
              <input className="field h-8 mono" type="number" min={0} value={r.standing ?? ''} onChange={(e) => setRoom(i, { standing: num(e.target.value) })} aria-label="Standing capacity" />
              <button type="button" className="btn btn-icon h-8 w-8" disabled={v.rooms.length === 1} onClick={() => set({ rooms: v.rooms.filter((_, k) => k !== i) })} aria-label="Remove space">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <label className="block">
          <span className="label">Notes (access, power, rigging points, restrictions)</span>
          <textarea className="field mt-1 h-24 py-2" value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <p className="text-[10px] text-mute">Everyone can see venues in the library. Only you can edit what you add.</p>
        {err && <div className="text-[11px] text-err">{err}</div>}
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={!valid || busy}>
            {busy && <Loader2 size={13} className="animate-spin" />} Save venue
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field mt-1" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

// Notes with "Sources: url url" turned into short links.
function Notes({ text }: { text: string }) {
  const [body, src] = text.split(/\nSources:\s*/)
  const urls = (src ?? '').split(/\s+/).filter((u) => /^https?:\/\//.test(u))
  return (
    <div className="mt-4">
      <p className="text-xs text-dim leading-relaxed whitespace-pre-line">{body}</p>
      {urls.length > 0 && (
        <div className="text-[11px] text-mute mt-1">
          Sources:{' '}
          {urls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="underline hover:text-white mr-2" title={u}>
              {new URL(u).hostname.replace(/^www\./, '')} {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
