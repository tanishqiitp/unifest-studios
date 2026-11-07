import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { Copy, Download, Sparkles, Trash2, UserPlus, Users, Wand2, X } from 'lucide-react'
import { useStore } from '../store'
import type { Guest, Meal, Table } from '../types'
import { PlanCanvas } from '../components/PlanCanvas'
import { TopView } from '../components/TopView'
import { Check, Num, Section, Stat, Tip, Txt } from '../components/ui'
import { autoLayout, autoSeat, defaultArea, isSeated, LAYOUT_STYLES, mealCounts, MEALS, newTable, parseGuests, seatCount, seatingCSV, TABLE_PRESETS, type Area, type LayoutStyle } from '../lib/seating'
import { download, slug } from '../lib/export/files'

export function SeatingWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { select } = useStore.getState()
  const table = sel?.kind === 'table' ? project.tables.find((t) => t.id === sel.id) : undefined
  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        <AutoLayoutPanel />
        <Section title="Add furniture">
          <div className="grid grid-cols-2 gap-1.5">
            {TABLE_PRESETS.map((pr) => (
              <button
                key={pr.id}
                title={pr.hint}
                className="rounded-lg border border-line px-2 py-2 text-left hover:border-line-hi hover:bg-raised transition-colors"
                onClick={() =>
                  useStore.getState().mutate((p) => {
                    const a = defaultArea(p)
                    const n = p.tables.filter((t) => isSeated(t.kind) && t.kind !== 'row').length + 1
                    const t = newTable(pr, a.x + a.w / 2, a.y + 2, isSeated(pr.kind) && pr.kind !== 'row' ? String(n) : pr.name)
                    p.tables.push(t)
                    setTimeout(() => select({ kind: 'table', id: t.id }))
                  })
                }
              >
                <div className="text-[11px] font-medium">{pr.name}</div>
                <div className="text-[10px] text-mute">{pr.seats ? `${pr.seats} seats` : pr.kind === 'cocktail' ? 'standing' : `${pr.w}×${pr.l} m`}</div>
              </button>
            ))}
          </div>
        </Section>
      </aside>
      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas bounds={{ x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }} grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }} onBackground={() => select(null)}>
          <TopView edit="seating" />
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Drag tables to move · rotate with the round handle · filled chairs have a guest</div>
      </div>
      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">{table ? <TablePanel t={table} /> : <GuestsPanel />}</aside>
    </div>
  )
}

