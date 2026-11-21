// My kit: save your own stage, truss rig, LED screens, sound system, set or decor and drop it into any event.
// Positions are stored relative to the front centre of the stage, so a kit lands in the right place in a
// different venue. Kits live in this browser (localStorage).
import { nanoid } from 'nanoid'
import type { Project } from '../types'
import { stageBounds } from './calc'
import { stageFront } from './sound'

export type KitKind = 'stage' | 'truss' | 'screens' | 'sound' | 'set' | 'decor'
export const KIT_KINDS: Record<KitKind, string> = { stage: 'Stage', truss: 'Truss & lights', screens: 'LED screens', sound: 'Sound system', set: 'Set pieces', decor: 'Decor & effects' }

export interface KitItem {
  id: string
  name: string
  kind: KitKind
  created: number
  summary: string
  data: Record<string, unknown[] | unknown>
}

const KEY = 'unifest:kit'
export function loadKit(): KitItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as KitItem[]
  } catch {
    return []
  }
}
function storeKit(items: KitItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new Event('unifest:kit'))
}
export function deleteKit(id: string) {
  storeKit(loadKit().filter((k) => k.id !== id))
}

/** The point everything is measured from: the front centre of the stage (or a sensible spot without one). */
export function anchor(p: Project) {
  const sb = stageBounds(p)
  return sb ? { x: sb.x + sb.w / 2, y: stageFront(p) ?? sb.y + sb.l } : { x: p.venue.w / 2, y: Math.min(14, p.venue.l * 0.2) }
}

type XY = { x: number; y: number }
const shift = <T extends Partial<XY>>(list: T[] | undefined, dx: number, dy: number): T[] =>
  (list ?? []).map((o) => ({ ...structuredClone(o), ...(o.x !== undefined ? { x: +(o.x + dx).toFixed(3) } : {}), ...(o.y !== undefined ? { y: +(o.y + dy).toFixed(3) } : {}) }))
const shiftTruss = (list: Project['truss'], dx: number, dy: number) =>
  list.map((t) => ({ ...structuredClone(t), x1: +(t.x1 + dx).toFixed(3), x2: +(t.x2 + dx).toFixed(3), y1: +(t.y1 + dy).toFixed(3), y2: +(t.y2 + dy).toFixed(3) }))

/** What a kit of this kind would save from the current design (for the button label and the summary). */
export function kitSummary(p: Project, kind: KitKind): { count: number; text: string } {
  switch (kind) {
    case 'stage': {
      const sb = stageBounds(p)
      return { count: p.decks.length, text: sb ? `${p.decks.length} decks, ${sb.w}×${sb.l} m` : 'no stage' }
    }
    case 'truss':
      return { count: p.truss.length + p.fixtures.length, text: `${p.truss.length} truss runs, ${p.hoists.length} hoists, ${p.fixtures.length} fixtures` }
    case 'screens':
      return { count: p.screens.length, text: `${p.screens.length} screens` }
    case 'sound':
      return { count: p.sound?.sources.length ?? 0, text: `${p.sound?.sources.length ?? 0} speakers, ${p.sound?.inputs?.length ?? 0} inputs` }
    case 'set':
      return { count: p.set?.length ?? 0, text: `${p.set?.length ?? 0} set pieces` }
    case 'decor':
      return { count: p.decor?.length ?? 0, text: `${p.decor?.length ?? 0} decor and effects items` }
  }
}

/** Save part of the current design as a kit (positions relative to the stage front centre). */
export function saveKit(p: Project, kind: KitKind, name: string): KitItem {
  const a = anchor(p)
  const dx = -a.x
  const dy = -a.y
  const data: KitItem['data'] = {}
  if (kind === 'stage') data.decks = shift(p.decks, dx, dy)
  if (kind === 'truss') Object.assign(data, { truss: shiftTruss(p.truss, dx, dy), hoists: shift(p.hoists, dx, dy), fixtures: shift(p.fixtures, dx, dy) })
  if (kind === 'screens') data.screens = shift(p.screens, dx, dy)
  if (kind === 'sound' && p.sound) data.sound = { ...structuredClone(p.sound), sources: shift(p.sound.sources, dx, dy) }
  if (kind === 'set') data.set = shift(p.set, dx, dy)
  if (kind === 'decor') data.decor = shift(p.decor, dx, dy)
  const item: KitItem = { id: nanoid(8), name: name.trim().slice(0, 60) || KIT_KINDS[kind], kind, created: Date.now(), summary: kitSummary(p, kind).text, data }
  storeKit([item, ...loadKit()])
  return item
}

/**
 * Put a kit into the design, at this design's stage front centre. Replace swaps out what is there now
 * (the usual choice for a stage, rig or sound system); add keeps it. Everything gets new ids.
 */
export function insertKit(p: Project, item: KitItem, mode: 'replace' | 'add' = 'replace') {
  const a = anchor(p)
  const fresh = <T extends { id: string }>(list: T[], map?: Map<string, string>) =>
    list.map((o) => {
      const id = nanoid(8)
      map?.set(o.id, id)
      return { ...o, id }
    })
  const d = item.data as Record<string, never[]> & { sound?: Project['sound'] }
  if (item.kind === 'stage') {
    const decks = fresh(shift(d.decks as Project['decks'], a.x, a.y))
    // The new stage keeps its own front line where the old one was: re-anchor on the inserted stage.
    p.decks = mode === 'replace' ? decks : [...p.decks, ...decks]
  }
  if (item.kind === 'truss') {
    const truss = fresh(shiftTruss(d.truss as Project['truss'], a.x, a.y))
    const hoists = fresh(shift(d.hoists as Project['hoists'], a.x, a.y))
    const fixtures = fresh(shift(d.fixtures as Project['fixtures'], a.x, a.y))
    p.truss = mode === 'replace' ? truss : [...p.truss, ...truss]
    p.hoists = mode === 'replace' ? hoists : [...p.hoists, ...hoists]
    p.fixtures = mode === 'replace' ? fixtures : [...p.fixtures, ...fixtures]
  }
  if (item.kind === 'screens') {
    const map = new Map<string, string>()
    const screens = fresh(shift(d.screens as Project['screens'], a.x, a.y), map).map((s) => ({ ...s, mirrorOf: s.mirrorOf ? map.get(s.mirrorOf) : undefined }))
    p.screens = mode === 'replace' ? screens : [...p.screens, ...screens]
  }
  if (item.kind === 'sound' && d.sound) {
    const sources = fresh(shift(d.sound.sources, a.x, a.y))
    p.sound = mode === 'replace' || !p.sound ? { ...structuredClone(d.sound), sources } : { ...p.sound, sources: [...p.sound.sources, ...sources] }
    if (mode === 'replace') p.fixtures = p.fixtures.filter((f) => f.kind !== 'line-array' && f.kind !== 'sub')
  }
  if (item.kind === 'set') {
    const set = fresh(shift(d.set as NonNullable<Project['set']>, a.x, a.y))
    p.set = mode === 'replace' ? set : [...(p.set ?? []), ...set]
  }
  if (item.kind === 'decor') {
    const decor = fresh(shift(d.decor as NonNullable<Project['decor']>, a.x, a.y))
    p.decor = mode === 'replace' ? decor : [...(p.decor ?? []), ...decor]
  }
}
