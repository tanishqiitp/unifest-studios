import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Loader2, LogOut, Mail } from 'lucide-react'
import { cloudEnabled, enabledProviders, sendLoginLink, signInWithGoogle, signOut, useAuth } from '../lib/cloud'
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
  const [google, setGoogle] = useState(false)
  useEffect(() => {
    enabledProviders().then((p) => setGoogle(p.google))
  }, [])
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
          {google && (
            <>
              <button type="button" className="btn w-full justify-center h-10" onClick={() => signInWithGoogle().catch((e) => setError((e as Error).message))}>
                <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                  <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                </svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-2 text-[10px] text-mute">
                <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}
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
