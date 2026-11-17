// Brings any saved or imported project up to the shape the current app expects, so older saves and files
// from other versions open safely instead of crashing on a missing list or a bad number.
import type { Project } from '../types'

export const SCHEMA_VERSION = 1
const LISTS = ['screens', 'ground', 'decks', 'truss', 'hoists', 'fixtures', 'tables', 'guests', 'customPanels'] as const
const OPTIONAL_LISTS = ['decor', 'set', 'parts', 'cues', 'crew', 'comments', 'views'] as const

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const rid = () => Math.random().toString(36).slice(2, 10)

/** Returns a safe Project, or throws when the data is clearly not a Unifest project. */
export function normalizeProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Unifest project')
  const p = raw as Record<string, unknown>
  if (typeof p.version === 'number' && p.version > SCHEMA_VERSION) throw new Error('This file was made with a newer version of Unifest Studios. Update the page and try again.')
  if (!Array.isArray(p.screens) && !Array.isArray(p.ground) && !Array.isArray(p.decks)) throw new Error('Not a Unifest project')

  // Every list exists and holds objects with an id.
  const cleanList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => ((x as { id?: unknown }).id ? x : { ...(x as object), id: rid() })) : [])
  for (const k of LISTS) p[k] = cleanList(p[k])
  for (const k of OPTIONAL_LISTS) if (p[k] !== undefined) p[k] = cleanList(p[k])

  const venue = (p.venue && typeof p.venue === 'object' ? p.venue : {}) as Record<string, unknown>
  p.venue = { ...venue, w: Math.max(1, num(venue.w, 60)), l: Math.max(1, num(venue.l, 80)) }
  p.version = SCHEMA_VERSION
  p.name = typeof p.name === 'string' && p.name.trim() ? p.name : 'Untitled event'
  p.eventType = typeof p.eventType === 'string' ? p.eventType : 'Event'
  p.units = p.units === 'ft' ? 'ft' : 'm'
  p.audience = Math.max(0, Math.round(num(p.audience, 0)))
  const proc = (p.processor && typeof p.processor === 'object' ? p.processor : {}) as Record<string, unknown>
  p.processor = { name: typeof proc.name === 'string' ? proc.name : 'Generic 1G sending card', portPx: Math.max(1, num(proc.portPx, 655360)) }
  p.circuitAmps = p.circuitAmps === 32 ? 32 : 16
  p.updatedAt = num(p.updatedAt, Date.now())
  return p as unknown as Project
}
