import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Mode, Project, Screen, Workspace } from './types'
import { findPanel } from './lib/panels'
import { generateProject, TEMPLATES } from './lib/templates'
import { loadCurrent, writeProject } from './lib/library'
import { cloudEnabled, pushProject, useAuth } from './lib/cloud'
import { nanoid } from 'nanoid'
import { withSeating } from './lib/seating'
import { syncSetMirrors } from './lib/setpieces'

// Shift is tracked globally so every editor gets Shift+click multi-select through `select()`.
let shiftHeld = false
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => (shiftHeld = e.shiftKey), true)
  window.addEventListener('keyup', (e) => (shiftHeld = e.shiftKey), true)
  window.addEventListener('pointerdown', (e) => (shiftHeld = e.shiftKey), true)
  window.addEventListener('blur', () => (shiftHeld = false))
}

export type Selection = { kind: 'screen' | 'ground' | 'deck' | 'truss' | 'hoist' | 'fixture' | 'table' | 'decor' | 'comment' | 'set'; id: string } | null
export type LedOverlay = 'none' | 'data' | 'power'
export type Tool = 'select' | 'pan' | 'paint' | 'measure' | 'draw-truss' | 'hoist'

interface UI {
  workspace: Workspace
  mode: Mode
  selection: Selection
  // More items picked with Shift+click, for align and distribute. The first pick stays in `selection`.
  extra: NonNullable<Selection>[]
  tool: Tool
  magnet: boolean
  overlay: LedOverlay
  wizardOpen: boolean
  shortcutsOpen: boolean
  home: boolean
  guideOpen: boolean
  venuesOpen: boolean
  // Values the new-event wizard starts with, e.g. a room picked from the venue library.
  wizardPrefill: { name?: string; venueW?: number; venueL?: number; audience?: number; outdoor?: boolean } | null
  warningsOpen: boolean
  // Phones and tablets: which side panel is open as a drawer.
  panel: 'left' | 'right' | null
  toast: string | null
}

interface State {
  project: Project
  ui: UI
  mutate: (fn: (p: Project) => void) => void
  setProject: (p: Project) => void
  setUI: (u: Partial<UI>) => void
  select: (s: Selection) => void
  notify: (msg: string) => void
}

function loadInitial(): Project {
  return withSeating(loadCurrent() ?? { ...generateProject(TEMPLATES[0]), id: nanoid(10) })
}

// Live symmetry: mirrored screens copy their source and flip across the venue centre line.
function syncMirrors(p: Project) {
  const axis = p.venue.w / 2
  p.screens = p.screens.map((s): Screen => {
    if (!s.mirrorOf) return s
    const src = p.screens.find((x) => x.id === s.mirrorOf)
    if (!src) return { ...s, mirrorOf: undefined }
    const panel = findPanel(src.panelId, p.customPanels)
    const W = (src.cols * panel.w) / 1000
    const virtual = src.virtual.map((i) => {
      const r = Math.floor(i / src.cols)
      const c = i % src.cols
      return r * src.cols + (src.cols - 1 - c)
    })
    return { ...src, id: s.id, name: s.name, mirrorOf: src.id, image: s.image, x: 2 * axis - src.x - W, rotation: -src.rotation, virtual }
  })
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>()(
  temporal(
    (set, get) => ({
      project: loadInitial(),
      ui: {
        workspace: 'ground',
        mode: 'simple',
        selection: null,
        extra: [],
        tool: 'select',
        magnet: true,
        overlay: 'none',
        wizardOpen: false,
        shortcutsOpen: false,
        home: true,
        guideOpen: false,
        venuesOpen: false,
        wizardPrefill: null,
        warningsOpen: false,
        panel: null,
        toast: null,
      },
      mutate: (fn) => {
        const p = structuredClone(get().project)
        fn(p)
        syncMirrors(p)
        syncSetMirrors(p)
        p.updatedAt = Date.now()
        // A slider drag or typing in one field becomes one undo step, not one per change.
        if (mergeWithLast()) {
          const t = useStore.temporal.getState()
          t.pause()
          set({ project: p })
          t.resume()
        } else set({ project: p })
      },
      setProject: (p) => {
        if (!p.id) p.id = nanoid(10)
        withSeating(p)
        syncMirrors(p)
        syncSetMirrors(p)
        const opened = p.id !== get().project.id
        set({ project: p, ui: { ...get().ui, selection: null, extra: [] } })
        // Undo history belongs to one project; replacing the open project's content stays undoable.
        if (opened) queueMicrotask(() => useStore.temporal.getState().clear())
      },
      setUI: (u) => set({ ui: { ...get().ui, ...u } }),
      select: (selection) => {
        const ui = get().ui
        // Shift+click adds to (or removes from) the selection instead of replacing it.
        if (shiftHeld && selection && ui.selection && !(ui.selection.kind === selection.kind && ui.selection.id === selection.id)) {
          const has = ui.extra.some((e) => e.kind === selection.kind && e.id === selection.id)
          return set({ ui: { ...ui, extra: has ? ui.extra.filter((e) => !(e.kind === selection.kind && e.id === selection.id)) : [...ui.extra, selection] } })
        }
        if (shiftHeld && !selection && ui.extra.length) return
        set({ ui: { ...ui, selection, extra: [] } })
      },
      notify: (msg) => {
        clearTimeout(toastTimer)
        set({ ui: { ...get().ui, toast: msg } })
        toastTimer = setTimeout(() => set({ ui: { ...get().ui, toast: null } }), 2600)
      },
    }),
    {
      partialize: (s) => ({ project: s.project }),
      limit: 100,
      equality: (a, b) => a.project === b.project,
    },
  ),
)

// One undo step per gesture: consecutive changes from the same focused form control within 1.5 s, or all
// changes made while one mouse/finger press is held (dragging a handle in an editor), merge into one.
let lastControl: Element | null = null
let lastAt = 0
let press = 0 // increases on every press
let pressHeld = false
let lastPress = -1
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => ((press += 1), (pressHeld = true)), true)
  const release = () => (pressHeld = false)
  window.addEventListener('pointerup', release, true)
  window.addEventListener('pointercancel', release, true)
  // Some popups (native selects) and alt-tab swallow the pointerup; don't let later edits merge into one step.
  window.addEventListener('pointermove', (e) => e.buttons === 0 && release(), true)
  window.addEventListener('keydown', release, true)
  window.addEventListener('blur', release)
}
function mergeWithLast() {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  const now = Date.now()
  const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  const sameField = field && el === lastControl && now - lastAt < 1500
  const samePress = pressHeld && press === lastPress
  lastControl = field ? el : null
  lastPress = pressHeld ? press : -1
  lastAt = now
  return sameField || samePress
}

