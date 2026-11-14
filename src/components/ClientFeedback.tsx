import { useState } from 'react'
import { CheckCircle2, Loader2, MessageSquare, PencilLine, X } from 'lucide-react'
import { addFeedback } from '../lib/cloud'

// On a client link: leave a comment, approve the design or ask for changes. The designer sees it under Plan → Client feedback.
export function ClientFeedback({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('unifest:client-name') ?? ''
    } catch {
      return ''
    }
  })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const send = async (kind: 'comment' | 'approval', status?: 'approved' | 'changes') => {
    if (kind === 'comment' && !text.trim()) return
    setBusy(true)
    setErr(null)
    try {
      try {
        localStorage.setItem('unifest:client-name', name)
      } catch {
        /* private mode */
      }
      await addFeedback(code, { kind, author: name.trim(), body: text.trim(), status })
      setText('')
      setDone(kind === 'comment' ? 'Comment sent to the designer.' : status === 'approved' ? 'Thanks! The designer has been told you approved this design.' : 'Sent. The designer will update the design.')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button className="btn btn-primary absolute right-4 bottom-20 sm:bottom-4 z-20 shadow-2xl" onClick={() => setOpen(true)}>
        <MessageSquare size={14} /> Comment or approve
      </button>
    )
  return (
    <div className="absolute right-4 bottom-20 sm:bottom-4 z-20 w-[min(340px,calc(100vw-32px))] card p-4 shadow-2xl fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="font-display font-semibold text-sm">Your feedback</div>
        <button className="btn btn-icon h-7 w-7" onClick={() => setOpen(false)} aria-label="Close">
          <X size={13} />
        </button>
      </div>
      {done && <div className="text-xs mb-2 text-white">{done}</div>}
      <input className="field mb-2" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <textarea className="field min-h-[80px] py-2 mb-2" placeholder="e.g. Make the side screens bigger, move the bar to the left…" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      {err && <div className="text-[11px] text-err mb-2">{err}</div>}
      <button className="btn w-full justify-center mb-2" disabled={busy || !text.trim()} onClick={() => send('comment')}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <MessageSquare size={13} />} Send comment
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary justify-center" disabled={busy} onClick={() => send('approval', 'approved')}>
          <CheckCircle2 size={13} /> Approve
        </button>
        <button className="btn justify-center" disabled={busy} onClick={() => send('approval', 'changes')}>
          <PencilLine size={13} /> Ask for changes
        </button>
      </div>
    </div>
  )
}
