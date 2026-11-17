import { beforeAll, describe, expect, it } from 'vitest'

// The store reads and writes localStorage, so give it an in-memory one before it loads.
class MemoryStorage {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}
;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()

let S: typeof import('../../store')
let lib: typeof import('../library')
beforeAll(async () => {
  S = await import('../../store')
  lib = await import('../library')
})
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('undo and history', () => {
  it('one change is one undo step, and undo clears a selection whose item is gone', () => {
    const { useStore, undo } = S
    const before = useStore.getState().project.ground.length
    useStore.getState().mutate((p) => void p.ground.push({ id: 'zz', kind: 'crowd', x: 1, y: 1, w: 2, h: 2, rotation: 0, label: 'Test zone' }))
    useStore.getState().select({ kind: 'ground', id: 'zz' })
    undo()
    expect(useStore.getState().project.ground.length).toBe(before)
    expect(useStore.getState().ui.selection).toBeNull()
  })

  it('opening a different project clears undo history; replacing content of the same project keeps it', async () => {
    const { useStore } = S
    const cur = useStore.getState().project
    useStore.getState().mutate((p) => void (p.audience += 1))
    useStore.getState().setProject({ ...structuredClone(cur), audience: 5 })
    await flush()
    expect(useStore.temporal.getState().pastStates.length).toBeGreaterThan(0)
    useStore.getState().setProject({ ...structuredClone(cur), id: 'another-project' })
    await flush()
    expect(useStore.temporal.getState().pastStates.length).toBe(0)
  })
})

describe('saving', () => {
  it('saveNow reports success and stores the project on this device', () => {
    const { useStore, saveNow, useSave } = S
    expect(saveNow()).toBe(true)
    expect(useSave.getState().local).toBe('saved')
    expect(lib.readProject(useStore.getState().project.id!)?.name).toBe(useStore.getState().project.name)
  })

  it('a damaged save is kept aside instead of being lost', () => {
    localStorage.setItem('unifest:p:broken', '{not json')
    expect(lib.readProject('broken')).toBeNull()
    expect(localStorage.getItem('unifest:damaged:broken')).toBe('{not json')
  })
})
