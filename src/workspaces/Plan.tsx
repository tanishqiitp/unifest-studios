import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import { CheckCircle2, Download, FileText, MessageSquare, Plus, RefreshCw, ShieldCheck, Trash2, Truck as TruckIcon, Users, Wand2, Zap } from 'lucide-react'
import { useStore } from '../store'
import type { CrewMember, Cue, Project, QuoteSettings } from '../types'
import { defaultQuote, defaultRate, exportQuotePDF, fullEquipment, quoteCSV, quoteLines, quoteTotals, SAC } from '../lib/quote'
import { availability, crewSuggestion, generatorPlan, inventoryFromProject, otherProjects, packList, readInventory, writeInventory, type InvItem } from '../lib/resources'
import { checklistFor, CHECKLIST_DISCLAIMER, crowdCheck, INDIAN_STATES, noiseNote } from '../lib/safety'
import { download } from '../lib/export/files'
import { cloudEnabled, listFeedback, useAuth, type Feedback } from '../lib/cloud'
import { Num, Stat, Txt } from '../components/ui'

type Tab = 'quote' | 'show' | 'crew' | 'resources' | 'safety' | 'feedback'
const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'quote', label: 'Quotation', icon: FileText },
  { id: 'show', label: 'Run of show', icon: Zap },
  { id: 'crew', label: 'Crew', icon: Users },
  { id: 'resources', label: 'Stock & logistics', icon: TruckIcon },
  { id: 'safety', label: 'Safety & permits', icon: ShieldCheck },
  { id: 'feedback', label: 'Client feedback', icon: MessageSquare },
]

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export function PlanWorkspace() {
  const [tab, setTab] = useState<Tab>('quote')
  const project = useStore((s) => s.project)
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-line px-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} className={`h-11 px-3 text-xs flex items-center gap-1.5 border-b-2 whitespace-nowrap ${tab === t.id ? 'border-white text-white' : 'border-transparent text-dim hover:text-white'}`} onClick={() => setTab(t.id)}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <EventDate project={project} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-5">
          {tab === 'quote' && <QuoteTab project={project} />}
          {tab === 'show' && <ShowTab project={project} />}
          {tab === 'crew' && <CrewTab project={project} />}
          {tab === 'resources' && <ResourcesTab project={project} />}
          {tab === 'safety' && <SafetyTab project={project} />}
          {tab === 'feedback' && <FeedbackTab project={project} />}
        </div>
      </div>
    </div>
  )
}

