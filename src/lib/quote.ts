import { hasOpening, setLedArea } from './setpieces'
import { partArea } from './parts'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { Decor, DecorKind, Project, QuoteSettings } from '../types'
import { equipmentList, type EquipRow } from './export/equipment'
import { slug } from './export/files'

export const SAC = '998596' // SAC for event management / equipment rental services
const CREW_RATE = 2500
const MARGIN = 14

// Decor, effects and branding: indicative Indian-market rates in INR per unit per day.
export const DECOR_INFO: Record<DecorKind, { name: string; category: 'Decor' | 'Effects' | 'Branding' | 'Model'; weight: number; watts: number; rate: number }> = {
  mandap: { name: 'Mandap', category: 'Decor', weight: 400, watts: 0, rate: 60000 },
  'floral-arch': { name: 'Floral arch', category: 'Decor', weight: 40, watts: 0, rate: 15000 },
  'flower-wall': { name: 'Flower wall', category: 'Decor', weight: 80, watts: 0, rate: 12000 },
  drape: { name: 'Drape', category: 'Decor', weight: 5, watts: 0, rate: 2000 },
  pillar: { name: 'Pillar', category: 'Decor', weight: 25, watts: 0, rate: 1500 },
  chandelier: { name: 'Chandelier', category: 'Decor', weight: 20, watts: 300, rate: 5000 },
  centrepiece: { name: 'Centrepiece', category: 'Decor', weight: 3, watts: 0, rate: 800 },
  'photo-booth': { name: 'Photo booth', category: 'Decor', weight: 120, watts: 500, rate: 10000 },
  'entrance-gate': { name: 'Entrance gate', category: 'Decor', weight: 250, watts: 200, rate: 25000 },
  'cold-pyro': { name: 'Cold pyro (spark machine)', category: 'Effects', weight: 8, watts: 600, rate: 3500 },
  smoke: { name: 'Smoke machine', category: 'Effects', weight: 10, watts: 1200, rate: 1500 },
  'co2-jet': { name: 'CO2 jet', category: 'Effects', weight: 15, watts: 100, rate: 4000 },
  confetti: { name: 'Confetti cannon', category: 'Effects', weight: 6, watts: 0, rate: 2500 },
  flame: { name: 'Flame projector', category: 'Effects', weight: 20, watts: 100, rate: 6000 },
  firework: { name: 'Ground firework (gerb)', category: 'Effects', weight: 1, watts: 0, rate: 800 },
  bubble: { name: 'Bubble machine', category: 'Effects', weight: 5, watts: 150, rate: 1200 },
  banner: { name: 'Banner', category: 'Branding', weight: 3, watts: 0, rate: 1500 },
  standee: { name: 'Standee', category: 'Branding', weight: 4, watts: 0, rate: 1200 },
  flag: { name: 'Flag', category: 'Branding', weight: 1, watts: 0, rate: 400 },
  backdrop: { name: 'Backdrop', category: 'Branding', weight: 30, watts: 0, rate: 8000 },
  model: { name: '3D model', category: 'Model', weight: 0, watts: 0, rate: 0 },
}

// Single-use items are charged once, not per day.
const SINGLE_USE = /firework|confetti/i

// Decor, effects and branding as equipment rows (grouped by kind; banners and standees by sponsor).
export function decorRows(p: Project): EquipRow[] {
  const rows: EquipRow[] = []
  for (const d of (p.decor ?? []) as Decor[]) {
    const info = DECOR_INFO[d.kind]
    if (!info) continue
    const sponsored = (d.kind === 'banner' || d.kind === 'standee') && d.sponsor
    const item = sponsored ? `${info.name} - ${d.sponsor}` : info.name
    const r = rows.find((x) => x.item === item)
    if (r) {
      r.qty += 1
      r.weightKg += info.weight
      r.powerW += info.watts
    } else rows.push({ category: info.category === 'Model' ? 'Decor' : info.category, item, qty: 1, unit: 'pcs', weightKg: info.weight, powerW: info.watts })
  }
  return rows
}

