import Drawing from 'dxf-writer'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Deck, Project } from '../../types'
import { cableOrder, pixelLayout, rigging, screenColumns, screenStats, TRUSS_INFO } from '../calc'

export function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export const slug = (p: Project) => p.name.trim().replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase() || 'unifest'

// ---------- Pixel map (native resolution) ----------

export function pixelMapCanvas(p: Project, maxSide = Infinity) {
  const pl = pixelLayout(p)
  const k = Math.min(1, maxSide / Math.max(pl.width, pl.height, 1))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(pl.width * k))
  c.height = Math.max(1, Math.round(pl.height * k))
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, c.width, c.height)
  for (const it of pl.items) {
    const s = it.screen
    const pn = it.stats.panel
    const cw = pn.pxW * k
    const ch = pn.pxH * k
    const ox = it.rx * k
    const order = cableOrder(s)
    const num = new Map(order.map((idx, i) => [idx, i + 1]))
    const virtual = new Set(s.virtual)
    for (let r = 0; r < s.rows; r++)
      for (let col = 0; col < s.cols; col++) {
        const idx = r * s.cols + col
        const x = ox + col * cw
        const y = r * ch
        if (virtual.has(idx)) continue
        const v = (r + col) % 2 ? 46 : 30
        g.fillStyle = `rgb(${v},${v},${v})`
        g.fillRect(x, y, cw, ch)
        g.strokeStyle = s.color
        g.lineWidth = Math.max(1, k)
        g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1)
        g.fillStyle = '#ffffffb0'
        g.font = `${Math.max(8, ch * 0.16)}px "JetBrains Mono", monospace`
        g.textBaseline = 'top'
        g.fillText(`${num.get(idx)}`, x + ch * 0.06, y + ch * 0.06)
      }
    const W = s.cols * cw
    const H = s.rows * ch
    g.strokeStyle = '#ffffff'
    g.lineWidth = Math.max(2, 3 * k)
    g.strokeRect(ox + 1, 1, W - 2, H - 2)
    g.beginPath()
    g.moveTo(ox, 0)
    g.lineTo(ox + W, H)
    g.moveTo(ox + W, 0)
    g.lineTo(ox, H)
    g.strokeStyle = '#ffffff30'
    g.stroke()
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const fs = Math.min(H * 0.14, (W / Math.max(4, s.name.length)) * 1.3)
    g.font = `700 ${fs}px "Inter Tight", Inter, sans-serif`
    g.fillText(s.name, ox + W / 2, H / 2 - fs * 0.2)
    g.font = `500 ${fs * 0.36}px "JetBrains Mono", monospace`
    g.fillText(`${it.stats.pxW} × ${it.stats.pxH}  ·  x ${it.rx}  y ${it.ry}`, ox + W / 2, H / 2 + fs * 0.55)
    g.textAlign = 'start'
  }
  return c
}

export function exportPixelMap(p: Project) {
  const c = pixelMapCanvas(p)
  c.toBlob((b) => b && download(`${slug(p)}-pixel-map-${c.width}x${c.height}.png`, b))
}

// ---------- DXF (1:1 metres) ----------

export function exportDXF(p: Project) {
  download(`${slug(p)}.dxf`, dxfString(p), 'application/dxf')
}

