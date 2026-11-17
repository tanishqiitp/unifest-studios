import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, Mail, MapPin, MessageSquareQuote, Phone, Star } from 'lucide-react'
import { useStore } from '../store'
import { CLIENTS, COMPANY, directionsUrl, MILESTONES, TESTIMONIALS, visible } from '../content/site'
import { submitTestimonial, subscribeNewsletter } from '../lib/cloud'
import { Modal } from './ui'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const wrap = 'max-w-6xl mx-auto px-4 sm:px-6'

// Company sections below the home page: journey, clients, voices, newsletter and footer.
export function SiteSections() {
  return (
    <>
      <Journey />
      <Clients />
      <Voices />
      <Newsletter />
      <Footer />
    </>
  )
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-mute mt-1">{sub}</p>
    </div>
  )
}

function Journey() {
  const items = visible(MILESTONES)
  if (!items.length) return null
  return (
    <section id="journey" aria-labelledby="journey-h" className={`${wrap} py-14 border-t border-line`}>
      <h2 id="journey-h" className="font-display text-xl sm:text-2xl font-semibold tracking-tight mb-6">
        Our Journey
      </h2>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => (
          <li key={m.title} className="card p-4">
            <div className="mono text-[11px] text-dim">{m.date}</div>
            <div className="text-sm font-medium mt-1">{m.title}</div>
            <p className="text-xs text-mute mt-1 leading-relaxed">{m.description}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Clients() {
  const items = visible(CLIENTS)
  if (!items.length) return null
  return (
    <section id="clients" aria-labelledby="clients-h" className={`${wrap} py-14 border-t border-line`}>
      <div id="clients-h">
        <Heading title="Our Clients & Collaborators" sub="Working together to create memorable live experiences." />
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((c) => {
          const body = (
            <>
              {c.logo ? <img src={c.logo} alt={c.name} className="h-10 max-w-full object-contain" loading="lazy" /> : <div className="font-display text-sm font-semibold text-center">{c.name}</div>}
              {c.project && <div className="text-[11px] text-mute mt-2 text-center">{c.project}</div>}
              {c.sample && <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider text-mute border border-line rounded px-1">Placeholder</span>}
            </>
          )
          const cls = 'relative h-28 rounded-xl border border-line flex flex-col items-center justify-center p-4'
          return (
            <li key={c.name}>
              {c.website ? (
                <a href={c.website} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-line-hi`}>
                  {body}
                </a>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Voices() {
  const items = visible(TESTIMONIALS)
  const [open, setOpen] = useState(false)
  return (
    <section id="voices" aria-labelledby="voices-h" className={`${wrap} py-14 border-t border-line`}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h2 id="voices-h" className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Voices Behind the Show
          </h2>
          <p className="text-sm text-mute mt-1">{items.length ? 'What event teams say about planning with Unifest Studios.' : 'Used Unifest Studios for an event? We would love to hear how it went.'}</p>
        </div>
        <button className="btn btn-primary h-10 px-4 self-start sm:self-auto" onClick={() => setOpen(true)}>
          <MessageSquareQuote size={14} /> Share Your Experience
        </button>
      </div>
      {items.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-3">
          {items.map((t) => (
            <li key={t.name} className="card p-5 flex flex-col">
              {t.sample && <span className="self-start text-[9px] uppercase tracking-wider text-mute border border-line rounded px-1.5 py-0.5 mb-3">Sample testimonial</span>}
              <blockquote className="text-sm leading-relaxed text-dim flex-1">“{t.review}”</blockquote>
              <div className="flex items-center gap-3 mt-4">
                {t.photo ? (
                  <img src={t.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full border border-line flex items-center justify-center text-xs font-semibold" aria-hidden>
                    {t.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-mute">{t.role}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && <ShareExperience onClose={() => setOpen(false)} />}
    </section>
  )
}

type Status = { kind: 'idle' | 'loading' | 'ok' | 'dupe' | 'error'; msg?: string }

function StatusLine({ s }: { s: Status }) {
  if (s.kind === 'idle' || s.kind === 'loading') return null
  const tone = s.kind === 'error' ? 'text-err' : 'text-fg'
  return (
    <p role={s.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${tone}`}>
      {s.msg}
    </p>
  )
}

function ShareExperience({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', role: '', body: '', rating: 0, consent: false, website: '' })
  const [s, setS] = useState<Status>({ kind: 'idle' })
  const [touched, setTouched] = useState(false)
  const opened = useRef(Date.now())
  const errs = {
    name: !f.name.trim() ? 'Please enter your name.' : '',
    email: !EMAIL_RE.test(f.email.trim()) ? 'Please enter a valid email address.' : '',
    body: f.body.trim().length < 10 ? 'Please write at least a sentence (10 characters).' : '',
  }
  const bad = Object.values(errs).some(Boolean)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (bad) return
    // Spam guard: the hidden "website" field must stay empty, and real people take a few seconds.
    if (f.website || Date.now() - opened.current < 3000) return setS({ kind: 'error', msg: 'Please wait a moment and try again.' })
    setS({ kind: 'loading' })
    try {
      await submitTestimonial({ name: f.name.trim(), email: f.email.trim(), role: f.role.trim(), body: f.body.trim(), rating: f.rating || null, consent: f.consent })
      setS({ kind: 'ok', msg: 'Thank you! Your feedback was received. Our team reviews every submission before anything is published.' })
    } catch (err) {
      setS({ kind: 'error', msg: (err as Error).message })
    }
  }
  return (
    <Modal title="Share your experience" onClose={onClose}>
      {s.kind === 'ok' ? (
        <div className="space-y-4">
          <StatusLine s={s} />
          <button className="btn w-full justify-center" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit} noValidate>
          <Field id="fb-name" label="Name" error={touched ? errs.name : ''}>
            <input id="fb-name" className="field" autoComplete="name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={touched && !!errs.name} required />
          </Field>
          <Field id="fb-email" label="Email (kept private, never published)" error={touched ? errs.email : ''}>
            <input id="fb-email" type="email" className="field" autoComplete="email" maxLength={254} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-invalid={touched && !!errs.email} required />
          </Field>
          <Field id="fb-role" label="Role or organisation (optional)">
            <input id="fb-role" className="field" maxLength={120} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
          </Field>
          <Field id="fb-body" label="Your feedback" error={touched ? errs.body : ''}>
            <textarea id="fb-body" className="field h-28 py-2 font-sans" maxLength={1500} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} aria-invalid={touched && !!errs.body} required />
          </Field>
          <fieldset>
            <legend className="label mb-1">Rating (optional)</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`btn btn-icon h-8 w-8 ${f.rating >= n ? 'btn-on' : ''}`} aria-label={`${n} star${n > 1 ? 's' : ''}`} aria-pressed={f.rating === n} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })}>
                  <Star size={13} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-xs text-dim">
            <input type="checkbox" className="mt-0.5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            I agree that Unifest may publish my name, role, and feedback.
          </label>
          {/* Honeypot: hidden from people, filled by bots. */}
          <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="fb-website">Website</label>
            <input id="fb-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </div>
          <p className="text-[11px] text-mute">Submissions stay private until our team reviews them. We only publish feedback when you tick the box above.</p>
          <StatusLine s={s} />
          <button type="submit" className="btn btn-primary w-full justify-center h-10" disabled={s.kind === 'loading'}>
            {s.kind === 'loading' ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}
    </Modal>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label block mb-1">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-[11px] text-err mt-1" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  )
}

function Newsletter() {
  const [email, setEmail] = useState('')
  const [s, setS] = useState<Status>({ kind: 'idle' })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setS({ kind: 'error', msg: 'Please enter a valid email address.' })
    setS({ kind: 'loading' })
    try {
      const r = await subscribeNewsletter(email.trim())
      setS(r === 'already' ? { kind: 'dupe', msg: 'You are already subscribed. Thanks for staying with us!' } : { kind: 'ok', msg: 'You are subscribed. Watch your inbox for the next update.' })
      if (r === 'subscribed') setEmail('')
    } catch (err) {
      setS({ kind: 'error', msg: (err as Error).message })
    }
  }
  return (
    <section id="newsletter" aria-labelledby="nl-h" className="border-t border-line bg-panel">
      <div className={`${wrap} py-14 grid gap-6 lg:grid-cols-2 lg:items-center`}>
        <div>
          <h2 id="nl-h" className="font-display text-xl sm:text-2xl font-semibold tracking-tight">
            Stay ahead of the next show.
          </h2>
          <p className="text-sm text-mute mt-1 max-w-md">Get Unifest Studios updates, event design tips, production insights, and new template releases.</p>
        </div>
        <form onSubmit={submit} noValidate className="space-y-2">
          <label htmlFor="nl-email" className="label block">
            Email address
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="nl-email" type="email" autoComplete="email" className="field h-10 text-sm" placeholder="you@example.com" value={email} onChange={(e) => (setEmail(e.target.value), s.kind === 'error' && setS({ kind: 'idle' }))} aria-invalid={s.kind === 'error'} aria-describedby="nl-note" />
            <button type="submit" className="btn btn-primary h-10 px-5 justify-center" disabled={s.kind === 'loading'}>
              {s.kind === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </div>
          <StatusLine s={s} />
          <p id="nl-note" className="text-[11px] text-mute">
            By subscribing you agree to receive emails from Unifest Entertainment about Unifest Studios. We never share your email, and you can unsubscribe at any time by writing to {COMPANY.email}.
          </p>
        </form>
      </div>
    </section>
  )
}

const EXPLORE: [string, string][] = [
  ['Ground planning', '#feature-ground'],
  ['Stage design', '#feature-stage'],
  ['LED planning', '#feature-led'],
  ['3D visualization', '#feature-3d'],
  ['Planning and quotations', '#feature-plan'],
  ['Delivery and exports', '#feature-deliver'],
]

export function Footer() {
  const { setUI } = useStore.getState()
  const [feedback, setFeedback] = useState(false)
  const link = 'text-dim hover:text-fg underline-offset-4 hover:underline'
  return (
    <footer className="border-t border-line" aria-labelledby="footer-h">
      <h2 id="footer-h" className="sr-only">
        Site footer
      </h2>
      <div className={`${wrap} py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 text-sm`}>
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-white text-black flex items-center justify-center font-display font-bold text-sm">U</div>
            <span className="font-display font-semibold">Unifest Studios</span>
          </div>
          <p className="text-dim mt-3 leading-relaxed">Plan your venue, design your stage, and bring your event vision to life.</p>
          <p className="text-mute text-xs mt-2">An initiative by Unifest Entertainment.</p>
        </div>
        <nav aria-label="Explore">
          <h3 className="label mb-3">Explore</h3>
          <ul className="space-y-2">
            <li>
              <button className={link} onClick={() => setUI({ wizardOpen: true })}>
                Start a new event
              </button>
            </li>
            <li>
              <a className={link} href="#templates">
                Event templates
              </a>
            </li>
            <li>
              <button className={link} onClick={() => setUI({ venuesOpen: true })}>
                Venue library
              </button>
            </li>
            {EXPLORE.map(([t, h]) => (
              <li key={t}>
                <a className={link} href={h}>
                  {t}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <ContactBlock />
        <nav aria-label="Support">
          <h3 className="label mb-3">Support</h3>
          <ul className="space-y-2">
            <li>
              <a className={link} href={`mailto:${COMPANY.email}`}>
                Contact us
              </a>
            </li>
            <li>
              <button className={link} onClick={() => setFeedback(true)}>
                Share feedback
              </button>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className={`${wrap} py-5 flex flex-col sm:flex-row gap-2 justify-between text-xs text-mute`}>
          <span>© {new Date().getFullYear()} Unifest Entertainment. All rights reserved.</span>
          <span>Designed for the people behind the show.</span>
        </div>
      </div>
      {feedback && <ShareExperience onClose={() => setFeedback(false)} />}
    </footer>
  )
}

export function ContactBlock() {
  const link = 'text-dim hover:text-fg underline-offset-4 hover:underline'
  return (
    <div>
      <h3 className="label mb-3">Contact</h3>
      <address className="not-italic space-y-2 text-sm">
        <p className="flex gap-2 text-dim">
          <MapPin size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            {COMPANY.office}
            <br />
            <a className={link} href={directionsUrl} target="_blank" rel="noopener noreferrer">
              Get directions
            </a>
          </span>
        </p>
        <p className="flex gap-2">
          <Mail size={14} className="shrink-0 mt-0.5 text-dim" aria-hidden />
          <a className={link} href={`mailto:${COMPANY.email}`}>
            {COMPANY.email}
          </a>
        </p>
        <p className="flex gap-2">
          <Phone size={14} className="shrink-0 mt-0.5 text-dim" aria-hidden />
          <a className={link} href={COMPANY.phoneHref}>
            {COMPANY.phone}
          </a>
        </p>
        <p className="flex gap-2">
          <ExternalLink size={14} className="shrink-0 mt-0.5 text-dim" aria-hidden />
          <a className={link} href={COMPANY.website} target="_blank" rel="noopener noreferrer">
            unifestentertainment.com
          </a>
        </p>
      </address>
    </div>
  )
}

// Compact "Help & company" panel for the editor, so the canvas keeps its full height.
export function CompanyPanel({ onClose }: { onClose: () => void }) {
  const [feedback, setFeedback] = useState(false)
  if (feedback) return <ShareExperience onClose={onClose} />
  return (
    <Modal title="Help & company" onClose={onClose}>
      <div className="space-y-5 text-sm">
        <p className="text-dim">Unifest Studios is an initiative by Unifest Entertainment. Plan your venue, design your stage, and bring your event vision to life.</p>
        <ContactBlock />
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`mailto:${COMPANY.email}`}>
            <Mail size={13} /> Contact us
          </a>
          <button className="btn" onClick={() => setFeedback(true)}>
            <MessageSquareQuote size={13} /> Share feedback
          </button>
        </div>
        <p className="text-[11px] text-mute">© {new Date().getFullYear()} Unifest Entertainment. All rights reserved.</p>
      </div>
    </Modal>
  )
}
