import { useEffect, useRef, useState } from 'react'
import { Box, Copy, Flame, Image as ImageIcon, Loader2, Palette, Sparkles, Trash2, Upload } from 'lucide-react'
import { useStore } from '../store'
import type { Decor, DecorKind } from '../types'
import { PlanCanvas } from '../components/PlanCanvas'
import { TopView } from '../components/TopView'
import { stageBounds } from '../lib/calc'
import { DECOR, DECOR_GROUPS, decorPreset, newDecor } from '../lib/decor'
import { deleteModel, MAX_MODEL_MB, saveModel } from '../lib/models'
import { Check, Num, Section, Stat, Txt } from '../components/ui'

// Read an image file as a data URL, shrunk so projects stay small enough to save and share.
export function readImage(f: File, max = 1024): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onerror = () => rej(r.error)
    r.onload = () => {
      const img = new Image()
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * k)
        c.height = Math.round(img.height * k)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        res(c.toDataURL(f.type === 'image/png' || f.type === 'image/svg+xml' ? 'image/png' : 'image/jpeg', 0.85))
      }
      img.onerror = () => rej(new Error('Could not read that image'))
      img.src = String(r.result)
    }
    r.readAsDataURL(f)
  })
}

export function DecorWorkspace() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { mutate, select, notify } = useStore.getState()
  const item = sel?.kind === 'decor' ? project.decor?.find((d) => d.id === sel.id) : undefined
  const sb = stageBounds(project)
  const decor = project.decor ?? []

  const add = (kind: DecorKind) =>
    mutate((p) => {
      const b = stageBounds(p)
      const x = b ? b.x + b.w / 2 : p.venue.w / 2
      const y = b ? b.y + b.l + 2 : p.venue.l / 2
      const d = newDecor(kind, x, y)
      ;(p.decor ??= []).push(d)
      setTimeout(() => select({ kind: 'decor', id: d.id }))
    })

  const preset = (k: Parameters<typeof decorPreset>[1], msg: string) => {
    mutate((p) => void (p.decor = [...(p.decor ?? []), ...decorPreset(p, k)]))
    notify(msg)
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r border-line bg-panel overflow-y-auto">
        {DECOR_GROUPS.map((g) => (
          <Section key={g} title={g}>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(DECOR) as DecorKind[])
                .filter((k) => DECOR[k].group === g)
                .map((k) => (
                  <button key={k} className="rounded-lg border border-line px-2 py-2 text-[11px] text-left hover:border-line-hi hover:bg-raised" title={DECOR[k].tip} onClick={() => add(k)}>
                    + {DECOR[k].name}
                  </button>
                ))}
            </div>
          </Section>
        ))}
        <Section title="Quick setups">
          <div className="grid gap-1.5">
            <button className="btn" onClick={() => preset('wedding-stage', 'Added flower wall, drapes, pillars and an entry arch')}>
              <Sparkles size={13} /> Wedding stage decor
            </button>
            <button className="btn" onClick={() => preset('pyro-front', 'Added 4 cold pyros along the stage front')}>
              <Flame size={13} /> Cold pyro along stage front
            </button>
            <button className="btn" onClick={() => preset('co2-row', 'Added 6 CO₂ jets upstage')}>
              CO₂ jets upstage
            </button>
            <button className="btn" onClick={() => preset('smoke-wings', 'Added smoke guns in both wings')}>
              Smoke in both wings
            </button>
            <button className="btn" onClick={() => preset('fireworks-finale', 'Added 5 firework positions behind the stage')}>
              Fireworks finale
            </button>
            <button className="btn" onClick={() => preset('sponsor-wall', 'Added sponsor standees and side banners')}>
              Sponsor standees and banners
            </button>
          </div>
        </Section>
        <ModelImport />
        <BrandKit />
      </aside>

      <div className="relative flex-1 min-w-0 bg-[#050505]">
        <PlanCanvas
          bounds={sb ? { x: sb.x - 12, y: Math.max(-4, sb.y - 6), w: sb.w + 24, h: sb.l + 22 } : { x: -2, y: -2, w: project.venue.w + 4, h: project.venue.l + 4 }}
          grid={{ x: 0, y: 0, w: project.venue.w, h: project.venue.l }}
          onBackground={() => select(null)}
        >
          <TopView edit="decor" />
        </PlanCanvas>
        <div className="absolute left-4 bottom-4 text-[11px] text-mute">Top view · drag to move · handles to resize and rotate · ● effect with its safety ring · see it all in 3D</div>
      </div>

      <aside className="w-80 shrink-0 border-l border-line bg-panel overflow-y-auto">
        {item ? (
          <DecorProps d={item} />
        ) : (
          <Section title="Decor and effects">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Decor items" value={decor.filter((d) => DECOR[d.kind].group === 'Wedding & decor').length} />
              <Stat label="Effects" value={decor.filter((d) => DECOR[d.kind].effect).length} />
              <Stat label="Branding" value={decor.filter((d) => DECOR[d.kind].artwork).length} />
              <Stat label="3D models" value={decor.filter((d) => d.kind === 'model').length} />
            </div>
            <p className="text-[11px] text-mute leading-relaxed">Add items from the left, then select one to change its size, height, colour, artwork or sponsor. Effects animate in the 3D view and are priced in the quotation.</p>
            <Num label="Haze in 3D" value={Math.round((project.look?.haze ?? 0.3) * 100)} onChange={(v) => mutate((p) => void (p.look = { ...p.look, haze: v / 100 }))} unit="%" step={10} min={0} max={100} int tip="How much haze or smoke hangs in the air. More haze makes light beams more visible." />
          </Section>
        )}
      </aside>
    </div>
  )
}

