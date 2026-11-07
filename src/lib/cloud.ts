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
