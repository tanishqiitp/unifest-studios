import { beforeEach, describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { getWarnings } from '../warnings'
import { equipmentCSV, equipmentList } from '../export/equipment'
import { dxfString, readShareHash, resolumeXml, shareLink } from '../export/files'
import { deleteProject, loadCurrent, readLibrary, readProject, writeProject } from '../library'

// Minimal browser globals for the share link and library.
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
const g = globalThis as unknown as { localStorage: MemoryStorage; location: { origin: string; pathname: string; hash: string } }
g.localStorage = new MemoryStorage()
g.location = { origin: 'https://studio.example', pathname: '/', hash: '' }

describe('Templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.name} generates a layout with no errors`, () => {
      const p = generateProject(t)
      expect(p.screens.length).toBeGreaterThan(0)
      expect(p.decks.length).toBeGreaterThan(0)
      expect(p.truss.length).toBeGreaterThan(0)
      const errors = getWarnings(p).filter((w) => w.level === 'error')
      expect(errors.map((e) => e.text)).toEqual([])
    })
  }
})

describe('Warnings', () => {
  it('reports a missing stage and missing exits on an empty plan', () => {
    const p = generateProject(TEMPLATES[0])
    p.decks = []
    p.ground = p.ground.filter((x) => x.kind !== 'exit')
    const text = getWarnings(p).map((w) => w.text.toLowerCase()).join(' | ')
    expect(text).toMatch(/stage/)
    expect(text).toMatch(/exit/)
  })

  it('reports an overloaded hoist as an error', () => {
    const p = generateProject(TEMPLATES[0])
    p.hoists = p.hoists.map((h) => ({ ...h, capacity: 50 }))
    expect(getWarnings(p).some((w) => w.level === 'error')).toBe(true)
  })
})

describe('Exports', () => {
  const p = generateProject(TEMPLATES[1])

  it('share link round-trips the design and fits in a QR code for the default template', () => {
    const link = shareLink(generateProject(TEMPLATES[0]))
    expect(link.startsWith('https://studio.example/#view=')).toBe(true)
    expect(link.length).toBeLessThan(2900)
    g.location.hash = link.slice(link.indexOf('#'))
    const back = readShareHash()!
    expect(back.name).toBe(TEMPLATES[0].name)
    expect(back.screens).toHaveLength(generateProject(TEMPLATES[0]).screens.length)
    expect(back.id).toBeUndefined()
    g.location.hash = ''
  })

  it('every template link fits in a QR code and restores screens exactly', () => {
    for (const t of TEMPLATES) {
      const src = generateProject(t)
      const link = shareLink(src)
      expect(link.length, t.name).toBeLessThan(2900)
      g.location.hash = link.slice(link.indexOf('#'))
      const back = readShareHash()!
      back.screens.forEach((s, i) => {
        const o = src.screens[i]
        expect([s.cols, s.rows, s.shape, s.curveDeg, s.rotation, s.virtual.length]).toEqual([o.cols, o.rows, o.shape, o.curveDeg, o.rotation, o.virtual.length])
        expect(s.x).toBeCloseTo(o.x, 2)
        expect(s.z).toBeCloseTo(o.z, 2)
      })
      expect(back.truss.map((x) => x.legs)).toEqual(src.truss.map((x) => x.legs))
    }
    g.location.hash = ''
  })

  it('DXF is a valid 1:1 metre drawing with all layers', () => {
    const dxf = dxfString(p)
    expect(dxf).toContain('SECTION')
    expect(dxf).toContain('EOF')
    for (const layer of ['VENUE', 'GROUND', 'STAGE', 'TRUSS', 'RIGGING', 'LED']) expect(dxf).toContain(layer)
    expect(dxf).toMatch(/\$INSUNITS\s*\n\s*70\s*\n\s*6/) // 6 = metres
  })

  it('Resolume XML has one slice per screen', () => {
    for (const v of [6, 7] as const) {
      const xml = resolumeXml(p, v)
      expect(xml.startsWith('<?xml')).toBe(true)
      for (const s of p.screens) expect(xml).toContain(s.name)
      expect((xml.match(/<Slice /g) || []).length).toBe(p.screens.length)
    }
  })

  it('equipment list counts every LED cabinet and opens as CSV', () => {
    const rows = equipmentList(p)
    const cabinets = p.screens.reduce((a, s) => a + s.cols * s.rows - s.virtual.length, 0)
    const led = rows.filter((r) => r.category === 'LED').filter((r) => /cabinet/i.test(r.item))
    expect(led.reduce((a, r) => a + r.qty, 0)).toBe(cabinets)
    const csv = equipmentCSV(p)
    expect(csv.split('\n')[0]).toMatch(/Category/i)
  })
})

