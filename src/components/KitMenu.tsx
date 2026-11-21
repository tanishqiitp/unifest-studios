// "My kit" on each design tab: save what you built here and drop your saved setups into any event.
import { useEffect, useState } from 'react'
import { Briefcase, Plus, Save, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { deleteKit, insertKit, KIT_KINDS, kitSummary, loadKit, saveKit, type KitItem, type KitKind } from '../lib/kit'

function useKit() {
  const [items, setItems] = useState<KitItem[]>(loadKit)
  useEffect(() => {
    const f = () => setItems(loadKit())
    window.addEventListener('unifest:kit', f)
    window.addEventListener('storage', f)
    return () => (window.removeEventListener('unifest:kit', f), window.removeEventListener('storage', f))
  }, [])
  return items
}

export function KitMenu({ kind }: { kind: KitKind }) {
  const project = useStore((s) => s.project)
  const { mutate, notify } = useStore.getState()
  const items = useKit().filter((k) => k.kind === kind)
  const [open, setOpen] = useState(false)
  const now = kitSummary(project, kind)
  const save = () => {
    const name = prompt(`Name this ${KIT_KINDS[kind].toLowerCase()} kit`, `${project.name} ${KIT_KINDS[kind].toLowerCase()}`)
    if (name === null) return
    try {
      saveKit(project, kind, name)
      notify(`Saved to My kit: ${now.text}`)
      setOpen(true)
    } catch {
      notify('Could not save the kit: browser storage is full. Delete some kits or projects.')
    }
  }
  const use = (k: KitItem, mode: 'replace' | 'add') => {
    mutate((p) => insertKit(p, k, mode))
    notify(`${mode === 'replace' ? 'Replaced with' : 'Added'} “${k.name}”. Ctrl+Z undoes it.`)
  }
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-panel px-4 py-2.5 mt-2">
      <div className="flex items-center gap-1.5">
        <button className="flex items-center gap-1.5 text-[11px] font-medium flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Briefcase size={12} /> My kit {items.length ? <span className="text-mute">({items.length})</span> : null}
        </button>
        <button className="btn h-7 text-[11px]" disabled={!now.count} onClick={save} title={`Save this design's ${KIT_KINDS[kind].toLowerCase()} (${now.text}) to reuse in other events`}>
          <Save size={12} /> Save
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-1.5 max-h-[40vh] overflow-y-auto">
          {!items.length && <p className="text-[10px] text-mute">Save your favourite {KIT_KINDS[kind].toLowerCase()} once, then drop it into any event, placed at the front of its stage.</p>}
          {items.map((k) => (
            <div key={k.id} className="rounded-lg border border-line p-2">
              <div className="flex items-start gap-1">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium truncate">{k.name}</div>
                  <div className="text-[10px] text-mute">{k.summary}</div>
                </div>
                <button
                  className="text-mute hover:text-err"
                  aria-label={`Delete kit ${k.name}`}
                  onClick={() => confirm(`Delete “${k.name}” from My kit?`) && deleteKit(k.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1.5">
                <button className="btn h-7 text-[10px] justify-center" onClick={() => use(k, 'replace')} title={`Replace this design's ${KIT_KINDS[kind].toLowerCase()} with the kit`}>
                  Use this
                </button>
                <button className="btn h-7 text-[10px] justify-center" onClick={() => use(k, 'add')} title="Add it alongside what is already here">
                  <Plus size={11} /> Add too
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
