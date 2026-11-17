// Named save points ("Before client call", "Rev 2 – bigger LED") kept on this device for each project.
// Restoring first saves the current state as a point, so going back is always reversible.
import type { Project } from '../types'
import { normalizeProject } from './migrate'

export interface SavePoint {
  id: string
  name: string
  note?: string
  at: number
  data: string // project JSON
}
const KEY = (projectId: string) => `unifest:points:${projectId}`
export const MAX_POINTS = 30

export function listPoints(projectId: string): SavePoint[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY(projectId)) || '[]') as SavePoint[]).sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

function writePoints(projectId: string, list: SavePoint[]) {
  localStorage.setItem(KEY(projectId), JSON.stringify(list.slice(0, MAX_POINTS)))
}

/** Returns the new point, or an error message (e.g. storage full) without losing existing points. */
export function addPoint(p: Project, name: string, note?: string): SavePoint | string {
  if (!p.id) return 'Save the project first.'
  const pt: SavePoint = { id: Math.random().toString(36).slice(2, 10), name: name.trim() || 'Save point', note: note?.trim() || undefined, at: Date.now(), data: JSON.stringify(p) }
  try {
    writePoints(p.id, [pt, ...listPoints(p.id)])
    return pt
  } catch {
    return 'Not enough storage on this device for another save point. Delete an old one or save the project as a file.'
  }
}

export function deletePoint(projectId: string, id: string) {
  try {
    writePoints(
      projectId,
      listPoints(projectId).filter((x) => x.id !== id),
    )
  } catch {
    /* nothing to delete */
  }
}

export function pointProject(pt: SavePoint, keepId: string): Project {
  return { ...normalizeProject(JSON.parse(pt.data)), id: keepId, updatedAt: Date.now() }
}
