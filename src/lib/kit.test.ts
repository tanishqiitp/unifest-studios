import { beforeEach, describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from './templates'
import { anchor, insertKit, loadKit, saveKit } from './kit'
import { autoDesign } from './sound'

const mem = new Map<string, string>()
beforeEach(() => {
  mem.clear()
  Object.assign(globalThis, {
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
    window: Object.assign(globalThis.window ?? {}, { dispatchEvent: () => true }),
  })
})

describe('my kit', () => {
  it('saves a sound system and drops it at the other venue stage front', () => {
    const a = generateProject(TEMPLATES[0])
    a.sound = autoDesign(a)
    const item = saveKit(a, 'sound', 'Festival PA')
    expect(loadKit()).toHaveLength(1)
    const b = generateProject(TEMPLATES[3])
    insertKit(b, item, 'replace')
    expect(b.sound?.sources).toHaveLength(a.sound.sources.length)
    // Same offsets from the stage front centre, in the new venue.
    const ra = a.sound.sources.map((s) => [s.x - anchor(a).x, s.y - anchor(a).y])
    const rb = b.sound!.sources.map((s) => [s.x - anchor(b).x, s.y - anchor(b).y])
    rb.forEach((r, i) => (expect(r[0]).toBeCloseTo(ra[i][0], 2), expect(r[1]).toBeCloseTo(ra[i][1], 2)))
    expect(new Set(b.sound!.sources.map((s) => s.id)).size).toBe(b.sound!.sources.length)
    expect(b.sound!.sources[0].id).not.toBe(a.sound.sources[0].id)
  })

  it('adds a truss rig alongside, or replaces it', () => {
    const a = generateProject(TEMPLATES[0])
    const item = saveKit(a, 'truss', 'Roof')
    const b = generateProject(TEMPLATES[1])
    const before = b.truss.length
    insertKit(b, item, 'add')
    expect(b.truss.length).toBe(before + a.truss.length)
    insertKit(b, item, 'replace')
    expect(b.truss.length).toBe(a.truss.length)
  })
})