function DecorProps({ d }: { d: Decor }) {
  const { mutate, select } = useStore.getState()
  const info = DECOR[d.kind]
  const up = (patch: Partial<Decor>) => mutate((p) => Object.assign(p.decor!.find((x) => x.id === d.id)!, patch))
  const file = useRef<HTMLInputElement>(null)
  return (
    <Section
      title={info.name}
      right={
        <div className="flex gap-1">
          <button
            className="btn btn-icon h-7 w-7"
            title="Duplicate"
            onClick={() =>
              mutate((p) => {
                const c = { ...structuredClone(d), id: Math.random().toString(36).slice(2, 10), x: d.x + d.w + 0.5 }
                p.decor!.push(c)
                setTimeout(() => select({ kind: 'decor', id: c.id }))
              })
            }
          >
            <Copy size={13} />
          </button>
          <button className="btn btn-icon h-7 w-7" title="Delete" onClick={() => (mutate((p) => void (p.decor = p.decor!.filter((x) => x.id !== d.id))), select(null))}>
            <Trash2 size={13} />
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-mute leading-relaxed">{info.tip}</p>
      <Txt label="Label" value={d.label} onChange={(label) => up({ label })} />
      <div className="grid grid-cols-3 gap-2">
        <Num label="Width" value={d.w} onChange={(w) => up({ w })} unit="m" step={0.1} min={0.1} />
        <Num label="Depth" value={d.d} onChange={(dd) => up({ d: dd })} unit="m" step={0.1} min={0.02} />
        <Num label={info.effect ? 'Reach' : 'Height'} value={d.h} onChange={(h) => up({ h })} unit="m" step={0.1} min={0.1} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Num label="Base height" value={d.z} onChange={(z) => up({ z })} unit="m" step={0.1} min={0} tip="Raise it onto the stage or hang it (chandeliers)." />
        <Num label="Rotation" value={d.rotation} onChange={(rotation) => up({ rotation })} unit="°" step={15} int />
      </div>
      <label className="flex items-center justify-between text-xs">
        <span className="label">Colour</span>
        <input type="color" value={d.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-14 bg-transparent border border-line rounded" />
      </label>
      {info.effect && (
        <>
          <Num label="Intensity" value={Math.round((d.intensity ?? 0.8) * 100)} onChange={(v) => up({ intensity: v / 100 })} unit="%" step={10} min={10} max={100} int />
          <Check label="Firing in the 3D preview" checked={d.fire ?? true} onChange={(fire) => up({ fire })} />
        </>
      )}
      {(info.artwork || d.kind === 'photo-booth') && (
        <>
          <Txt label="Sponsor or brand" value={d.sponsor ?? ''} onChange={(sponsor) => up({ sponsor: sponsor || undefined })} />
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) up({ image: await readImage(f) })
              e.target.value = ''
            }}
          />
          <div className="flex gap-1.5">
            <button className="btn flex-1 justify-center" onClick={() => file.current?.click()}>
              <ImageIcon size={13} /> {d.image ? 'Replace artwork' : 'Upload artwork or logo'}
            </button>
            {d.image && (
              <button className="btn" onClick={() => up({ image: undefined })}>
                Remove
              </button>
            )}
          </div>
          {d.image && <img src={d.image} alt="" className="w-full rounded border border-line" />}
          <p className="text-[10px] text-mute">Without artwork the item shows the sponsor name, or your brand logo from the brand kit.</p>
        </>
      )}
      {d.kind === 'model' && <ModelProps d={d} up={up} />}
    </Section>
  )
}

