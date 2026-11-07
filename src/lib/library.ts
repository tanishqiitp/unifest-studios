import type { Project } from '../types'

// Every project lives in its own localStorage key; a small index lists them for the home screen.
const LIB_KEY = 'unifest:library'
const CUR_KEY = 'unifest:current'
const LEGACY_KEY = 'unifest:project'
const pKey = (id: string) => `unifest:p:${id}`

export interface LibEntry {
  id: string
  name: string
  eventType: string
  audience: number
  screens: number
  updatedAt: number
}

export function readLibrary(): LibEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(LIB_KEY) || '[]') as LibEntry[]
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function writeLibrary(list: LibEntry[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(list))
}

// `current` marks it as the project to reopen next time; cloud downloads pass false.
export function writeProject(p: Project, current = true): boolean {
  if (!p.id) return false
  try {
    localStorage.setItem(pKey(p.id), JSON.stringify(p))
    if (current) localStorage.setItem(CUR_KEY, p.id)
    const entry: LibEntry = { id: p.id, name: p.name, eventType: p.eventType, audience: p.audience, screens: p.screens.length, updatedAt: p.updatedAt || Date.now() }
    writeLibrary([entry, ...readLibrary().filter((e) => e.id !== p.id)])
    return true
  } catch {
    return false // storage full or blocked: file save still works
  }
}

export function readProject(id: string): Project | null {
  try {
    const raw = localStorage.getItem(pKey(id))
    return raw ? (JSON.parse(raw) as Project) : null
  } catch {
    return null
  }
}

export function deleteProject(id: string) {
  try {
    localStorage.removeItem(pKey(id))
    writeLibrary(readLibrary().filter((e) => e.id !== id))
    if (localStorage.getItem(CUR_KEY) === id) localStorage.removeItem(CUR_KEY)
  } catch {
    /* nothing to clean up */
  }
}

// The project that was open last, migrating the single-slot save from v0.1.
export function loadCurrent(): Project | null {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const p = JSON.parse(legacy) as Project
      p.id ??= Math.random().toString(36).slice(2, 12)
      writeProject(p)
      localStorage.removeItem(LEGACY_KEY)
    }
    const id = localStorage.getItem(CUR_KEY)
    return id ? readProject(id) : null
  } catch {
    return null
  }
}