function AutoLayoutPanel() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, notify } = useStore.getState()
  const [style, setStyle] = useState<LayoutStyle>('banquet')
  const [guests, setGuests] = useState(() => project.guests.length || Math.min(project.audience, 1000))
  const [aisle, setAisle] = useState(2)
  const [replace, setReplace] = useState(true)
  const zone = sel?.kind === 'ground' ? project.ground.find((g) => g.id === sel.id) : undefined
  const area: Area = zone && !zone.rotation ? { x: zone.x, y: zone.y, w: zone.w, l: zone.h } : defaultArea(project)
  const run = () => {
    const res = autoLayout({ style, guests, area, aisle })
    mutate((p) => {
      if (replace) {
        const keep = new Set(['dance', 'buffet', 'bar', 'sweetheart', 'lounge'])
        p.tables = p.tables.filter((t) => keep.has(t.kind))
        const ids = new Set(p.tables.map((t) => t.id))
        p.guests.forEach((g) => g.tableId && !ids.has(g.tableId) && (g.tableId = undefined))
      }
      p.tables.push(...res.tables)
    })
    notify(res.fits ? `${res.tables.length} ${style === 'theatre' ? 'rows' : 'tables'} placed · ${res.seats} ${style === 'cocktail' ? 'standing' : 'seats'}` : `Only room for ${res.seats} of ${guests}. Try a bigger area, a narrower aisle or theatre style.`)
  }
  return (
    <Section title="Automatic layout" right={<Tip text="Fills the floor in front of the stage with tables or rows, front to back, leaving a centre aisle. Select a seating zone in Ground Plan first to fill just that zone." />}>
      <div className="grid grid-cols-2 gap-1">
        {LAYOUT_STYLES.map((l) => (
          <button key={l.id} title={l.hint} className={`btn h-8 justify-center ${style === l.id ? 'btn-on' : ''}`} onClick={() => setStyle(l.id)}>
            {l.name}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-mute">{LAYOUT_STYLES.find((l) => l.id === style)!.hint}</p>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Guests" value={guests} onChange={setGuests} int step={10} min={1} />
        <Num label="Aisle" value={aisle} onChange={setAisle} unit="m" step={0.5} min={1} />
      </div>
      <p className="text-[10px] text-mute">
        Area: {zone ? `zone “${zone.label}”` : 'floor in front of the stage'} · {area.w.toFixed(0)} × {area.l.toFixed(0)} m
      </p>
      <Check label="Replace existing tables" checked={replace} onChange={setReplace} />
      <button className="btn btn-primary w-full justify-center h-9" onClick={run}>
        <Wand2 size={14} /> Generate layout
      </button>
    </Section>
  )
}

function GuestsPanel() {
  const project = useStore((s) => s.project)
  const { mutate, notify } = useStore.getState()
  const [paste, setPaste] = useState('')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(project.guests.length === 0)
  const seats = seatCount(project)
  const unseated = project.guests.filter((g) => !g.tableId).length
  const meals = mealCounts(project.guests)
  const tables = project.tables.filter((t) => isSeated(t.kind) && t.seats > 0)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return project.guests.filter((g) => !s || g.name.toLowerCase().includes(s) || g.group.toLowerCase().includes(s))
  }, [project.guests, q])
  const label = new Map(project.tables.map((t) => [t.id, t.label]))
  return (
    <>
      <Section title="Seating summary">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Seats" value={seats.toLocaleString('en-IN')} sub={`${tables.length} tables / rows`} />
          <Stat label="Guests" value={project.guests.length.toLocaleString('en-IN')} sub={unseated ? `${unseated} not seated` : project.guests.length ? 'all seated' : 'add your list'} />
        </div>
        {project.guests.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {MEALS.filter((m) => meals[m.id]).map((m) => (
              <span key={m.id} className="rounded-md border border-line px-2 py-0.5 text-[10px] mono">
                {m.name} {meals[m.id]}
              </span>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Guest list"
        right={
          <div className="flex gap-1">
            <button className={`btn btn-icon h-7 w-7 ${adding ? 'btn-on' : ''}`} title="Add guests" onClick={() => setAdding(!adding)}>
              <UserPlus size={13} />
            </button>
            <button className="btn btn-icon h-7 w-7" title="Download seating chart (CSV)" disabled={!project.guests.length} onClick={() => download(`${slug(project)}-seating.csv`, '﻿' + seatingCSV(project), 'text/csv')}>
              <Download size={13} />
            </button>
          </div>
        }
      >
        {adding && (
          <div className="space-y-2 fade-in">
            <textarea
              className="field h-28 py-2 text-[11px] leading-relaxed resize-y"
              placeholder={'One guest per line: Name, Group, Meal, VIP\nAarav Mehta, Bride family, Veg, VIP\nSara Khan, College friends, Non-veg\nPaste straight from Excel or Google Sheets.'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <button
              className="btn w-full justify-center"
              disabled={!paste.trim()}
              onClick={() => {
                const add = parseGuests(paste)
                mutate((p) => void p.guests.push(...add))
                setPaste('')
                setAdding(false)
                notify(`Added ${add.length} guest${add.length === 1 ? '' : 's'}`)
              }}
            >
              <UserPlus size={13} /> Add guests
            </button>
          </div>
        )}
        {project.guests.length > 0 && (
          <>
            <button
              className="btn btn-primary w-full justify-center"
              disabled={!tables.length || !unseated}
              title={tables.length ? 'Seat everyone who has no table: VIPs nearest the stage, groups together' : 'Add tables first'}
              onClick={() => {
                const before = unseated
                const next = autoSeat(project)
                mutate((p) => void (p.guests = next))
                const left = next.filter((g) => !g.tableId).length
                notify(left ? `Seated ${before - left}. ${left} still need a seat: add more tables.` : `Seated ${before} guests`)
              }}
            >
              <Sparkles size={13} /> Auto-seat {unseated ? `${unseated} guests` : 'guests'}
            </button>
            <input className="field" placeholder="Search guests or groups" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="divide-y divide-line -mx-1">
              {shown.slice(0, 300).map((g) => (
                <GuestRow key={g.id} g={g} tables={tables} label={label} />
              ))}
            </div>
            {shown.length > 300 && <p className="text-[10px] text-mute">Showing 300 of {shown.length}. Search to find others.</p>}
          </>
        )}
        {!project.guests.length && !adding && <p className="text-[11px] text-mute">No guests yet. Add your list to seat people and count meals.</p>}
      </Section>
    </>
  )
}

function GuestRow({ g, tables, label }: { g: Guest; tables: Table[]; label: Map<string, string> }) {
  const set = (patch: Partial<Guest>) => useStore.getState().mutate((p) => void Object.assign(p.guests.find((x) => x.id === g.id)!, patch))
  return (
    <div className="flex items-center gap-1.5 px-1 py-1.5 group">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] truncate">
          {g.vip && <span className="mono text-[9px] border border-line rounded px-1 mr-1">VIP</span>}
          {g.name}
        </div>
        {g.group && <div className="text-[10px] text-mute truncate">{g.group}</div>}
      </div>
      <select className="field h-7 w-[68px] px-1 text-[10px]" value={g.meal} onChange={(e) => set({ meal: e.target.value as Meal })} aria-label="Meal">
        {MEALS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select className="field h-7 w-[62px] px-1 text-[10px]" value={g.tableId ?? ''} onChange={(e) => set({ tableId: e.target.value || undefined })} aria-label="Table">
        <option value="">—</option>
        {tables.map((t) => (
          <option key={t.id} value={t.id}>
            {t.kind === 'row' ? t.label : `T${label.get(t.id)}`}
          </option>
        ))}
      </select>
      <button className="text-mute hover:text-white opacity-0 group-hover:opacity-100" title="Remove guest" onClick={() => useStore.getState().mutate((p) => void (p.guests = p.guests.filter((x) => x.id !== g.id)))}>
        <X size={12} />
      </button>
    </div>
  )
}

function TablePanel({ t }: { t: Table }) {
  const project = useStore((s) => s.project)
  const { mutate, select } = useStore.getState()
  const upd = (patch: Partial<Table>) => mutate((p) => void Object.assign(p.tables.find((x) => x.id === t.id)!, patch))
  const at = project.guests.filter((g) => g.tableId === t.id)
  const free = project.guests.filter((g) => !g.tableId)
  const preset = TABLE_PRESETS.find((p) => p.kind === t.kind)
  const round = t.kind === 'round' || t.kind === 'cocktail'
  return (
    <div className="fade-in">
      <Section
        title={preset?.name.replace(/ \d.*/, '') ?? 'Table'}
        right={
          <div className="flex gap-1">
            <button className="btn btn-icon h-7 w-7" title="Duplicate" onClick={() => mutate((p) => void p.tables.push({ ...t, id: nanoid(8), x: t.x + 0.5 + t.w, label: isSeated(t.kind) && t.kind !== 'row' ? String(p.tables.length + 1) : t.label }))}>
              <Copy size={13} />
            </button>
            <button
              className="btn btn-icon h-7 w-7"
              title="Delete"
              onClick={() => {
                mutate((p) => {
                  p.tables = p.tables.filter((x) => x.id !== t.id)
                  p.guests.forEach((g) => g.tableId === t.id && (g.tableId = undefined))
                })
                select(null)
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        }
      >
        <Txt label={t.kind === 'row' ? 'Row name' : 'Table name or number'} value={t.label} onChange={(label) => upd({ label })} />
        <div className="grid grid-cols-2 gap-2">
          {isSeated(t.kind) && <Num label="Seats" value={t.seats} onChange={(seats) => upd({ seats: Math.max(1, Math.min(24, Math.round(seats))) })} int step={1} min={1} />}
          <Num label="Rotation" value={t.rotation} onChange={(rotation) => upd({ rotation })} unit="°" step={15} />
          <Num label={round ? 'Diameter' : 'Width'} value={t.w} onChange={(w) => upd(round ? { w, l: w } : { w })} unit="m" step={0.1} min={0.4} />
          {!round && <Num label="Depth" value={t.l} onChange={(l) => upd({ l })} unit="m" step={0.1} min={0.3} />}
        </div>
        {t.kind === 'round' && <Check label="Cabaret (leave the stage side open)" checked={!!t.open} onChange={(open) => upd({ open })} />}
      </Section>
      {isSeated(t.kind) && (
        <Section title={`Guests ${at.length}/${t.seats}`} right={at.length > t.seats ? <span className="text-[10px] text-err">over</span> : undefined}>
          {at.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-[11px]">
              <span className="truncate">
                {g.name} <span className="text-mute">· {MEALS.find((m) => m.id === g.meal)?.name}</span>
              </span>
              <button className="text-mute hover:text-white" title="Unseat" onClick={() => mutate((p) => void (p.guests.find((x) => x.id === g.id)!.tableId = undefined))}>
                <X size={12} />
              </button>
            </div>
          ))}
          {at.length < t.seats && free.length > 0 && (
            <select className="field" value="" onChange={(e) => e.target.value && mutate((p) => void (p.guests.find((x) => x.id === e.target.value)!.tableId = t.id))}>
              <option value="">Seat a guest here…</option>
              {free.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.group ? ` (${g.group})` : ''}
                </option>
              ))}
            </select>
          )}
          {!project.guests.length && (
            <p className="text-[11px] text-mute flex items-center gap-1.5">
              <Users size={12} /> Add guests from the list (click empty floor).
            </p>
          )}
        </Section>
      )}
    </div>
  )
}