function ModelProps({ d, up }: { d: Decor; up: (p: Partial<Decor>) => void }) {
  const [parts, setParts] = useState<string[] | null>(null)
  const [stats, setStats] = useState<{ tri: number; size: [number, number, number] } | null>(null)
  useEffect(() => {
    if (!d.modelId) return
    import('./Decor3D').then(({ loadModel, modelStats }) =>
      loadModel(d.modelId!).then(
        (o) => {
          const s = modelStats(o)
          setParts(s.meshes)
          setStats({ tri: s.triangles, size: [s.size.x, s.size.y, s.size.z] })
        },
        () => setParts([]),
      ),
    )
  }, [d.modelId])
  const hidden = new Set(d.hidden ?? [])
  const scale = stats ? d.w / Math.max(1e-3, stats.size[0]) : 1
  return (
    <div className="space-y-2 pt-2 border-t border-line">
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Triangles" value={stats.tri.toLocaleString('en-IN')} sub={stats.tri > 500000 ? 'heavy: try box view' : undefined} />
          <Stat label="Scale" value={`${Math.round(scale * 100)}%`} />
        </div>
      )}
      {stats && (
        <div className="flex gap-1.5">
          <button className="btn flex-1 justify-center" onClick={() => up({ w: +stats.size[0].toFixed(2), d: +stats.size[2].toFixed(2), h: +stats.size[1].toFixed(2) })}>
            Real size (1:1)
          </button>
          <button className="btn" onClick={() => up({ w: +(d.w * 1.25).toFixed(2), d: +(d.d * 1.25).toFixed(2), h: +(d.h * 1.25).toFixed(2) })}>
            +25%
          </button>
          <button className="btn" onClick={() => up({ w: +(d.w * 0.8).toFixed(2), d: +(d.d * 0.8).toFixed(2), h: +(d.h * 0.8).toFixed(2) })}>
            −20%
          </button>
        </div>
      )}
      <Check label="Paint in one colour" checked={!!d.tint} onChange={(tint) => up({ tint })} />
      <Check label="Wireframe" checked={!!d.wire} onChange={(wire) => up({ wire })} />
      <Check label="Box only (faster on slow computers)" checked={!!d.proxy} onChange={(proxy) => up({ proxy })} />
      {parts && parts.length > 1 && (
        <div>
          <div className="label mb-1">Parts ({parts.length})</div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {parts.slice(0, 200).map((n) => (
              <label key={n} className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={!hidden.has(n)}
                  onChange={(e) => {
                    const h = new Set(hidden)
                    if (e.target.checked) h.delete(n)
                    else h.add(n)
                    up({ hidden: [...h] })
                  }}
                />
                <span className="truncate">{n}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-mute leading-relaxed">The model file stays in this browser. To open this project on another computer, import the file there too.</p>
    </div>
  )
}

function ModelImport() {
  const { mutate, select, notify } = useStore.getState()
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const go = async (f: File, asVenue: boolean) => {
    setBusy(true)
    try {
      const m = await saveModel(f)
      const { loadModel, modelStats } = await import('./Decor3D')
      const s = modelStats(await loadModel(m.id))
      mutate((p) => {
        const x = asVenue ? p.venue.w / 2 : (stageBounds(p)?.x ?? p.venue.w / 2) + (stageBounds(p)?.w ?? 0) / 2
        const y = asVenue ? p.venue.l / 2 : (stageBounds(p)?.y ?? p.venue.l / 2) + (stageBounds(p)?.l ?? 0) + 3
        const d = newDecor('model', x, y, { label: f.name.replace(/\.[^.]+$/, ''), modelId: m.id, w: +s.size.x.toFixed(2) || 1, d: +s.size.z.toFixed(2) || 1, h: +s.size.y.toFixed(2) || 1, proxy: s.triangles > 1_500_000 })
        ;(p.decor ??= []).push(d)
        setTimeout(() => select({ kind: 'decor', id: d.id }))
      })
      notify(`Imported ${f.name}: ${s.triangles.toLocaleString('en-IN')} triangles${s.triangles > 1_500_000 ? '. Shown as a box: untick "Box only" to see it' : ''}`)
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const [venue, setVenue] = useState(false)
  return (
    <Section title="Import 3D model">
      <p className="text-[11px] text-mute leading-relaxed">
        Bring in your own Blender design: a stage set, a custom mandap, props or a whole venue. In Blender use <span className="text-white">File → Export → glTF 2.0 (.glb)</span>. OBJ, FBX and STL also work. Up to {MAX_MODEL_MB} MB.
      </p>
      <input
        ref={file}
        type="file"
        accept=".glb,.gltf,.obj,.fbx,.stl"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) go(f, venue)
          e.target.value = ''
        }}
      />
      <Check label="Place it as the venue (centred)" checked={venue} onChange={setVenue} />
      <button className="btn btn-primary w-full justify-center" disabled={busy} onClick={() => file.current?.click()}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Import .glb / .obj / .fbx
      </button>
      <div
        className="rounded-lg border border-dashed border-line p-3 text-[11px] text-mute text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) go(f, venue)
        }}
      >
        <Box size={14} className="mx-auto mb-1" /> or drop the file here
      </div>
    </Section>
  )
}