// 1:1 metre drawing: top view plus a front elevation offset to the right.
export function dxfString(p: Project) {
  const d = new Drawing()
  d.setUnits('Meters')
  d.addLayer('VENUE', Drawing.ACI.WHITE, 'CONTINUOUS')
  d.addLayer('GROUND', Drawing.ACI.CYAN, 'DASHED')
  d.addLayer('STAGE', Drawing.ACI.WHITE, 'CONTINUOUS')
  d.addLayer('TRUSS', Drawing.ACI.YELLOW, 'CONTINUOUS')
  d.addLayer('RIGGING', Drawing.ACI.RED, 'CONTINUOUS')
  d.addLayer('LED', Drawing.ACI.GREEN, 'CONTINUOUS')
  d.addLayer('TEXT', Drawing.ACI.WHITE, 'CONTINUOUS')
  const Y = (y: number) => -y // DXF Y axis points up

  // Top view
  d.setActiveLayer('VENUE').drawRect(0, 0, p.venue.w, Y(p.venue.l))
  d.setActiveLayer('TEXT').drawText(0, 1, 0.8, 0, `${p.name} - TOP VIEW (1:1, metres)`)
  d.setActiveLayer('GROUND')
  for (const g of p.ground) {
    d.drawRect(g.x, Y(g.y), g.x + g.w, Y(g.y + g.h))
    d.setActiveLayer('TEXT').drawText(g.x + 0.2, Y(g.y + g.h / 2), 0.4, 0, g.label).setActiveLayer('GROUND')
  }
  d.setActiveLayer('STAGE')
  for (const k of p.decks) d.drawRect(k.x, Y(k.y), k.x + k.w, Y(k.y + k.l))
  d.setActiveLayer('TRUSS')
  for (const t of p.truss) {
    const s = TRUSS_INFO[t.type].size / 2
    const a = Math.atan2(t.y2 - t.y1, t.x2 - t.x1)
    const nx = -Math.sin(a) * s
    const ny = Math.cos(a) * s
    d.drawPolyline(
      [
        [t.x1 + nx, Y(t.y1 + ny)],
        [t.x2 + nx, Y(t.y2 + ny)],
        [t.x2 - nx, Y(t.y2 - ny)],
        [t.x1 - nx, Y(t.y1 - ny)],
      ],
      true,
    )
  }
  const rig = rigging(p)
  d.setActiveLayer('RIGGING')
  for (const s of rig.supports) {
    d.drawCircle(s.x, Y(s.y), 0.2)
    d.setActiveLayer('TEXT').drawText(s.x + 0.3, Y(s.y) + 0.3, 0.3, 0, `${s.label} ${Math.round(s.kg)}kg`).setActiveLayer('RIGGING')
  }
  d.setActiveLayer('LED')
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    const cw = st.panel.w / 1000
    const pts: [number, number][] = []
    screenColumns(s, st.panel).forEach((c, i) => {
      const dx = (Math.cos(c.angle) * cw) / 2
      const dy = (Math.sin(c.angle) * cw) / 2
      if (i === 0) pts.push([c.x - dx, Y(c.y - dy)])
      pts.push([c.x + dx, Y(c.y + dy)])
    })
    d.drawPolyline(pts, false)
  }

  // Front elevation, placed to the right of the top view; Y = height
  const ox = p.venue.w + 15
  d.setActiveLayer('TEXT').drawText(ox, 1, 0.8, 0, 'FRONT ELEVATION')
  d.setActiveLayer('VENUE').drawLine(ox - 2, 0, ox + p.venue.w + 2, 0)
  d.setActiveLayer('STAGE')
  for (const k of p.decks) d.drawRect(ox + k.x, 0, ox + k.x + k.w, k.h)
  d.setActiveLayer('TRUSS')
  for (const t of p.truss) {
    if (Math.abs(t.y1 - t.y2) > 0.01) continue
    const s = TRUSS_INFO[t.type].size
    d.drawRect(ox + Math.min(t.x1, t.x2), t.height, ox + Math.max(t.x1, t.x2), t.height + s)
    if (t.legs) {
      d.drawRect(ox + Math.min(t.x1, t.x2), 0, ox + Math.min(t.x1, t.x2) + s, t.height)
      d.drawRect(ox + Math.max(t.x1, t.x2) - s, 0, ox + Math.max(t.x1, t.x2), t.height)
    }
  }
  d.setActiveLayer('LED')
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    const cw = st.panel.w / 1000
    const ch = st.panel.h / 1000
    const virtual = new Set(s.virtual)
    for (let r = 0; r < s.rows; r++)
      for (let c = 0; c < s.cols; c++) {
        if (virtual.has(r * s.cols + c)) continue
        const x = ox + s.x + c * cw
        const y = s.z + (s.rows - 1 - r) * ch
        d.drawRect(x, y, x + cw, y + ch)
      }
    d.setActiveLayer('TEXT').drawText(ox + s.x, s.z + st.h + 0.3, 0.35, 0, `${s.name} ${st.pxW}x${st.pxH}px ${st.w.toFixed(2)}x${st.h.toFixed(2)}m`).setActiveLayer('LED')
  }
  return d.toDxfString()
}

// ---------- Resolume Arena advanced output (best effort, unverified schema) ----------

export function exportResolume(p: Project, version: 6 | 7) {
  download(`${slug(p)}-resolume-arena${version}.xml`, resolumeXml(p, version), 'application/xml')
}