describe('Project library', () => {
  beforeEach(() => g.localStorage.clear())

  it('saves, lists, reopens and deletes projects', () => {
    const a = { ...generateProject(TEMPLATES[0]), id: 'aaa', updatedAt: 1 }
    const b = { ...generateProject(TEMPLATES[1]), id: 'bbb', updatedAt: 2 }
    expect(writeProject(a)).toBe(true)
    expect(writeProject(b)).toBe(true)
    expect(readLibrary().map((e) => e.id)).toEqual(['bbb', 'aaa'])
    expect(loadCurrent()?.id).toBe('bbb')
    expect(readProject('aaa')?.name).toBe(a.name)
    deleteProject('bbb')
    expect(readLibrary().map((e) => e.id)).toEqual(['aaa'])
    expect(loadCurrent()).toBeNull()
  })

  it('migrates the single saved project from v0.1', () => {
    const old = generateProject(TEMPLATES[2])
    g.localStorage.setItem('unifest:project', JSON.stringify(old))
    const p = loadCurrent()
    expect(p?.name).toBe(old.name)
    expect(p?.id).toBeTruthy()
    expect(g.localStorage.getItem('unifest:project')).toBeNull()
    expect(readLibrary()).toHaveLength(1)
  })

  it('refuses to save a project without an id', () => {
    expect(writeProject({ ...generateProject(TEMPLATES[0]), id: undefined })).toBe(false)
  })
})

describe('Cloud sync helpers', () => {
  it('merges local and cloud lists, newest copy wins', async () => {
    const { mergeEntries } = await import('../cloud')
    const local = [
      { id: 'a', updatedAt: 5 },
      { id: 'b', updatedAt: 9 },
    ]
    const cloud = [
      { id: 'a', updatedAt: 7 },
      { id: 'c', updatedAt: 1 },
    ]
    const m = mergeEntries(local, cloud)
    expect(m.map((x) => [x.id, x.updatedAt, x.where])).toEqual([
      ['b', 9, 'local'],
      ['a', 7, 'both'],
      ['c', 1, 'cloud'],
    ])
  })

  it('stores the whole project as the row data with searchable columns', async () => {
    const { projectRow } = await import('../cloud')
    const p = { ...generateProject(TEMPLATES[0]), id: 'xyz', updatedAt: Date.UTC(2026, 0, 1) }
    const r = projectRow(p)
    expect(r).toMatchObject({ id: 'xyz', name: p.name, event_type: p.eventType, audience: p.audience, updated_at: '2026-01-01T00:00:00.000Z' })
    expect(r.data.screens).toHaveLength(p.screens.length)
  })

  it('reads short link codes only from /s/<code>', async () => {
    const { shareCodeFromPath } = await import('../cloud')
    const at = (path: string) => ((g.location as unknown as { pathname: string }).pathname = path)
    at('/s/AbC123_xyZ')
    expect(shareCodeFromPath()).toBe('AbC123_xyZ')
    at('/s/short')
    expect(shareCodeFromPath()).toBeNull()
    at('/')
    expect(shareCodeFromPath()).toBeNull()
  })
})
