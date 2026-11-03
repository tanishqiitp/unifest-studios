import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Mode, Project, Screen, Workspace } from './types'
import { findPanel } from './lib/panels'
import { generateProject, TEMPLATES } from './lib/templates'
import { loadCurrent, writeProject } from './lib/library'
import { nanoid } from 'nanoid'

export type Selection = { kind: 'screen' | 'ground' | 'deck' | 'truss' | 'hoist' | 'fixture'; id: string } | null
export type LedOverlay = 'none' | 'data' | 'power'
export type Tool = 'select' | 'pan' | 'paint' | 'measure' | 'draw-truss' | 'hoist'

interface UI {
  workspace: Workspace
  mode: Mode
  selection: Selection
  tool: Tool
  magnet: boolean
  overlay: LedOverlay
  wizardOpen: boolean
  shortcutsOpen: boolean
  home: boolean
  guideOpen: boolean
  warningsOpen: boolean
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
  return loadCurrent() ?? { ...generateProject(TEMPLATES[0]), id: nanoid(10) }
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
        tool: 'select',
        magnet: true,
        overlay: 'none',
        wizardOpen: false,
        shortcutsOpen: false,
        home: true,
        guideOpen: false,
        warningsOpen: false,
        toast: null,
      },
      mutate: (fn) => {
        const p = structuredClone(get().project)
        fn(p)
        syncMirrors(p)
        p.updatedAt = Date.now()
        set({ project: p })
      },
      setProject: (p) => {
        if (!p.id) p.id = nanoid(10)
        syncMirrors(p)
        set({ project: p, ui: { ...get().ui, selection: null } })
      },
      setUI: (u) => set({ ui: { ...get().ui, ...u } }),
      select: (selection) => set({ ui: { ...get().ui, selection } }),
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

export const undo = () => useStore.temporal.getState().undo()
export const redo = () => useStore.temporal.getState().redo()

let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => writeProject(s.project), 400)
})

export function saveNow() {
  return writeProject(useStore.getState().project)
}
