import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { Project } from '../../types'
import { capacity, fmt, pixelLayout, portMap, powerPlan, rigging, screenColumns, screenStats, totals, TRUSS_INFO, VOLTS } from '../calc'
import { getWarnings } from '../warnings'
import { equipmentList } from './equipment'
import { pixelMapCanvas, slug } from './files'
import { GROUND_LABELS } from './labels'

const MARGIN = 14

function header(doc: jsPDF, p: Project, title: string) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(0, 0, 0)
  doc.rect(0, 0, W, 16, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('UNIFEST STUDIOS', MARGIN, 10)
  doc.setFont('helvetica', 'normal')
  doc.text(`${p.name}  ·  ${title}`, W - MARGIN, 10, { align: 'right' })
  doc.setTextColor(0, 0, 0)
}

function footer(doc: jsPDF) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    const W = doc.internal.pageSize.getWidth()
    const H = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text('Indicative engineering figures for planning. Rigging and power must be verified by certified professionals before the build.', MARGIN, H - 6)
    doc.text(`${i} / ${n}`, W - MARGIN, H - 6, { align: 'right' })
  }
}

const tableStyle = {
  theme: 'grid' as const,
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: [210, 210, 210] as [number, number, number], lineWidth: 0.1, textColor: [20, 20, 20] as [number, number, number] },
  headStyles: { fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const },
  margin: { left: MARGIN, right: MARGIN },
}

// Top-view plan drawn as vectors at a true scale (1:N) on the page.
function drawPlan(doc: jsPDF, p: Project, x0: number, y0: number, maxW: number, maxH: number, withRig: boolean) {
  const candidates = [50, 100, 200, 250, 500, 1000]
  const scale = candidates.find((n) => (p.venue.w * 1000) / n <= maxW && (p.venue.l * 1000) / n <= maxH) ?? 1000
  const k = 1000 / scale // mm on paper per metre
  const X = (m: number) => x0 + m * k
  const Y = (m: number) => y0 + m * k
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.rect(X(0), Y(0), p.venue.w * k, p.venue.l * k)
  doc.setLineWidth(0.15)
  doc.setFontSize(6)
  for (const g of p.ground) {
    doc.setDrawColor(120, 120, 120)
    doc.setFillColor(g.kind === 'exit' ? 0 : 240, g.kind === 'exit' ? 0 : 240, g.kind === 'exit' ? 0 : 240)
    doc.rect(X(g.x), Y(g.y), g.w * k, g.h * k, 'FD')
    doc.setTextColor(g.kind === "exit" ? 255 : 60, g.kind === "exit" ? 255 : 60, g.kind === "exit" ? 255 : 60)
    if (g.w * k > 8) doc.text(g.label, X(g.x + g.w / 2), Y(g.y + g.h / 2), { align: 'center', baseline: 'middle', maxWidth: g.w * k })
  }
  doc.setTextColor(0, 0, 0)
  doc.setFillColor(200, 200, 200)
  doc.setDrawColor(60, 60, 60)
  for (const d of p.decks) doc.rect(X(d.x), Y(d.y), d.w * k, d.l * k, 'FD')
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  for (const t of p.truss) doc.line(X(t.x1), Y(t.y1), X(t.x2), Y(t.y2))
  doc.setLineWidth(0.9)
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    const cw = st.panel.w / 1000
    screenColumns(s, st.panel).forEach((c) => {
      const dx = (Math.cos(c.angle) * cw) / 2
      const dy = (Math.sin(c.angle) * cw) / 2
      doc.line(X(c.x - dx), Y(c.y - dy), X(c.x + dx), Y(c.y + dy))
    })
    doc.setFontSize(6)
    doc.text(s.name, X(s.x), Y(s.y) - 1.2)
  }
  if (withRig) {
    const rig = rigging(p)
    doc.setFontSize(5.5)
    for (const s of rig.supports) {
      doc.setFillColor(0, 0, 0)
      doc.circle(X(s.x), Y(s.y), 0.8, 'F')
      doc.text(`${Math.round(s.kg)} kg`, X(s.x) + 1.2, Y(s.y) - 1)
    }
  }
  // Scale bar
  const bar = scale <= 100 ? 5 : 10
  const by = Y(p.venue.l) + 6
  doc.setLineWidth(0.3)
  doc.line(X(0), by, X(bar), by)
  doc.line(X(0), by - 1, X(0), by + 1)
  doc.line(X(bar), by - 1, X(bar), by + 1)
  doc.setFontSize(7)
  doc.text(`${bar} m   ·   SCALE 1:${scale} at A3`, X(bar) + 3, by + 1)
}