// Scenic set: LED surfaces by area, fabricated pieces by front area, props by piece.
export function setRows(p: Project): EquipRow[] {
  const rows: EquipRow[] = []
  const add = (category: string, item: string, qty: number, unit: string, weightKg: number, powerW: number) => {
    const r = rows.find((x) => x.item === item)
    if (r) {
      r.qty = Math.round((r.qty + qty) * 10) / 10
      r.weightKg += weightKg
      r.powerW += powerW
    } else rows.push({ category, item, qty: Math.round(qty * 10) / 10, unit, weightKg, powerW })
  }
  for (const s of p.set ?? []) {
    const led = setLedArea(s)
    if (led > 0) add('Set', 'Set LED (per m²)', led, 'm²', led * 30, led * 250)
    const front = Math.max(0, s.w * s.h - (s.skin === 'led' ? led : 0))
    if (s.kind === 'scaffold') add('Set', 'Scaffold tower', 1, 'pcs', s.w * s.d * s.h * 25, 0)
    else if (s.kind === 'tent') add('Set', 'Tent / canopy', 1, 'pcs', 80, 0)
    else if (s.kind === 'stall') add('Set', 'Food stall', 1, 'pcs', 150, 500)
    else if (s.kind === 'balloon') add('Set', 'Branded balloon', 1, 'pcs', 40, 0)
    else if (s.kind === 'cutout') add('Set', 'Printed cut-out (per m²)', s.w * s.h, 'm²', s.w * s.h * 6, 0)
    else if (s.skin !== 'led' || hasOpening(s.kind)) add('Set', `Fabricated set, ${s.skin} finish (per m²)`, front, 'm²', front * 18, 0)
    if (s.outline) add('Set', s.outline.style === 'bulb' ? 'Bulb outline (per m)' : 'Neon outline (per m)', 2 * (s.w + s.h), 'm', 0, 2 * (s.w + s.h) * (s.outline.style === 'bulb' ? 40 : 15))
  }
  // Parts from the Model workspace: priced on their surface; LED and glowing parts draw power.
  for (const part of p.parts ?? []) {
    const a = partArea(part)
    if (!a) continue
    if (part.mat.led) add('Set', 'Set LED (per m²)', a / 2, 'm²', (a / 2) * 30, (a / 2) * 250)
    else add('Set', 'Custom 3D fabrication (per m² of surface)', a, 'm²', a * 12, part.mat.glow ? a * 20 : 0)
  }
  return rows
}

export const fullEquipment = (p: Project): EquipRow[] => [...equipmentList(p), ...decorRows(p), ...setRows(p)]

// Lower-case keyword -> INR per unit per day, checked in order.
export const DEFAULT_RATES: Record<string, number> = {
  // Sound plan items first, so 'tower' or 'line array' below don't catch them.
  '12″ line array': 4500,
  '10″ line array': 3500,
  '15″ point-source': 2000,
  '12″ point-source': 1500,
  'front-fill speaker': 800,
  'stage monitor': 1000,
  'flying frame': 1500,
  'chain motor 1 t': 3000,
  'delay tower': 6000,
  'mixing console': 12000,
  'cabling (per source)': 300,
  'microphone / di': 300,
  'led processor': 6000,
  'data cable': 50,
  cabinet: 900,
  'flying bar': 200,
  'ground-stack base': 150,
  'corner / junction': 300,
  tower: 2500,
  hoist: 3000,
  'stage deck': 600,
  'moving head': 1800,
  beam: 1500,
  blinder: 700,
  'line array': 4500,
  subwoofer: 3500,
  generator: 15000,
  chairs: 40,
  barricade: 120,
  'power line': 1000,
}

// Best-guess INR per unit per day for an equipment row. Unknown items are 0 (price them by hand).
const SET_RATES: [RegExp, number][] = [
  [/Set LED/, 350],
  [/Scaffold tower/, 6000],
  [/Tent/, 3500],
  [/Food stall/, 4000],
  [/balloon/i, 15000],
  [/cut-out/, 450],
  [/gold|mirror/, 1800],
  [/Fabricated set/, 900],
  [/Bulb outline/, 250],
  [/Neon outline/, 400],
]

