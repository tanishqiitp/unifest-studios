// One-click theme packs: restyle the set, decor, stage, truss, lights and LED content together.
import { useEffect, useRef, useState } from 'react'
import { Palette, Check as Tick } from 'lucide-react'
import { useStore } from '../store'
import { applyTheme, THEMES } from '../lib/themes'
import { Section } from './ui'

export function ThemePicker({ startOpen = false }: { startOpen?: boolean }) {
  const current = useStore((s) => s.project.look?.theme)
  const [open, setOpen] = useState(startOpen)
  const [screens, setScreens] = useState(true)
  const pick = (id: string) => {
    useStore.getState().mutate((p) => applyTheme(p, id, { screens }))
    useStore.getState().notify(`${THEMES.find((t) => t.id === id)?.name} applied: colours, finishes, lights${screens ? ' and screen content' : ''}. Ctrl+Z undoes it.`)
  }
  const cur = THEMES.find((t) => t.id === current)
  return (
    <Section
      title="Theme"
      right={
        <button className="btn h-7 text-[11px]" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Palette size={12} /> {open ? 'Close' : cur ? 'Change' : 'Pick'}
        </button>
      }
    >
      {!open ? (
        <p className="text-[11px] text-mute">{cur ? `${cur.name}: ${cur.blurb}` : 'Restyle the whole design at once: set, decor, stage, truss, light colours and LED content.'}</p>
      ) : (
        <>
          <div className="grid gap-1.5">
            {THEMES.map((t) => (
              <button key={t.id} className={`rounded-lg border px-2.5 py-2 text-left hover:border-line-hi hover:bg-raised ${current === t.id ? 'border-fg' : 'border-line'}`} onClick={() => pick(t.id)}>
                <div className="flex items-center gap-2">
                  <span className="flex shrink-0">
                    {t.swatch.map((c) => (
                      <span key={c} className="h-4 w-4 rounded-full -ml-1 first:ml-0 border border-black/40" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="text-xs font-medium flex-1">{t.name}</span>
                  {current === t.id && <Tick size={13} />}
                </div>
                <div className="text-[10px] text-mute leading-snug mt-0.5">{t.blurb}</div>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-dim">
            <input type="checkbox" checked={screens} onChange={(e) => setScreens(e.target.checked)} /> Also replace the LED screen content
          </label>
        </>
      )}
    </Section>
  )
}

/** Theme as one button in the page bar (the theme styles the whole design, so it lives with the pages). */
export function ThemeButton() {
  const current = useStore((s) => s.project.look?.theme)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])
  const cur = THEMES.find((t) => t.id === current)
  return (
    <div className="relative" ref={box}>
      <button className={`btn h-7 text-[11px] ${open ? 'btn-on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} title="Restyle the whole design at once: set, decor, stage, truss, light colours and LED content">
        {cur ? (
          <span className="flex">
            {cur.swatch.map((c) => (
              <span key={c} className="h-3 w-3 rounded-full -ml-0.5 first:ml-0 border border-black/40" style={{ background: c }} />
            ))}
          </span>
        ) : (
          <Palette size={12} />
        )}
        <span className="hidden sm:inline">{cur ? cur.name : 'Theme'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-40 w-80 max-h-[70vh] overflow-y-auto card fade-in">
          <ThemePicker startOpen />
        </div>
      )}
    </div>
  )
}
