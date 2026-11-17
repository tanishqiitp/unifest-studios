// Edit actions shared by the buttons and the keyboard: delete, duplicate, nudge and select all.
// They work on the selection plus any Shift+clicked items, in every 2D workspace.
import { nanoid } from 'nanoid'
import { useStore, type Selection } from '../store'
import type { Project } from '../types'

type Sel = NonNullable<Selection>
type Item = { id: string; x?: number; y?: number; z?: number; x1?: number; x2?: number; y1?: number; y2?: number; mirrorOf?: string; locked?: boolean }

// The list each selection kind lives in.
function listOf(p: Project, kind: Sel['kind']): Item[] | undefined {
  const m: Record<Sel['kind'], unknown> = {
    screen: p.screens,
    ground: p.ground,
    deck: p.decks,
    truss: p.truss,
    hoist: p.hoists,
    fixture: p.fixtures,
    table: p.tables,
    decor: p.decor,
    set: p.set,
    comment: p.comments,
  }
  return m[kind] as Item[] | undefined
}

export function selected(): Sel[] {
  const { ui } = useStore.getState()
  return ui.selection ? [ui.selection, ...ui.extra] : []
}

export function deleteSelection() {
  const sel = selected()
  if (!sel.length) return false
  const { mutate, select, notify } = useStore.getState()
  mutate((p) => {
    for (const s of sel) {
      const ids = new Set([s.id])
      const keep = (x: Item) => !ids.has(x.id) && !(x.mirrorOf && ids.has(x.mirrorOf))
      if (s.kind === 'screen') p.screens = p.screens.filter(keep)
      if (s.kind === 'ground') p.ground = p.ground.filter(keep)
      if (s.kind === 'deck') p.decks = p.decks.filter(keep)
      if (s.kind === 'truss') p.truss = p.truss.filter(keep)
      if (s.kind === 'hoist') p.hoists = p.hoists.filter(keep)
      if (s.kind === 'fixture') p.fixtures = p.fixtures.filter(keep)
      if (s.kind === 'set') p.set = (p.set ?? []).filter(keep)
      if (s.kind === 'decor') p.decor = (p.decor ?? []).filter(keep)
      if (s.kind === 'comment') p.comments = (p.comments ?? []).filter(keep)
      if (s.kind === 'table') {
        p.tables = p.tables.filter(keep)
        p.guests.forEach((g) => g.tableId === s.id && (g.tableId = undefined))
      }
    }
  })
  select(null)
  notify(sel.length > 1 ? `Deleted ${sel.length} items · Ctrl+Z to undo` : 'Deleted · Ctrl+Z to undo')
  return true
}

export function duplicateSelection() {
  const sel = selected().filter((s) => s.kind !== 'comment')
  if (!sel.length) return false
  const { mutate, select } = useStore.getState()
  const made: Sel[] = []
  mutate((p) => {
    for (const s of sel) {
      const list = listOf(p, s.kind)
      const src = list?.find((x) => x.id === s.id)
      if (!list || !src) continue
      const c = { ...structuredClone(src), id: nanoid(8), mirrorOf: undefined } as Item & { name?: string; label?: string }
      // Offset the copy so it is visible next to the original.
      if (c.x1 !== undefined) {
        c.y1 = (c.y1 ?? 0) + 1
        c.y2 = (c.y2 ?? 0) + 1
      } else {
        if (c.x !== undefined) c.x += 1
        if (c.y !== undefined) c.y += 1
      }
      if (typeof c.name === 'string') c.name = `${c.name} copy`
      list.push(c)
      made.push({ kind: s.kind, id: c.id })
    }
  })
  if (made.length) {
    useStore.setState((st) => ({ ui: { ...st.ui, selection: made[0], extra: made.slice(1) } }))
  } else select(null)
  return made.length > 0
}

/** Move the selection by dx (across), dy (depth) and dz (height), in metres. */
export function nudgeSelection(dx: number, dy: number, dz = 0) {
  const sel = selected()
  if (!sel.length) return false
  const r = (n: number) => Math.round(n * 100) / 100
  useStore.getState().mutate((p) => {
    for (const s of sel) {
      const it = listOf(p, s.kind)?.find((x) => x.id === s.id)
      if (!it || it.locked) continue
      if (it.x1 !== undefined) {
        it.x1 = r(it.x1 + dx)
        it.x2 = r((it.x2 ?? 0) + dx)
        it.y1 = r((it.y1 ?? 0) + dy)
        it.y2 = r((it.y2 ?? 0) + dy)
        continue
      }
      if (it.x !== undefined) it.x = r(it.x + dx)
      if (it.y !== undefined) it.y = r(it.y + dy)
      if (dz && it.z !== undefined) it.z = r(Math.max(0, it.z + dz))
    }
  })
  return true
}

// Which kinds a workspace edits, for Select all.
const WS_KINDS: Record<string, Sel['kind'][]> = {
  ground: ['ground'],
  stage: ['deck'],
  truss: ['truss', 'fixture'],
  led: ['screen'],
  seating: ['table'],
  decor: ['decor'],
  set: ['set'],
}
export function selectAll() {
  const { project: p, ui } = useStore.getState()
  const all: Sel[] = (WS_KINDS[ui.workspace] ?? []).flatMap((k) => (listOf(p, k) ?? []).filter((x) => !x.mirrorOf).map((x) => ({ kind: k, id: x.id })))
  if (!all.length) return false
  useStore.setState((st) => ({ ui: { ...st.ui, selection: all[0], extra: all.slice(1) } }))
  return true
}
