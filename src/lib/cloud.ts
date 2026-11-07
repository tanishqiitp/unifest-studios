import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Project } from '../types'
import { liteProject, restoreDefaults } from './export/files'

// Supabase is optional: without these settings the app runs browser-only, as before.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }) : null
export const cloudEnabled = !!supabase

export type SyncState = 'idle' | 'saving' | 'saved' | 'offline'

interface AuthState {
  user: User | null
  ready: boolean
  sync: SyncState
}

export const useAuth = create<AuthState>(() => ({ user: null, ready: !supabase, sync: 'idle' }))

if (supabase) {
  supabase.auth.getSession().then(({ data }) => useAuth.setState({ user: data.session?.user ?? null, ready: true }))
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ user: session?.user ?? null, ready: true })
    // The sign-in link returns with ?code=…; tidy the address bar once it is used.
    if (session && /[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash)
  })
}

function need(): SupabaseClient {
  if (!supabase) throw new Error('Cloud saving is not set up')
  return supabase
}

export async function sendLoginLink(email: string) {
  const { error } = await need().auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/` } })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  await need().auth.signOut()
}

// ---------- projects ----------

export interface CloudEntry {
  id: string
  name: string
  eventType: string
  audience: number
  updatedAt: number
}

export function projectRow(p: Project) {
  return { id: p.id!, name: p.name, event_type: p.eventType, audience: p.audience, data: p, updated_at: new Date(p.updatedAt || Date.now()).toISOString() }
}

export async function pushProject(p: Project) {
  if (!p.id) return
  const db = need()
  const { error } = await db.from('projects').upsert(projectRow(p))
  if (error) throw new Error(error.message)
  // Keep any client link for this project showing the latest design.
  await db.from('shares').update({ data: liteProject(p), updated_at: new Date().toISOString() }).eq('project_id', p.id)
}

export async function listCloudProjects(): Promise<CloudEntry[]> {
  const { data, error } = await need().from('projects').select('id, name, event_type, audience, updated_at').order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, eventType: r.event_type, audience: r.audience, updatedAt: Date.parse(r.updated_at) }))
}

export async function fetchCloudProject(id: string): Promise<Project | null> {
  const { data, error } = await need().from('projects').select('data').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.data as Project) ?? null
}

export async function deleteCloudProject(id: string) {
  const { error } = await need().from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Newest copy wins; projects only in one place are kept.
export function mergeEntries<T extends { id: string; updatedAt: number }>(local: T[], cloud: T[]) {
  const out = new Map<string, T & { where: 'local' | 'cloud' | 'both' }>()
  for (const e of local) out.set(e.id, { ...e, where: 'local' })
  for (const e of cloud) {
    const l = out.get(e.id)
    out.set(e.id, l ? { ...(e.updatedAt > l.updatedAt ? e : l), where: 'both' } : { ...e, where: 'cloud' })
  }
  return [...out.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

// ---------- short client links ----------

export async function ensureShare(p: Project): Promise<string> {
  const db = need()
  const { data: existing, error } = await db.from('shares').select('code').eq('project_id', p.id!).maybeSingle()
  if (error) throw new Error(error.message)
  const data = liteProject(p)
  if (existing) {
    await db.from('shares').update({ data, updated_at: new Date().toISOString() }).eq('code', existing.code)
    return existing.code
  }
  const code = nanoid(10)
  const ins = await db.from('shares').insert({ code, project_id: p.id, data })
  if (ins.error) throw new Error(ins.error.message)
  return code
}

export function shortLink(code: string) {
  return `${location.origin}/s/${code}`
}

export function shareCodeFromPath(): string | null {
  return location.pathname.match(/^\/s\/([A-Za-z0-9_-]{8,32})\/?$/)?.[1] ?? null
}

export async function fetchShare(code: string): Promise<Project | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_share', { share_code: code })
  if (error || !data) return null
  return restoreDefaults(data as Project)
}

// ---------- venue library ----------

export interface VenueRoom {
  name: string
  w: number // metres across
  l: number // metres deep
  h?: number // ceiling height
  theatre?: number
  banquet?: number
  standing?: number
  // Size estimated from a published floor area (no exact length and width available).
  approx?: boolean
}

export interface Venue {
  id: string
  name: string
  kind: string
  city: string
  state: string
  country: string
  address: string
  website: string
  notes: string
  indoor: boolean
  rooms: VenueRoom[]
  verified: boolean
  created_by: string | null
}

export const VENUE_KINDS: { id: string; name: string }[] = [
  { id: 'banquet', name: 'Banquet hall' },
  { id: 'hotel', name: 'Hotel ballroom' },
  { id: 'convention', name: 'Convention centre' },
  { id: 'auditorium', name: 'Auditorium' },
  { id: 'open-ground', name: 'Open ground' },
  { id: 'lawn', name: 'Lawn / garden' },
  { id: 'stadium', name: 'Stadium / arena' },
  { id: 'resort', name: 'Resort / farmhouse' },
  { id: 'college', name: 'College campus' },
  { id: 'club', name: 'Club / lounge' },
  { id: 'other', name: 'Other' },
]

export async function searchVenues(q: string): Promise<Venue[]> {
  // Keep only letters, digits and spaces so the text is safe inside the filter expression.
  // Accents are stripped to match the database's search_text column ("meridien" finds "Méridien").
  const term = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().slice(0, 60)
  let query = need().from('venues').select('*').order('verified', { ascending: false }).order('name').limit(60)
  for (const word of term.split(/\s+/).filter(Boolean).slice(0, 5)) query = query.ilike('search_text', `%${word}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as Venue[]
}

export async function saveVenue(v: Omit<Venue, 'id' | 'verified' | 'created_by'> & { id?: string }) {
  const db = need()
  const row = { ...v, rooms: v.rooms.filter((r) => r.name.trim() && r.w > 0 && r.l > 0), updated_at: new Date().toISOString() }
  const res = v.id ? await db.from('venues').update(row).eq('id', v.id).select().single() : await db.from('venues').insert(row).select().single()
  if (res.error) throw new Error(res.error.message)
  return res.data as Venue
}

export async function deleteVenue(id: string) {
  const { error } = await need().from('venues').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