function BrandKit() {
  const brand = useStore((s) => s.project.brand)
  const { mutate, notify } = useStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const b = brand ?? { name: '', color: '#ffffff' }
  const up = (patch: Partial<typeof b>) => mutate((p) => void (p.brand = { ...b, ...patch }))
  return (
    <Section title="Brand kit">
      <p className="text-[11px] text-mute leading-relaxed">Your client's or event's logo and colour. Banners, standees and screens without their own artwork use it.</p>
      <Txt label="Brand or event name" value={b.name} onChange={(name) => up({ name })} />
      <label className="flex items-center justify-between text-xs">
        <span className="label">Brand colour</span>
        <input type="color" value={b.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-14 bg-transparent border border-line rounded" />
      </label>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) up({ logo: await readImage(f, 768) })
          e.target.value = ''
        }}
      />
      <button className="btn w-full justify-center" onClick={() => file.current?.click()}>
        <Palette size={13} /> {b.logo ? 'Replace logo' : 'Upload logo'}
      </button>
      {b.logo && <img src={b.logo} alt="" className="max-h-16 mx-auto" />}
      <button
        className="btn w-full justify-center"
        disabled={!b.logo}
        onClick={() => {
          mutate((p) => {
            for (const s of p.screens) if (!s.image && !s.video) s.image = b.logo
          })
          notify('Logo placed on every screen without its own content')
        }}
      >
        Put logo on all screens
      </button>
    </Section>
  )
}

// Clean up model files no project uses any more (called from the home screen if needed).
export async function forgetModel(id: string) {
  await deleteModel(id)
}
