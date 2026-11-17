import { describe, expect, it } from 'vitest'

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
}
;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()

describe('save points', () => {
  it('saves, lists newest first, restores with the same project id and deletes', async () => {
    const S = await import('../savepoints')
    const { generateProject, TEMPLATES } = await import('../templates')
    const p = { ...generateProject(TEMPLATES[0]), id: 'proj1' }
    const a = S.addPoint(p, 'Rev 1')
    const changed = { ...p, audience: 999 }
    const b = S.addPoint(changed, 'Rev 2', 'bigger crowd')
    expect(typeof a).toBe('object')
    const list = S.listPoints('proj1')
    expect(list.map((x) => x.name)).toEqual(['Rev 2', 'Rev 1'])
    const restored = S.pointProject(list[1], 'proj1')
    expect(restored.audience).toBe(p.audience)
    expect(restored.id).toBe('proj1')
    S.deletePoint('proj1', (b as { id: string }).id)
    expect(S.listPoints('proj1')).toHaveLength(1)
  })
  it('reports a full device instead of failing silently', async () => {
    const S = await import('../savepoints')
    const store = (globalThis as unknown as { localStorage: MemoryStorage }).localStorage
    const orig = store.setItem
    store.setItem = () => {
      throw new Error('full')
    }
    const { generateProject, TEMPLATES } = await import('../templates')
    expect(typeof S.addPoint({ ...generateProject(TEMPLATES[0]), id: 'p2' }, 'x')).toBe('string')
    store.setItem = orig
  })
})
