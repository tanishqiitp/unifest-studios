import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div className="label">{title}</div>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

export function Tip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <Info size={12} className="text-mute" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded-lg bg-lift border border-line p-2 text-[11px] leading-snug text-dim opacity-0 group-hover:opacity-100 transition-opacity z-50 normal-case tracking-normal font-normal">
        {text}
      </span>
    </span>
  )
}

export function Num({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  unit,
  tip,
  int,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  unit?: string
  tip?: string
  int?: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value])
  const commit = () => {
    let v = parseFloat(draft)
    if (!Number.isFinite(v)) return setDraft(String(value))
    if (int) v = Math.round(v)
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (v !== value) onChange(v)
    else setDraft(String(value))
  }
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 mb-1 text-[11px] text-dim">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      <span className="relative block">
        <input
          className="field pr-8"
          type="number"
          step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-mute mono">{unit}</span>}
      </span>
    </label>
  )
}

export function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="block">
      <span className="block mb-1 text-[11px] text-dim">{label}</span>
      <input
        className="field"
        style={{ fontFamily: 'var(--font-sans)' }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onChange(draft)}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  )
}

export function Sel<T extends string>({ label, value, options, onChange, tip }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; tip?: string }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 mb-1 text-[11px] text-dim">
        {label}
        {tip && <Tip text={tip} />}
      </span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line p-0.5 bg-black">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-7 rounded-md text-[11px] font-medium transition-colors ${value === o.value ? 'bg-white text-black' : 'text-dim hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-black px-3 py-2">
      <div className="label">{label}</div>
      <div className="mono text-sm mt-0.5">{value}</div>
      {sub && <div className="mono text-[10px] text-mute">{sub}</div>}
    </div>
  )
}

export function Check({ label, checked, onChange, tip }: { label: string; checked: boolean; onChange: (v: boolean) => void; tip?: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-dim cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-white" />
      {label}
      {tip && <Tip text={tip} />}
    </label>
  )
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="font-display text-sm font-semibold">{title}</div>
      <p className="text-xs text-mute mt-1 leading-relaxed">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  // Rendered on <body> so a blurred or transformed parent can't trap the overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <div className={`card fade-in w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[90vh] overflow-auto`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="font-display font-semibold">{title}</div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