export function resolumeXml(p: Project, version: 6 | 7) {
  const pl = pixelLayout(p)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  let uid = 1700000000000
  const slices = pl.items
    .map((it) => {
      const { rx, ry } = it
      const w = it.stats.pxW
      const h = it.stats.pxH
      const rect = (tag: string) =>
        `        <${tag} orientation="0">\n          <v x="${rx}" y="${ry}"/>\n          <v x="${rx + w}" y="${ry}"/>\n          <v x="${rx + w}" y="${ry + h}"/>\n          <v x="${rx}" y="${ry + h}"/>\n        </${tag}>`
      return `      <Slice uniqueId="${uid++}">\n        <Params name="Common">\n          <Param name="Name" T="STRING" default="Layer" value="${esc(it.screen.name)}"/>\n          <Param name="Enabled" T="BOOL" default="1" value="1"/>\n        </Params>\n${rect('InputRect')}\n${rect('OutputRect')}\n      </Slice>`
    })
    .join('\n')
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by Unifest Studios. Resolume ${version === 7 ? 'Arena 7' : 'Arena 6'} Advanced Output preset (beta: verify in Arena). -->
<XmlState name="${esc(p.name)}">
  <versionInfo name="Resolume Arena" majorVersion="${version}" minorVersion="0" microVersion="0" revision="0"/>
  <ScreenSetup name="ScreenSetup">
    <Params name="ScreenSetupParams"/>
    <CurrentCompositionTextureSize width="${pl.width}" height="${pl.height}"/>
    <screens>
    <Screen name="${esc(p.name)}" uniqueId="${uid++}">
      <Params name="Params">
        <Param name="Name" T="STRING" default="" value="${esc(p.name)}"/>
        <Param name="Enabled" T="BOOL" default="1" value="1"/>
      </Params>
      <guides/>
      <layers>
${slices}
      </layers>
      <OutputDevice>
        <OutputDeviceVirtual name="${esc(p.name)}" deviceId="VirtualScreen 1" width="${pl.width}" height="${pl.height}"/>
      </OutputDevice>
    </Screen>
    </screens>
    <SoftEdging/>
  </ScreenSetup>
</XmlState>
`
  return xml
}

// ---------- Project file & share link ----------

export function exportProject(p: Project) {
  download(`${slug(p)}.unifest`, JSON.stringify(p, null, 2), 'application/json')
}

export function readProjectFile(f: File): Promise<Project> {
  return f.text().then((t) => {
    const p = JSON.parse(t) as Project
    if (p.version !== 1 || !Array.isArray(p.screens)) throw new Error('Not a Unifest project file')
    return p
  })
}

// Merge touching decks of equal height into larger rectangles: same look in 3D, far smaller link.
function mergeDecks(decks: Deck[]): Deck[] {
  const key = (n: number) => Math.round(n * 1000)
  const rows: Deck[] = []
  const sorted = decks.slice().sort((a, b) => a.h - b.h || a.y - b.y || a.l - b.l || a.x - b.x)
  for (const d of sorted) {
    const last = rows[rows.length - 1]
    if (last && key(last.h) === key(d.h) && key(last.y) === key(d.y) && key(last.l) === key(d.l) && key(last.x + last.w) === key(d.x)) last.w += d.w
    else rows.push({ ...d })
  }
  const out: Deck[] = []
  for (const d of rows.sort((a, b) => a.h - b.h || a.x - b.x || a.w - b.w || a.y - b.y)) {
    const last = out[out.length - 1]
    if (last && key(last.h) === key(d.h) && key(last.x) === key(d.x) && key(last.w) === key(d.w) && key(last.y + last.l) === key(d.y)) last.l += d.l
    else out.push({ ...d })
  }
  return out.map((d, i) => ({ ...d, id: `d${i}` }))
}

export function shareLink(p: Project) {
  const short = <T extends { id: string }>(a: T[], k: string) => a.map((x, i) => ({ ...x, id: `${k}${i}` }))
  const ids = new Map(p.screens.map((s, i) => [s.id, `s${i}`]))
  const lite: Project = {
    ...p,
    id: undefined,
    venue: { ...p.venue, image: undefined },
    screens: p.screens.map((s) => ({ ...s, id: ids.get(s.id)!, mirrorOf: s.mirrorOf ? ids.get(s.mirrorOf) : undefined, image: undefined })),
    decks: mergeDecks(p.decks),
    ground: short(p.ground, 'g'),
    truss: short(p.truss, 't'),
    hoists: short(p.hoists, 'h'),
    fixtures: short(p.fixtures, 'f'),
  }
  for (const k of LISTS) (lite[k] as unknown as Record<string, unknown>[]) = (lite[k] as unknown as Record<string, unknown>[]).map(dropDefaults)
  return `${location.origin}${location.pathname}#view=${compressToEncodedURIComponent(JSON.stringify(lite, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)))}`
}

// Share links leave out zero, false, empty-text and empty-list fields on list items; reading puts them back.
const LISTS = ['screens', 'ground', 'decks', 'truss', 'hoists', 'fixtures'] as const
const ITEM_DEFAULTS: Record<(typeof LISTS)[number], Record<string, unknown>> = {
  screens: { virtual: [], x: 0, y: 0, z: 0, rotation: 0, curveDeg: 0, shape: 'flat' },
  ground: { x: 0, y: 0, rotation: 0, label: '' },
  decks: { x: 0, y: 0 },
  truss: { x1: 0, y1: 0, x2: 0, y2: 0, legs: false },
  hoists: { x: 0, y: 0 },
  fixtures: { x: 0, y: 0, z: 0 },
}

function dropDefaults(o: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === 0 || v === false || v === '' || v === undefined || (Array.isArray(v) && v.length === 0)) continue
    if (k === 'shape' && v === 'flat') continue
    out[k] = v
  }
  return out
}

export function restoreDefaults(p: Project): Project {
  for (const k of LISTS) (p[k] as unknown as Record<string, unknown>[]) = ((p[k] ?? []) as unknown as Record<string, unknown>[]).map((o) => ({ ...ITEM_DEFAULTS[k], ...o }))
  return p
}

export function readShareHash(): Project | null {
  const m = location.hash.match(/#view=(.+)$/)
  if (!m) return null
  try {
    const p = JSON.parse(decompressFromEncodedURIComponent(m[1]) ?? 'null') as Project | null
    return p ? restoreDefaults(p) : null
  } catch {
    return null
  }
}