export function exportTechnicalPDF(p: Project) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const t = totals(p)

  // Cover
  doc.setFillColor(0, 0, 0)
  doc.rect(0, 0, W, H, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('UNIFEST STUDIOS', MARGIN + 6, 30)
  doc.setFontSize(44)
  doc.text(p.name, MARGIN + 6, 110)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(14)
  doc.setTextColor(170, 170, 170)
  doc.text(`${p.eventType}  ·  Technical production pack  ·  ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, MARGIN + 6, 124)
  const kpis: [string, string][] = [
    ['LED resolution', `${t.pxW} × ${t.pxH} px`],
    ['LED area', `${fmt(t.ledArea, 1)} m²`],
    ['Cabinets', String(t.cabinets)],
    ['Stage', t.stage],
    ['Total weight', `${Math.round(t.weight)} kg`],
    ['Power (max)', `${fmt(t.powerKw, 1)} kW`],
    ['Capacity', `${t.capacity}`],
  ]
  kpis.forEach(([k, v], i) => {
    const x = MARGIN + 6 + i * 56
    doc.setDrawColor(60, 60, 60)
    doc.line(x, 180, x, 210)
    doc.setFontSize(8)
    doc.setTextColor(130, 130, 130)
    doc.text(k.toUpperCase(), x + 4, 188)
    doc.setFontSize(15)
    doc.setTextColor(255, 255, 255)
    doc.text(v, x + 4, 200)
  })

  // LED
  doc.addPage()
  header(doc, p, 'LED screens')
  autoTable(doc, {
    ...tableStyle,
    startY: 24,
    head: [['Screen', 'Panel', 'Cols × rows', 'Size (m)', 'Resolution', 'Cabinets', 'Weight', 'Max W', 'Mount', 'Shape', 'Data ports']],
    body: p.screens.map((s) => {
      const st = screenStats(s, p.customPanels)
      return [s.name, st.panel.model, `${s.cols} × ${s.rows}`, `${fmt(st.w, 2)} × ${fmt(st.h, 2)}`, `${st.pxW} × ${st.pxH}`, st.cabinets, `${Math.round(st.weight)} kg`, `${Math.round(st.maxW)} W`, s.mount, s.shape === 'flat' ? 'flat' : `${s.shape} ${s.curveDeg}°`, portMap(s, st.panel, p.processor.portPx).ports.length]
    }),
  })
  const pl = pixelLayout(p)
  if (pl.width > 0) {
    const c = pixelMapCanvas(p, 2400)
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    const maxW = W - MARGIN * 2
    const maxH = H - y - 20
    const k = Math.min(maxW / c.width, maxH / c.height)
    doc.setFontSize(9)
    doc.text(`Pixel map  ·  ${pl.width} × ${pl.height} px canvas`, MARGIN, y)
    // JPEG keeps the pack small enough to send on WhatsApp or email.
    doc.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', MARGIN, y + 3, c.width * k, c.height * k, undefined, 'FAST')
  }

  // Power
  const pp = powerPlan(p)
  doc.addPage()
  header(doc, p, 'Power & data')
  autoTable(doc, {
    ...tableStyle,
    startY: 24,
    head: [['Phase', 'Amps (max)', 'Circuits']],
    body: (['L1', 'L2', 'L3'] as const).map((ph) => [ph, `${fmt(pp.amps[ph], 1)} A`, pp.circuits.filter((c) => c.phase === ph).length]),
    foot: [[`Imbalance ${Math.round(pp.imbalance * 100)}%`, `${p.circuitAmps} A lines @ ${VOLTS} V`, `${pp.circuits.length} total`]],
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
  })
  autoTable(doc, {
    ...tableStyle,
    head: [['Screen', 'Circuit', 'Phase', 'Cabinets (cable order)', 'Watts', 'Amps']],
    body: pp.circuits.map((c) => {
      const s = p.screens.find((x) => x.id === c.screenId)!
      return [s.name, `C${c.index + 1}`, c.phase, c.cells.length, Math.round(c.watts), fmt(c.amps, 1)]
    }),
  })

  // Rigging
  const rig = rigging(p)
  doc.addPage()
  header(doc, p, 'Stage & rigging plan')
  drawPlan(doc, p, MARGIN, 24, (W - MARGIN * 3) * 0.62, H - 50, true)
  const tx = MARGIN + (W - MARGIN * 3) * 0.62 + MARGIN
  autoTable(doc, {
    ...tableStyle,
    startY: 24,
    margin: { left: tx, right: MARGIN },
    head: [['Point', 'Load', 'Rating']],
    body: rig.supports.map((s) => [s.label, `${Math.round(s.kg)} kg`, s.capacity ? `${s.capacity} kg` : 'NONE']),
  })
  autoTable(doc, {
    ...tableStyle,
    margin: { left: tx, right: MARGIN },
    head: [['Truss', 'Length', 'Trim', 'Live load', 'Limit*']],
    body: rig.trusses.map((r) => [TRUSS_INFO[r.truss.type].name, `${fmt(r.length, 1)} m`, `${r.truss.height} m`, `${Math.round(r.total - r.selfWeight)} kg`, `${Math.round(r.allowable)} kg @ ${fmt(r.maxSpan, 1)} m`]),
  })

  // Ground plan
  doc.addPage()
  header(doc, p, 'Ground plan')
  drawPlan(doc, p, MARGIN, 24, (W - MARGIN * 3) * 0.7, H - 50, false)
  autoTable(doc, {
    ...tableStyle,
    startY: 24,
    margin: { left: MARGIN + (W - MARGIN * 3) * 0.7 + MARGIN, right: MARGIN },
    head: [['Zone', 'Type', 'Size']],
    body: p.ground.map((g) => [g.label, GROUND_LABELS[g.kind], `${fmt(g.w, 1)} × ${fmt(g.h, 1)} m`]),
    foot: [[`Capacity ~ ${capacity(p.ground)}`, `Expected ${p.audience}`, `${p.venue.w} × ${p.venue.l} m`]],
    footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0] },
  })

  // Equipment + checks
  doc.addPage()
  header(doc, p, 'Equipment list & checks')
  autoTable(doc, {
    ...tableStyle,
    startY: 24,
    head: [['Category', 'Item', 'Qty', 'Unit', 'Weight', 'Power']],
    body: equipmentList(p).map((r) => [r.category, r.item, r.qty, r.unit, r.weightKg ? `${Math.round(r.weightKg)} kg` : '', r.powerW ? `${Math.round(r.powerW)} W` : '']),
  })
  const w = getWarnings(p)
  autoTable(doc, {
    ...tableStyle,
    head: [['Check', 'Issue', 'Suggested fix']],
    body: w.length ? w.map((x) => [x.level === 'error' ? 'ERROR' : 'WARN', x.text, x.fix ?? '']) : [['OK', 'No issues found by automatic checks.', '']],
  })

  footer(doc)
  doc.save(`${slug(p)}-technical-pack.pdf`)
}