// After undo/redo, drop a selection whose item no longer exists.
function reconcileSelection() {
  const { project: p, ui } = useStore.getState()
  const sel = ui.selection
  if (!sel) return
  const lists: Record<string, { id: string }[] | undefined> = {
    screen: p.screens,
    ground: p.ground,
    deck: p.decks,
    truss: p.truss,
    hoist: p.hoists,
    fixture: p.fixtures,
    table: p.tables,
    decor: p.decor,
    set: p.set,
    comment: (p as unknown as { comments?: { id: string }[] }).comments,
  }
  const list = lists[sel.kind]
  if (list && !list.some((x) => x.id === sel.id)) useStore.setState({ ui: { ...ui, selection: null, extra: [] } })
}
export const undo = () => {
  lastControl = null
  useStore.temporal.getState().undo()
  reconcileSelection()
}
export const redo = () => {
  lastControl = null
  useStore.temporal.getState().redo()
  reconcileSelection()
}

// Save status on this device: shown in the footer so a failed save is never silent.
export const useSave = create<{ local: 'saving' | 'saved' | 'failed'; at: number }>(() => ({ local: 'saved', at: 0 }))

let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending = false
function writeLocal() {
  clearTimeout(saveTimer)
  pending = false
  const ok = writeProject(useStore.getState().project)
  useSave.setState({ local: ok ? 'saved' : 'failed', at: Date.now() })
  return ok
}
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return
  clearTimeout(saveTimer)
  pending = true
  if (useSave.getState().local !== 'saving') useSave.setState({ local: 'saving' })
  saveTimer = setTimeout(writeLocal, 400)
  scheduleCloudSave()
})
// Write the last edit straight away when the tab is hidden or closed, so nothing waits on the timer.
if (typeof window !== 'undefined') {
  const flush = () => pending && writeLocal()
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
}

// Signed-in users also get a cloud copy, a little after they stop editing.
let cloudTimer: ReturnType<typeof setTimeout> | undefined
export function scheduleCloudSave(delay = 1500) {
  if (!cloudEnabled || !useAuth.getState().user) return
  clearTimeout(cloudTimer)
  useAuth.setState({ sync: 'saving' })
  cloudTimer = setTimeout(async () => {
    try {
      await pushProject(useStore.getState().project)
      useAuth.setState({ sync: 'saved' })
    } catch {
      useAuth.setState({ sync: 'offline' })
    }
  }, delay)
}

export function saveNow() {
  scheduleCloudSave(0)
  return writeLocal()
}

// Back online: retry the cloud copy straight away.
if (typeof window !== 'undefined') window.addEventListener('online', () => scheduleCloudSave(0))

// After signing in, back up the open project straight away.
useAuth.subscribe((a, prev) => {
  if (a.user && a.user.id !== prev.user?.id) scheduleCloudSave(0)
})
