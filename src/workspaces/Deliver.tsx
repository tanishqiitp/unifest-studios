import { useEffect, useMemo, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Box, Copy, FileCode2, FileDown, FileJson, FileSpreadsheet, FileText, Image as ImageIcon, Link2, MessageCircle, Ruler } from 'lucide-react'
import { useStore } from '../store'
import { fmt, pixelLayout, totals } from '../lib/calc'
import { download, exportDXF, exportPixelMap, exportProject, exportResolume, pixelMapCanvas, shareLink, slug } from '../lib/export/files'
import { equipmentCSV } from '../lib/export/equipment'
import { seatingCSV } from '../lib/seating'
import { cloudEnabled, ensureShare, shortLink, useAuth } from '../lib/cloud'

export function DeliverWorkspace() {
  const project = useStore((s) => s.project)
  const { notify, setUI } = useStore.getState()
  const t = totals(project)
  const pl = pixelLayout(project)
  const user = useAuth((a) => a.user)
  const [code, setCode] = useState<string | null>(null)
  // Signed in: a short link that always shows the latest saved design.
  useEffect(() => {
    if (!user) return setCode(null)
    const t = setTimeout(() => ensureShare(project).then(setCode).catch(() => setCode(null)), code ? 1500 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, project])
  const longLink = useMemo(() => shareLink(project), [project])
  const link = code ? shortLink(code) : longLink
  const [qr, setQr] = useState<string | null>(null)
  const preview = useMemo(() => (pl.width ? pixelMapCanvas(project, 900).toDataURL() : null), [project, pl.width])
  const qrFits = link.length < 2900
  const isLocal = /localhost|127\.0\.0\.1/.test(location.host)

  useEffect(() => {
    if (!qrFits) return setQr(null)
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'L' })
      .then(setQr)
      .catch(() => setQr(null))
  }, [link, qrFits])

  const run = async (label: string, fn: () => void | Promise<void>) => {
    try {
      await fn()
      notify(`${label} exported`)
    } catch (e) {
      notify(`Export failed: ${(e as Error).message}`)
    }
  }
  // The PDF library is large, so it loads on first use.
  const pdf = () => run('Technical PDF', async () => (await import('../lib/export/pdf')).exportTechnicalPDF(project))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-10 fade-in">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
          <div>
            <div className="label">Deliver</div>
            <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{project.name}</h1>
            <p className="text-sm text-dim mt-1">Present it to your client. Hand it to your crew.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="Pixels" value={`${t.pxW}×${t.pxH}`} />
            <Kpi label="LED area" value={`${fmt(t.ledArea, 1)} m²`} />
            <Kpi label="Weight" value={`${Math.round(t.weight)} kg`} />
            <Kpi label="Power" value={`${fmt(t.powerKw, 1)} kW`} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h2 className="font-display text-lg font-semibold mb-1">Share with client</h2>
            <p className="text-xs text-mute mb-4">Present and sell your proposal.</p>
            <div className="card p-5 glow mb-3">
              <div className="flex gap-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Link2 size={15} /> Live 3D client view
                  </div>
                  <p className="text-xs text-dim mt-1 leading-relaxed">
                    {code
                      ? 'A short, read-only 3D link that works on phones. It always shows your latest saved design, so you never need to resend it.'
                      : 'A read-only, interactive 3D link that works on phones. The whole design travels inside the link, so no account is needed.'}
                  </p>
                  {code && <p className="mono text-[11px] text-white mt-2 truncate">{link.replace(/^https?:\/\//, '')}</p>}
                  {!user && cloudEnabled && <p className="text-[11px] text-mute mt-2">Sign in for a short link that updates itself when you change the design.</p>}
                  {isLocal && <p className="text-[11px] text-warn mt-2">You're running locally, so this link only opens on this computer. Deploy the app to share it with others.</p>}
                  <div className="flex gap-2 mt-4">
                    <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(link).then(() => notify('Link copied'))}>
                      <Copy size={13} /> Copy link
                    </button>
                    <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`${project.name}: 3D stage preview ${link}`)}`} target="_blank" rel="noreferrer">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                    <a className="btn" href={link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                </div>
                <div className="w-[132px] shrink-0">
                  {qr ? <img src={qr} alt="QR code for the 3D client view" className="w-full rounded-lg" /> : <div className="aspect-square rounded-lg border border-line text-[10px] text-mute p-3 flex items-center text-center">Link too long for a QR code. Copy the link instead.</div>}
                </div>
              </div>
            </div>
            <Row icon={<Box size={15} />} title="3D renders" sub="High-res PNG from any camera angle" action="Open 3D" onClick={() => setUI({ workspace: 'viz' })} />
            <Row icon={<ImageIcon size={15} />} title="Pixel map preview" sub="Share the screen layout with content designers" action="PNG" onClick={() => run('Pixel map', () => exportPixelMap(project))} disabled={!pl.width} />
          </div>

          <div>
            <h2 className="font-display text-lg font-semibold mb-1">Technical crew</h2>
            <p className="text-xs text-mute mb-4">Files ready for the build.</p>
            <Row icon={<FileText size={15} />} title="Technical PDF pack" sub="Screens, pixel map, power phases, circuits, rigging loads, ground plan, equipment" action="PDF" onClick={pdf} primary />
            <Row icon={<Ruler size={15} />} title="AutoCAD blueprint (.DXF)" sub="1:1 metres · top view + front elevation · layered" action="DXF" onClick={() => run('DXF', () => exportDXF(project))} />
            <Row icon={<ImageIcon size={15} />} title="Official LED pixel map" sub={pl.width ? `Native ${pl.width} × ${pl.height} px PNG content template` : 'Add a screen first'} action="PNG" onClick={() => run('Pixel map', () => exportPixelMap(project))} disabled={!pl.width} />
            <Row icon={<FileCode2 size={15} />} title="Resolume Arena 7" sub="Advanced Output XML preset (beta: check in Arena)" action="XML" onClick={() => run('Resolume 7 XML', () => exportResolume(project, 7))} disabled={!pl.width} />
            <Row icon={<FileCode2 size={15} />} title="Resolume Arena 6" sub="XML preset compatible with v6 (beta)" action="XML" onClick={() => run('Resolume 6 XML', () => exportResolume(project, 6))} disabled={!pl.width} />
            <Row icon={<FileSpreadsheet size={15} />} title="Equipment list" sub="Quantities, weights and power (opens in Excel)" action="CSV" onClick={() => run('Equipment CSV', () => download(`${slug(project)}-equipment.csv`, '﻿' + equipmentCSV(project), 'text/csv'))} />
            <Row icon={<FileSpreadsheet size={15} />} title="Seating chart" sub={project.guests.length ? `${project.guests.length} guests by table, with meals (opens in Excel)` : 'Add guests in the Seating workspace first'} action="CSV" onClick={() => run('Seating chart', () => download(`${slug(project)}-seating.csv`, '﻿' + seatingCSV(project), 'text/csv'))} disabled={!project.guests.length} />
            <Row icon={<FileJson size={15} />} title="Project file (.unifest)" sub="Editable by your team" action="Save" onClick={() => run('Project file', () => exportProject(project))} />
          </div>
        </div>

        {preview && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <div className="label">Pixel map · {pl.width} × {pl.height} px</div>
              <button className="btn" onClick={() => run('Pixel map', () => exportPixelMap(project))}>
                <FileDown size={13} /> Download native PNG
              </button>
            </div>
            <div className="card p-4 bg-black">
              <img src={preview} alt="Pixel map preview" className="w-full h-auto" style={{ imageRendering: 'pixelated' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2 min-w-[110px]">
      <div className="label">{label}</div>
      <div className="mono text-sm">{value}</div>
    </div>
  )
}

function Row({ icon, title, sub, action, onClick, disabled, primary }: { icon: ReactNode; title: string; sub: string; action: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line px-4 py-3 mb-2 hover:border-line-hi transition-colors">
      <div className="h-9 w-9 rounded-lg border border-line flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-mute truncate">{sub}</div>
      </div>
      <button className={`btn ${primary ? 'btn-primary' : ''}`} onClick={onClick} disabled={disabled}>
        <FileDown size={13} /> {action}
      </button>
    </div>
  )
}
