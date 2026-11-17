import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { addPoint, deletePoint, listPoints, MAX_POINTS, pointProject } from '../lib/savepoints'
import { Modal } from './ui'

// Named save points for client revisions: save, restore (reversibly) and delete.
export function SavePoints({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)
  const { setProject, notify } = useStore.getState()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [, refresh] = useState(0)
  const points = project.id ? listPoints(project.id) : []
  const fmt = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const save = () => {
    const r = addPoint(project, name || `Save point ${points.length + 1}`, note)
    if (typeof r === 'string') return notify(r)
    setName('')
    setNote('')
    refresh((n) => n + 1)
    notify(`Saved "${r.name}"`)
  }
  const restore = (id: string) => {
    const pt = points.find((x) => x.id === id)
    if (!pt || !project.id) return
    // Keep the current state first, so restoring can always be undone.
    const before = addPoint(project, `Before restoring "${pt.name}"`)
    if (typeof before === 'string') return notify(`${before} Nothing was changed.`)
    setProject(pointProject(pt, project.id))
    refresh((n) => n + 1)
    notify(`Restored "${pt.name}". The previous state is saved as a point too.`)
  }

  return (
    <Modal title="Save points" onClose={onClose}>
      <p className="text-xs text-dim leading-relaxed">Keep named versions of this design, for example before a client call or for each revision. They are stored on this device with the project.</p>
      <div className="mt-4 space-y-2">
        <label className="block">
          <span className="label">Name</span>
          <input className="field h-9 mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rev 2 – client approved stage" maxLength={80} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </label>
        <label className="block">
          <span className="label">Note (optional)</span>
          <input className="field h-9 mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed" maxLength={200} />
        </label>
        <button className="btn btn-primary w-full justify-center h-9" onClick={save}>
          Save this version
        </button>
      </div>
      <div className="mt-5">
        <div className="label mb-2">
          Saved versions ({points.length}/{MAX_POINTS})
        </div>
        {points.length === 0 ? (
          <p className="text-xs text-mute">None yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {points.map((pt) => (
              <li key={pt.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{pt.name}</div>
                  <div className="text-[11px] text-mute truncate">
                    {fmt(pt.at)}
                    {pt.note ? ` · ${pt.note}` : ''}
                  </div>
                </div>
                <button className="btn h-7 text-[11px]" onClick={() => restore(pt.id)} aria-label={`Restore ${pt.name}`}>
                  <RotateCcw size={12} /> Restore
                </button>
                <button
                  className="btn btn-icon h-7 w-7"
                  aria-label={`Delete ${pt.name}`}
                  onClick={() => {
                    if (!confirm(`Delete the save point "${pt.name}"? This cannot be undone.`)) return
                    deletePoint(project.id!, pt.id)
                    refresh((n) => n + 1)
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