export function defaultRate(row: EquipRow): number {
  if (row.category === 'Set') return SET_RATES.find(([re]) => re.test(row.item))?.[1] ?? 0
  const t = row.item.toLowerCase()
  if (/ port$/.test(t)) return 0
  for (const d of Object.values(DECOR_INFO)) if (d.category !== 'Model' && row.item.startsWith(d.name)) return d.rate
  if (/\bpar\b/.test(t)) return 400
  if (row.category === 'Truss' && !/tower|corner/.test(t)) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*m$/) // truss pieces are priced per metre: "Box truss 4 m"
    return m ? Math.round(150 * Number(m[1])) : 0
  }
  for (const [k, v] of Object.entries(DEFAULT_RATES)) if (t.includes(k)) return v
  return 0
}

export function defaultQuote(): QuoteSettings {
  return { client: '', clientGstin: '', companyGstin: '', sameState: true, gstRate: 18, margin: 0, discount: 0, days: 1, rates: {}, extras: [] }
}

export interface QuoteLine {
  category: string
  item: string
  qty: number
  unit: string
  rate: number
  days: number
  amount: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function quoteLines(p: Project): QuoteLine[] {
  const q = p.quote ?? defaultQuote()
  const days = Math.max(1, q.days || 1)
  // Markup: added on top of each rate (not gross margin). 20% markup = 16.7% gross margin.
  const k = 1 + Math.max(0, q.margin || 0) / 100
  const line = (category: string, item: string, qty: number, unit: string, base: number, single = false): QuoteLine => {
    const rate = r2(base * k)
    return { category, item, qty, unit, rate, days: single ? 1 : days, amount: r2(qty * rate * (single ? 1 : days)) }
  }
  const out = fullEquipment(p).map((r) => line(r.category, r.item, r.qty, r.unit, q.rates[r.item] ?? defaultRate(r), SINGLE_USE.test(r.item)))
  for (const x of q.extras) out.push(line('Extras', x.item, Math.max(0, x.qty || 0), x.unit, Math.max(0, x.rate || 0)))
  const byDept = new Map<string, number>()
  for (const c of p.crew ?? []) byDept.set(c.dept, (byDept.get(c.dept) ?? 0) + 1)
  for (const [dept, n] of byDept) {
    const item = `${dept} crew`
    out.push(line('Crew', item, n, 'person-days', q.rates[item] ?? CREW_RATE))
  }
  return out
}

export function quoteTotals(p: Project) {
  const q = p.quote ?? defaultQuote()
  const subtotal = r2(quoteLines(p).reduce((a, l) => a + l.amount, 0))
  const discount = r2((subtotal * Math.min(100, Math.max(0, q.discount || 0))) / 100)
  const taxable = r2(subtotal - discount)
  const gst = (taxable * q.gstRate) / 100
  const cgst = q.sameState ? r2(gst / 2) : 0
  const sgst = cgst
  const igst = q.sameState ? 0 : r2(gst)
  return { subtotal, discount, taxable, cgst, sgst, igst, total: r2(taxable + cgst + sgst + igst) }
}

/** Lines with no rate: shown as "Unpriced" and left out of the total, never silently as zero. */
export const unpriced = (p: Project) => quoteLines(p).filter((l) => !l.rate).length

export function quoteNumber(p: Project) {
  const q = p.quote ?? defaultQuote()
  if (q.number) return q.number
  const d = new Date(p.updatedAt || Date.now())
  return `Q-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${(p.id ?? 'XXXX').slice(0, 4).toUpperCase()}`
}

export function quoteCSV(p: Project) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['Category', 'Item', 'Qty', 'Unit', 'Rate (INR)', 'Days', 'Amount (INR)']
  const rows = quoteLines(p).map((l) => [l.category, l.item, l.qty, l.unit, l.rate, l.days, l.amount].map(esc).join(','))
  return [head.map(esc).join(','), ...rows].join('\r\n')
}