function EventDate({ project }: { project: Project }) {
  const { mutate } = useStore.getState()
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-mute">Event date</span>
      <input type="date" className="field h-8 w-36" value={project.eventDate ?? ''} onChange={(e) => mutate((p) => void (p.eventDate = e.target.value || undefined))} />
      <input type="number" min={1} className="field h-8 w-14" value={project.eventDays ?? 1} onChange={(e) => mutate((p) => void (p.eventDays = Math.max(1, Number(e.target.value) || 1)))} title="Days" />
      <span className="text-mute">days</span>
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="font-display font-semibold text-sm">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- quotation

function QuoteTab({ project }: { project: Project }) {
  const { mutate, notify } = useStore.getState()
  const q = project.quote ?? defaultQuote()
  const up = (patch: Partial<QuoteSettings>) => mutate((p) => void (p.quote = { ...(p.quote ?? defaultQuote()), ...patch }))
  const lines = quoteLines(project)
  const t = quoteTotals(project)
  const cats = [...new Set(lines.map((l) => l.category))]
  const rows = fullEquipment(project)
  const baseRate = (item: string) => q.rates[item] ?? defaultRate(rows.find((r) => r.item === item) ?? { category: '', item, qty: 0, unit: '', weightKg: 0, powerW: 0 })
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <div>
        <Card
          title="Bill of quantities and quotation"
          right={
            <div className="flex gap-1.5">
              <button className="btn" onClick={() => download(`${project.name.replace(/\s+/g, '-')}-quote.csv`, quoteCSV(project), 'text/csv')}>
                <Download size={13} /> CSV
              </button>
              <button className="btn btn-primary" onClick={() => (exportQuotePDF(project), notify('Quotation PDF downloaded'))}>
                <FileText size={13} /> Quotation PDF
              </button>
            </div>
          }
        >
          <p className="text-[11px] text-mute mb-3">Built from everything in your design. Rates are per unit per day in INR; change any rate and it is remembered for this project.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-mute text-left">
                <th className="font-normal py-1">Item</th>
                <th className="font-normal text-right">Qty</th>
                <th className="font-normal text-right w-28">Rate / day</th>
                <th className="font-normal text-right">Days</th>
                <th className="font-normal text-right">Amount</th>
              </tr>
            </thead>
            {cats.map((c) => (
              <tbody key={c}>
                <tr>
                  <td colSpan={5} className="pt-3 pb-1 text-[10px] uppercase tracking-wider text-dim">
                    {c}
                  </td>
                </tr>
                {lines
                  .filter((l) => l.category === c)
                  .map((l, i) => (
                    <tr key={l.item + i} className="border-t border-line">
                      <td className="py-1 pr-2">{l.item}</td>
                      <td className="text-right mono">
                        {l.qty} {l.unit}
                      </td>
                      <td className="text-right">
                        {c === 'Extras' ? (
                          <span className="mono">{inr(l.rate)}</span>
                        ) : (
                          <input type="number" className="field h-7 w-24 text-right mono" value={baseRate(l.item)} min={0} onChange={(e) => up({ rates: { ...q.rates, [l.item]: Math.max(0, Number(e.target.value) || 0) } })} />
                        )}
                      </td>
                      <td className="text-right mono">{l.days}</td>
                      <td className="text-right mono">{inr(l.amount)}</td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
          <Extras q={q} up={up} />
        </Card>
      </div>
      <div>
        <Card title="Totals">
          <div className="space-y-1 text-xs mono">
            <Line k="Subtotal" v={inr(t.subtotal)} />
            {t.discount > 0 && <Line k={`Discount ${q.discount}%`} v={`− ${inr(t.discount)}`} />}
            <Line k="Taxable value" v={inr(t.taxable)} />
            {q.sameState ? (
              <>
                <Line k={`CGST ${q.gstRate / 2}%`} v={inr(t.cgst)} />
                <Line k={`SGST ${q.gstRate / 2}%`} v={inr(t.sgst)} />
              </>
            ) : (
              <Line k={`IGST ${q.gstRate}%`} v={inr(t.igst)} />
            )}
            <div className="h-px bg-line my-1" />
            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{inr(t.total)}</span>
            </div>
            <div className="text-[10px] text-mute pt-1">SAC {SAC} · rates in INR</div>
          </div>
        </Card>
        <Card title="Terms">
          <div className="space-y-2">
            <Txt label="Client" value={q.client} onChange={(client) => up({ client })} />
            <Txt label="Client GSTIN" value={q.clientGstin} onChange={(clientGstin) => up({ clientGstin: clientGstin.toUpperCase() })} />
            <Txt label="Your GSTIN" value={q.companyGstin} onChange={(companyGstin) => up({ companyGstin: companyGstin.toUpperCase() })} />
            <div className="grid grid-cols-2 gap-2">
              <Num label="Rental days" value={q.days} onChange={(days) => up({ days: Math.max(1, days) })} int min={1} />
              <Num label="GST" value={q.gstRate} onChange={(gstRate) => up({ gstRate })} unit="%" min={0} max={28} />
              <Num label="Margin" value={q.margin} onChange={(margin) => up({ margin })} unit="%" min={0} />
              <Num label="Discount" value={q.discount} onChange={(discount) => up({ discount })} unit="%" min={0} max={100} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={q.sameState} onChange={(e) => up({ sameState: e.target.checked })} />
              Client in the same state (CGST + SGST, else IGST)
            </label>
            <button className="btn w-full justify-center" onClick={() => up({ rates: {} })}>
              <RefreshCw size={12} /> Reset rates to defaults
            </button>
            <p className="text-[10px] text-mute leading-relaxed">Default rates are rough Indian market figures. Check the GST rate and SAC code that apply to your service with your accountant.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-dim">{k}</span>
      <span>{v}</span>
    </div>
  )
}

function Extras({ q, up }: { q: QuoteSettings; up: (p: Partial<QuoteSettings>) => void }) {
  const set = (id: string, patch: Partial<QuoteSettings['extras'][number]>) => up({ extras: q.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  return (
    <div className="mt-4">
      <div className="label mb-1">Other charges (transport, labour, venue, design fee…)</div>
      {q.extras.map((e) => (
        <div key={e.id} className="flex gap-1.5 mb-1">
          <input className="field h-7 flex-1" placeholder="Item" value={e.item} onChange={(x) => set(e.id, { item: x.target.value })} />
          <input className="field h-7 w-16 text-right" type="number" value={e.qty} onChange={(x) => set(e.id, { qty: Number(x.target.value) || 0 })} />
          <input className="field h-7 w-16" placeholder="unit" value={e.unit} onChange={(x) => set(e.id, { unit: x.target.value })} />
          <input className="field h-7 w-24 text-right" type="number" placeholder="Rate" value={e.rate} onChange={(x) => set(e.id, { rate: Number(x.target.value) || 0 })} />
          <button className="btn btn-icon h-7 w-7" onClick={() => up({ extras: q.extras.filter((x) => x.id !== e.id) })}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ['Transport (truck)', 'trips', 8000],
          ['Labour', 'person-days', 1200],
          ['Design and planning fee', 'lot', 25000],
          ['Custom item', 'pcs', 0],
        ].map(([item, unit, rate]) => (
          <button key={item} className="btn h-7 text-[11px]" onClick={() => up({ extras: [...q.extras, { id: nanoid(6), item: String(item), qty: 1, unit: String(unit), rate: Number(rate) }] })}>
            <Plus size={11} /> {item}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- run of show

function addMinutes(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(':').map(Number)
  const t = ((h || 0) * 60 + (mm || 0) + m + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const SHOW_TEMPLATES: Record<string, [string, number, string, string][]> = {
  Wedding: [
    ['Guest arrival and welcome drinks', 45, 'Hospitality', 'Ambient music, warm wash'],
    ['Couple entry', 10, 'Show caller', 'Entry track, cold pyro ×4, follow spot'],
    ['Family performances', 60, 'Anchor', 'Track list from DJ, stage wash'],
    ['Couple dance', 8, 'Show caller', 'Spot on couple, haze, CO₂ at chorus'],
    ['Dinner and DJ', 120, 'DJ', 'Dance floor lights'],
    ['Finale', 5, 'Show caller', 'Fireworks finale, confetti'],
  ],
  Concert: [
    ['Gates open', 60, 'Security', 'Walk-in playlist, logo on LED'],
    ['Opening act', 45, 'Stage manager', 'Opener content on LED'],
    ['Changeover', 30, 'Stage manager', 'Sponsor loop on LED'],
    ['Headliner', 90, 'Show caller', 'Full rig, pyro cues per setlist'],
    ['Encore', 15, 'Show caller', 'Confetti, CO₂'],
    ['Exit', 30, 'Security', 'House lights, exit music'],
  ],
  Corporate: [
    ['Registration', 45, 'Registration desk', 'Holding slide'],
    ['Welcome by host', 10, 'Anchor', 'Lectern mic, logo sting'],
    ['Keynote', 40, 'Show caller', 'Slides, IMAG on side screens'],
    ['Panel discussion', 45, 'Moderator', '4 handheld mics, lower thirds'],
    ['Awards', 30, 'Show caller', 'Award stings, walk-up music'],
    ['Networking dinner', 90, 'Hospitality', 'Ambient, sponsor loop'],
  ],
}

function ShowTab({ project }: { project: Project }) {
  const { mutate } = useStore.getState()
  const cues = project.cues ?? []
  const set = (id: string, patch: Partial<Cue>) => mutate((p) => void (p.cues = (p.cues ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c))))
  const retime = () =>
    mutate((p) => {
      const list = p.cues ?? []
      for (let i = 1; i < list.length; i++) list[i].time = addMinutes(list[i - 1].time, list[i - 1].minutes)
    })
  const fromTemplate = (k: string) =>
    mutate((p) => {
      let t = '18:00'
      p.cues = SHOW_TEMPLATES[k].map(([title, minutes, owner, av]) => {
        const c: Cue = { id: nanoid(6), time: t, minutes, title, owner, av, notes: '' }
        t = addMinutes(t, minutes)
        return c
      })
    })
  const total = cues.reduce((a, c) => a + c.minutes, 0)
  const csv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    return [['Time', 'Minutes', 'Segment', 'Owner', 'AV / light / effects', 'Notes'].map(esc).join(','), ...cues.map((c) => [c.time, c.minutes, c.title, c.owner, c.av, c.notes].map(esc).join(','))].join('\r\n')
  }
  return (
    <Card
      title="Run of show and cue sheet"
      right={
        <div className="flex gap-1.5 flex-wrap">
          {Object.keys(SHOW_TEMPLATES).map((k) => (
            <button key={k} className="btn h-8" onClick={() => (!cues.length || confirm('Replace the current run of show?')) && fromTemplate(k)}>
              <Wand2 size={12} /> {k}
            </button>
          ))}
          <button className="btn h-8" disabled={!cues.length} onClick={() => download(`${project.name.replace(/\s+/g, '-')}-run-of-show.csv`, csv(), 'text/csv')}>
            <Download size={12} /> CSV
          </button>
          <button className="btn h-8" disabled={!cues.length} onClick={() => printShow(project)}>
            Print
          </button>
        </div>
      }
    >
      <div className="text-[11px] text-mute mb-2">Every segment with its time, who runs it and the AV, light and effect cues. Change a duration and press "Retime" to shift everything after it.</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[760px]">
          <thead>
            <tr className="text-mute text-left">
              <th className="font-normal py-1 w-20">Time</th>
              <th className="font-normal w-16">Min</th>
              <th className="font-normal">Segment</th>
              <th className="font-normal w-32">Owner</th>
              <th className="font-normal">AV · lights · effects</th>
              <th className="font-normal">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cues.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-1 pr-1">
                  <input type="time" className="field h-7" value={c.time} onChange={(e) => set(c.id, { time: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input type="number" className="field h-7 w-14" value={c.minutes} min={0} onChange={(e) => set(c.id, { minutes: Math.max(0, Number(e.target.value) || 0) })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.title} onChange={(e) => set(c.id, { title: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.owner} onChange={(e) => set(c.id, { owner: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.av} onChange={(e) => set(c.id, { av: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.notes} onChange={(e) => set(c.id, { notes: e.target.value })} />
                </td>
                <td>
                  <button className="btn btn-icon h-7 w-7" onClick={() => mutate((p) => void (p.cues = (p.cues ?? []).filter((x) => x.id !== c.id)))}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-3 items-center">
        <button
          className="btn"
          onClick={() =>
            mutate((p) => {
              const last = p.cues?.[p.cues.length - 1]
              ;(p.cues ??= []).push({ id: nanoid(6), time: last ? addMinutes(last.time, last.minutes) : '18:00', minutes: 15, title: '', owner: '', av: '', notes: '' })
            })
          }
        >
          <Plus size={12} /> Add segment
        </button>
        <button className="btn" disabled={cues.length < 2} onClick={retime}>
          <RefreshCw size={12} /> Retime
        </button>
        <span className="text-[11px] text-mute ml-auto">
          {cues.length} segments · {Math.floor(total / 60)} h {total % 60} min{cues.length ? ` · ends ${addMinutes(cues[cues.length - 1].time, cues[cues.length - 1].minutes)}` : ''}
        </span>
      </div>
    </Card>
  )
}

function printShow(p: Project) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  w.document.write(`<!doctype html><title>${esc(p.name)} run of show</title><style>body{font:12px Inter,Arial;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}th{background:#eee}</style><h2>${esc(p.name)}: run of show</h2><p>${p.eventDate ?? ''}</p><table><tr><th>Time</th><th>Min</th><th>Segment</th><th>Owner</th><th>AV / lights / effects</th><th>Notes</th></tr>${(p.cues ?? []).map((c) => `<tr><td>${c.time}</td><td>${c.minutes}</td><td>${esc(c.title)}</td><td>${esc(c.owner)}</td><td>${esc(c.av)}</td><td>${esc(c.notes)}</td></tr>`).join('')}</table>`)
  w.document.close()
  w.print()
}

// ---------------------------------------------------------------- crew

const DEPTS: CrewMember['dept'][] = ['Production', 'LED', 'Lighting', 'Sound', 'Rigging', 'Stage', 'Decor', 'Power', 'Other']

function CrewTab({ project }: { project: Project }) {
  const { mutate, notify } = useStore.getState()
  const crew = project.crew ?? []
  const set = (id: string, patch: Partial<CrewMember>) => mutate((p) => void (p.crew = (p.crew ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c))))
  const sug = crewSuggestion(project)
  return (
    <Card
      title={`Crew roster · ${crew.length}`}
      right={
        <div className="flex gap-1.5">
          <button
            className="btn"
            onClick={() => {
              mutate((p) => void (p.crew = [...(p.crew ?? []), ...sug.map((s) => ({ ...s, id: nanoid(6) }))]))
              notify(`Added ${sug.length} suggested crew positions`)
            }}
          >
            <Wand2 size={12} /> Suggest crew for this design ({sug.length})
          </button>
          <button
            className="btn"
            disabled={!crew.length}
            onClick={() => {
              const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
              download(`${project.name.replace(/\s+/g, '-')}-crew.csv`, [['Dept', 'Role', 'Name', 'Phone', 'Call time'].map(esc).join(','), ...crew.map((c) => [c.dept, c.role, c.name, c.phone, c.call].map(esc).join(','))].join('\r\n'), 'text/csv')
            }}
          >
            <Download size={12} /> CSV
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-mute mb-2">Suggestions are worked out from your design (cabinets, hoists, lights, decks and decor). Crew also appears in the quotation, priced per person-day.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-mute text-left">
              <th className="font-normal py-1">Dept</th>
              <th className="font-normal">Role</th>
              <th className="font-normal">Name</th>
              <th className="font-normal">Phone</th>
              <th className="font-normal w-24">Call</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {crew.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-1 pr-1">
                  <select className="field h-7" value={c.dept} onChange={(e) => set(c.id, { dept: e.target.value as CrewMember['dept'] })}>
                    {DEPTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.role} onChange={(e) => set(c.id, { role: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.name} placeholder="Name" onChange={(e) => set(c.id, { name: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input className="field h-7" value={c.phone} placeholder="+91" onChange={(e) => set(c.id, { phone: e.target.value })} />
                </td>
                <td className="pr-1">
                  <input type="time" className="field h-7" value={c.call} onChange={(e) => set(c.id, { call: e.target.value })} />
                </td>
                <td>
                  <button className="btn btn-icon h-7 w-7" onClick={() => mutate((p) => void (p.crew = (p.crew ?? []).filter((x) => x.id !== c.id)))}>
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn mt-2" onClick={() => mutate((p) => void (p.crew ??= []).push({ id: nanoid(6), name: '', role: '', phone: '', call: '08:00', dept: 'Production' }))}>
        <Plus size={12} /> Add person
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------- resources

function ResourcesTab({ project }: { project: Project }) {
  const [inv, setInv] = useState<InvItem[]>(() => readInventory())
  const [truckKg, setTruckKg] = useState(7000)
  const others = useMemo(() => otherProjects(project), [project])
  const avail = availability(project, inv, others)
  const trucks = packList(project, truckKg)
  const gen = generatorPlan(project)
  const save = (list: InvItem[]) => (setInv(list), writeInventory(list))
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <Card
          title="Stock and availability"
          right={
            <button
              className="btn h-8"
              onClick={() => {
                const add = inventoryFromProject(project).filter((r) => !inv.some((x) => x.item === r.item))
                save([...inv, ...add])
              }}
            >
              <Plus size={12} /> Add this design's items to my stock
            </button>
          }
        >
          <p className="text-[11px] text-mute mb-2">Your own stock, saved in this browser. Projects with overlapping dates are counted against it, so you see what you must hire in.{!project.eventDate && ' Set the event date (top right) to check clashes.'}</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-mute text-left">
                <th className="font-normal py-1">Item</th>
                <th className="font-normal text-right">Need</th>
                <th className="font-normal text-right">Other events</th>
                <th className="font-normal text-right w-20">Own</th>
                <th className="font-normal text-right">Hire in</th>
              </tr>
            </thead>
            <tbody>
              {avail.map((a) => {
                const own = inv.find((x) => x.item === a.item)
                return (
                  <tr key={a.item} className={`border-t border-line ${a.short > 0 ? 'text-warn' : ''}`}>
                    <td className="py-1 pr-2">{a.item}</td>
                    <td className="text-right mono">{a.need}</td>
                    <td className="text-right mono">{a.bookedElsewhere || '—'}</td>
                    <td className="text-right">
                      <input
                        type="number"
                        min={0}
                        className="field h-7 w-16 text-right mono"
                        value={own?.qty ?? 0}
                        onChange={(e) => {
                          const qty = Math.max(0, Number(e.target.value) || 0)
                          save(own ? inv.map((x) => (x === own ? { ...x, qty } : x)) : [...inv, { id: a.item, item: a.item, category: '', qty }])
                        }}
                      />
                    </td>
                    <td className="text-right mono">{a.short || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div>
        <Card title="Generator sizing">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Connected load" value={`${gen.connectedKw.toFixed(1)} kW`} />
            <Stat label="Demand" value={`${gen.demandKva.toFixed(0)} kVA`} sub="after diversity, PF 0.8" />
            <Stat label="Suggested" value={`${gen.sets.join(' + ')} kVA`} sub={gen.standby ? '+ 1 standby set' : undefined} />
          </div>
          <p className="text-[10px] text-mute mt-2">Includes 25% headroom. Have a licensed electrician confirm the load, cable sizes and earthing.</p>
        </Card>
        <Card title={`Truck pack list · ${trucks.length} truck${trucks.length === 1 ? '' : 's'}`} right={<Num label="Truck payload" value={truckKg} onChange={setTruckKg} unit="kg" step={500} min={1000} int />}>
          <p className="text-[11px] text-mute mb-2">Loaded in build order: rigging and truss first, decor last.</p>
          {trucks.map((t) => (
            <div key={t.name} className="mb-3">
              <div className="flex justify-between text-xs font-medium border-b border-line pb-1">
                <span>{t.name}</span>
                <span className="mono text-dim">{Math.round(t.kg).toLocaleString('en-IN')} kg</span>
              </div>
              {t.items.map((r, i) => (
                <div key={i} className="flex justify-between text-[11px] py-0.5">
                  <span className="text-dim">
                    {r.category} · {r.item}
                  </span>
                  <span className="mono">× {r.qty}</span>
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- safety

function SafetyTab({ project }: { project: Project }) {
  const { mutate, setUI } = useStore.getState()
  const c = crowdCheck(project)
  const cl = project.checklist ?? { state: 'RJ', done: [] }
  const items = checklistFor(cl.state)
  const groups = [...new Set(items.map((i) => i.group))]
  const done = new Set(cl.done)
  const toggle = (id: string) => mutate((p) => void (p.checklist = { state: cl.state, done: done.has(id) ? cl.done.filter((x) => x !== id) : [...cl.done, id] }))
  return (
    <div className="grid lg:grid-cols-[340px_1fr] gap-4">
      <div>
        <Card title="Crowd and exits">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Audience" value={c.audience.toLocaleString('en-IN')} />
            <Stat label="Space holds" value={c.capacity.toLocaleString('en-IN')} />
            <Stat label="Density" value={`${c.densityPerM2.toFixed(1)} /m²`} sub={c.level === 'ok' ? 'comfortable' : c.level === 'warn' ? 'busy' : 'too crowded'} />
            <Stat label="Exits" value={`${c.exits.length} / ${c.exitsNeeded}`} sub={`${c.totalExitWidth.toFixed(1)} m wide`} />
            <Stat label="Clear-out time" value={Number.isFinite(c.evacMinutes) ? `${c.evacMinutes.toFixed(1)} min` : 'no exits'} sub={`target ${c.targetMinutes} min`} />
            <Stat label="Exit width needed" value={`${c.requiredExitWidth.toFixed(1)} m`} />
          </div>
          <ul className="mt-3 space-y-1">
            {c.messages.map((m, i) => (
              <li key={i} className="text-[11px] text-dim leading-relaxed">
                · {m}
              </li>
            ))}
          </ul>
          <button className="btn w-full justify-center mt-2" onClick={() => setUI({ workspace: 'ground' })}>
            Add exits on the ground plan
          </button>
        </Card>
        <Card title="Sound">
          <p className="text-[11px] text-dim leading-relaxed">{noiseNote(project.eventType)}</p>
        </Card>
      </div>
      <Card
        title={`Permits and safety checklist · ${items.filter((i) => done.has(i.id)).length}/${items.length}`}
        right={
          <select className="field h-8 w-48" value={cl.state} onChange={(e) => mutate((p) => void (p.checklist = { ...cl, state: e.target.value }))}>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        }
      >
        <p className="text-[11px] text-warn mb-3 leading-relaxed">{CHECKLIST_DISCLAIMER}</p>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="text-[10px] uppercase tracking-wider text-dim mb-1">{g}</div>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <label key={i.id} className="flex gap-2 items-start py-1 border-t border-line text-xs cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={done.has(i.id)} onChange={() => toggle(i.id)} />
                  <span className={done.has(i.id) ? 'line-through text-mute' : ''}>
                    {i.text}
                    <span className="block text-[10px] text-mute">{i.who}</span>
                  </span>
                </label>
              ))}
          </div>
        ))}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- client feedback

function FeedbackTab({ project }: { project: Project }) {
  const user = useAuth((s) => s.user)
  const { setUI } = useStore.getState()
  const [list, setList] = useState<Feedback[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () => {
    if (!project.id) return
    setErr(null)
    listFeedback(project.id).then(setList, (e) => setErr((e as Error).message))
  }
  useEffect(load, [project.id, user?.id])
  if (!cloudEnabled || !user)
    return (
      <Card title="Client feedback">
        <p className="text-xs text-dim leading-relaxed">Sign in, then make a client link on the Deliver page. Your client can then leave comments and approve the design or ask for changes right from the link, and it all shows up here.</p>
      </Card>
    )
  const approval = list?.find((f) => f.kind === 'approval')
  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      <Card
        title="Comments from the client link"
        right={
          <button className="btn h-8" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </button>
        }
      >
        {err && <p className="text-xs text-err">{err}</p>}
        {!list ? (
          <p className="text-xs text-mute">Loading…</p>
        ) : list.filter((f) => f.kind === 'comment').length === 0 ? (
          <p className="text-xs text-mute">No comments yet. Share the client link from the Deliver page.</p>
        ) : (
          list
            .filter((f) => f.kind === 'comment')
            .map((f) => (
              <div key={f.id} className="border-t border-line py-2">
                <div className="flex justify-between text-[11px] text-mute">
                  <span className="text-white font-medium">{f.author || 'Client'}</span>
                  <span>{new Date(f.created_at).toLocaleString('en-IN')}</span>
                </div>
                <div className="text-xs mt-0.5 whitespace-pre-wrap">{f.body}</div>
              </div>
            ))
        )}
      </Card>
      <Card title="Approval">
        {approval ? (
          <div className="text-xs space-y-1">
            <div className={`flex items-center gap-1.5 font-medium ${approval.status === 'approved' ? 'text-white' : 'text-warn'}`}>
              <CheckCircle2 size={14} /> {approval.status === 'approved' ? 'Approved' : 'Changes requested'}
            </div>
            <div className="text-dim">
              by {approval.author || 'Client'} · {new Date(approval.created_at).toLocaleString('en-IN')}
            </div>
            {approval.body && <div className="whitespace-pre-wrap">{approval.body}</div>}
          </div>
        ) : (
          <p className="text-xs text-mute">Waiting for the client.</p>
        )}
        <button className="btn w-full justify-center mt-3" onClick={() => setUI({ workspace: 'deliver' })}>
          Get the client link
        </button>
      </Card>
    </div>
  )
}
