import { describe, expect, it } from 'vitest'
import { audienceEstimate, audienceVerdict } from '../capacity'
import { generateProject, TEMPLATES } from '../templates'
import type { GroundItem, Project, Table } from '../../types'

const zone = (id: string, kind: GroundItem['kind'], x: number, y: number, w: number, h: number, rotation = 0): GroundItem => ({ id, kind, x, y, w, h, rotation, label: id })
const proj = (ground: GroundItem[], venue = { w: 50, l: 70 }, extra: Partial<Project> = {}): Project => ({ ...generateProject(TEMPLATES[0]), venue: { ...generateProject(TEMPLATES[0]).venue, ...venue }, ground, decks: [], tables: [], ...extra })

describe('audience space estimate', () => {
  it('counts a zone fully inside the venue at its density', () => {
    const e = audienceEstimate(proj([zone('a', 'crowd', 0, 0, 10, 10)]))
    expect(e.estimate).toBe(200)
    expect(e.status).toBe('ok')
  })
  it('does not count a zone fully outside the venue and marks the estimate unverified', () => {
    const e = audienceEstimate(proj([zone('a', 'crowd', 0, 0, 10, 10), zone('b', 'crowd', 60, 0, 10, 10)]))
    expect(e.estimate).toBe(200)
    expect(e.status).toBe('check')
    expect(e.issues.some((i) => i.id === 'b' && i.level === 'error')).toBe(true)
  })
  it('clips a zone partly outside the venue', () => {
    const e = audienceEstimate(proj([zone('a', 'crowd', 45, 0, 10, 10)]))
    expect(e.zones[0].usable).toBeCloseTo(50)
    expect(e.estimate).toBe(100)
    expect(e.status).toBe('check')
  })
  it('counts overlapping zones once, at the lower density', () => {
    const e = audienceEstimate(proj([zone('a', 'crowd', 0, 0, 10, 10), zone('b', 'vip', 0, 0, 5, 4)]))
    // VIP (1/m²) keeps its 20 m²; the crowd loses those 20 m².
    expect(e.estimate).toBe(20 + 80 * 2)
  })
  it('does not count floor under the stage or FOH', () => {
    const p = proj([zone('a', 'crowd', 0, 0, 20, 20), zone('f', 'foh', 5, 5, 4, 4)], undefined, { decks: [{ id: 'd', x: 0, y: 0, w: 10, l: 5, h: 1 } as Project['decks'][number]] })
    expect(audienceEstimate(p).zones[0].usable).toBeCloseTo(400 - 50 - 16)
  })
  it('counts table seats exactly and never twice with a seating zone', () => {
    const t: Table = { id: 't', kind: 'round', x: 5, y: 5, w: 1.8, l: 1.8, rotation: 0, seats: 10, label: 'T1' }
    const e = audienceEstimate(proj([zone('s', 'seating', 0, 0, 10, 10)], undefined, { tables: [t] }))
    expect(e.estimate).toBe(10)
  })
  it('reports unknown for an empty or invalid venue', () => {
    expect(audienceEstimate(proj([])).status).toBe('unknown')
    expect(audienceEstimate(proj([zone('a', 'crowd', 0, 0, 10, 10)], { w: 0, l: 70 })).status).toBe('unknown')
  })
  it('reproduces the shrunk College Fest venue and no longer says it fits', () => {
    const p = generateProject(TEMPLATES[0])
    p.venue = { ...p.venue, w: 10 }
    const e = audienceEstimate(p)
    expect(e.status).toBe('check')
    expect(audienceVerdict(e, 1500).text).not.toMatch(/within/)
  })
  it('gives an honest verdict either side of the estimate', () => {
    const e = audienceEstimate(proj([zone('a', 'crowd', 0, 0, 10, 10)]))
    expect(audienceVerdict(e, 150).tone).toBe('ok')
    expect(audienceVerdict(e, 250).tone).toBe('error')
  })
})