// jsPDF's default fonts have no rupee glyph, so the PDF writes "Rs.".
const money = (n: number) => `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function exportQuotePDF(p: Project) {
  const q = p.quote ?? defaultQuote()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const t = quoteTotals(p)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('Quotation', MARGIN, 20)
  doc.setFontSize(11)
  doc.text(p.brand?.name ?? 'Unifest Studios', W - MARGIN, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`GSTIN: ${q.companyGstin || '-'}`, W - MARGIN, 25, { align: 'right' })
  doc.setDrawColor(0, 0, 0)
  doc.line(MARGIN, 28, W - MARGIN, 28)
  doc.text(`Client: ${q.client || '-'}`, MARGIN, 35)
  doc.text(`Client GSTIN: ${q.clientGstin || '-'}`, MARGIN, 40)
  doc.text(`Event: ${p.name}${p.eventDate ? `  |  ${p.eventDate}` : ''}`, MARGIN, 45)
  doc.text(`Days: ${q.days}   |   SAC: ${SAC}`, MARGIN, 50)
  const today = new Date()
  const valid = new Date(today.getTime() + (q.validDays ?? 15) * 86400000)
  const d = (x: Date) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`Quotation ${quoteNumber(p)}  ·  Rev ${q.revision ?? 1}${q.status === 'draft' || !q.status ? '  ·  DRAFT' : ''}`, W - MARGIN, 35, { align: 'right' })
  doc.text(`Date: ${d(today)}`, W - MARGIN, 40, { align: 'right' })
  doc.text(`Valid until: ${d(valid)}`, W - MARGIN, 45, { align: 'right' })

  // One table, with a bold row for each category.
  const body: (string | number | { content: string; colSpan: number; styles: Record<string, unknown> })[][] = []
  let cat = ''
  for (const l of quoteLines(p)) {
    if (l.category !== cat) {
      cat = l.category
      body.push([{ content: cat, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [235, 235, 235] } }])
    }
    body.push([l.item, l.qty, l.unit, l.rate ? money(l.rate) : 'Unpriced', l.days, l.rate ? money(l.amount) : '-'])
  }
  autoTable(doc, {
    theme: 'grid',
    startY: 56,
    margin: { left: MARGIN, right: MARGIN, bottom: 22 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.1, textColor: [20, 20, 20] },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    head: [['Item', 'Qty', 'Unit', 'Rate', 'Days', 'Amount']],
    body,
  })

  // Totals block, right-aligned under the table.
  const tot: [string, string][] = [['Subtotal', money(t.subtotal)]]
  if (t.discount) tot.push([`Discount (${q.discount}%)`, `- ${money(t.discount)}`], ['Taxable value', money(t.taxable)])
  if (q.sameState) tot.push([`CGST @ ${q.gstRate / 2}%`, money(t.cgst)], [`SGST @ ${q.gstRate / 2}%`, money(t.sgst)])
  else tot.push([`IGST @ ${q.gstRate}%`, money(t.igst)])
  tot.push(['TOTAL', money(t.total)])
  autoTable(doc, {
    theme: 'plain',
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
    margin: { left: W - MARGIN - 90, right: MARGIN, bottom: 22 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.2, textColor: [0, 0, 0] },
    columnStyles: { 1: { halign: 'right' } },
    body: tot,
    didParseCell: (d) => {
      if (d.row.index === tot.length - 1) d.cell.styles.fontStyle = 'bold'
    },
  })

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`Rates in INR, markup included. Amount = qty x rate x days; then discount, then GST.${unpriced(p) ? ` ${unpriced(p)} item(s) unpriced, not in total.` : ''} Indicative; subject to confirmation.`, MARGIN, H - 8)
    doc.text(`${i} / ${n}`, W - MARGIN, H - 8, { align: 'right' })
  }
  doc.save(`${slug(p)}-quotation.pdf`)
}
