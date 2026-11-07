import { useState } from 'react'
import { Cloud, CloudOff, Loader2, LogOut, Mail } from 'lucide-react'
import { cloudEnabled, sendLoginLink, signOut, useAuth } from '../lib/cloud'
import { useStore } from '../store'
import { Modal } from './ui'

const SYNC_LABEL = { idle: 'Cloud sync on', saving: 'Saving to cloud…', saved: 'Saved to cloud', offline: 'Offline: saved in this browser' } as const

export function AccountButton() {
  const { user, ready, sync } = useAuth()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  if (!cloudEnabled || !ready) return null
  if (!user)
    return (
      <>
        <button className="btn" onClick={() => setOpen(true)} title="Sign in to save projects to the cloud">
          <Cloud size={13} /> Sign in
        </button>
        {open && <SignInModal onClose={() => setOpen(false)} />}
      </>
    )
  const email = user.email ?? 'Account'
  return (
    <div className="relative">
      <button className="btn btn-icon relative" title={`${email} · ${SYNC_LABEL[sync]}`} onClick={() => setMenu(!menu)} aria-label="Account">
        <span className="font-display font-semibold text-xs uppercase">{email[0]}</span>
        <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-ink ${sync === 'offline' ? 'bg-warn' : sync === 'saving' ? 'bg-dim' : 'bg-white'}`} />
      </button>
      {menu && (
        <div className="absolute right-0 top-10 z-40 w-64 card p-3 fade-in" onMouseLeave={() => setMenu(false)}>
          <div className="text-[11px] text-mute">Signed in as</div>
          <div className="text-xs font-medium truncate">{email}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-dim mt-2">
            {sync === 'offline' ? <CloudOff size={12} /> : sync === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Cloud size={12} />}
            {SYNC_LABEL[sync]}
          </div>
          <div className="h-px bg-line my-2" />
          <button
            className="w-full flex items-center gap-2 px-2 h-8 rounded-md text-xs hover:bg-lift"
            onClick={() => {
              setMenu(false)
              signOut().then(() => useStore.getState().notify('Signed out. Projects stay saved in this browser.'))
            }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'form' | 'sending' | 'sent'>('form')
  const [error, setError] = useState<string | null>(null)
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const send = async () => {
    setState('sending')
    setError(null)
    try {
      await sendLoginLink(email.trim())
      setState('sent')
    } catch (e) {
      setError((e as Error).message)
      setState('form')
    }
  }
  return (
    <Modal title="Sign in" onClose={onClose}>
      {state === 'sent' ? (
        <div className="text-center py-4">
          <Mail size={28} className="mx-auto" />
          <div className="font-display text-lg font-semibold mt-3">Check your inbox</div>
          <p className="text-xs text-dim mt-1 leading-relaxed">
            We sent a sign-in link to <span className="text-white">{email.trim()}</span>.
            <br />
            Open it in this browser to finish signing in.
          </p>
          <button className="btn mt-5" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) send()
          }}
        >
          <p className="text-xs text-dim leading-relaxed">Save your projects to the cloud, open them on any computer, and make short client links that always show your latest design. No password: we email you a sign-in link.</p>
          <label className="block">
            <span className="label">Email</span>
            <input className="field mt-1" type="email" autoFocus autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <div className="text-[11px] text-err">{error}</div>}
          <button className="btn btn-primary w-full justify-center h-10" disabled={!valid || state === 'sending'}>
            {state === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Email me a sign-in link
          </button>
          <p className="text-[10px] text-mute text-center">You can keep using Unifest without an account. Projects then stay in this browser.</p>
        </form>
      )}
    </Modal>
  )
}
