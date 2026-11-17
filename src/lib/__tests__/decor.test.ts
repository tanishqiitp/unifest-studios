import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { freeSpot, newDecor } from '../decor'

describe('decor placement', () => {
  it('puts repeated pieces side by side, not on top of each other', () => {
    const p = generateProject(TEMPLATES[0])
    p.decor = []
    for (let i = 0; i < 5; i++) {
      const d = newDecor('pillar', 30, 20)
      Object.assign(d, freeSpot(p, d.w, d.d, 30, 20))
      p.decor.push(d)
    }
    const spots = new Set(p.decor.map((d) => `${d.x},${d.y}`))
    expect(spots.size).toBe(5)
    for (const d of p.decor) {
      expect(d.x).toBeGreaterThanOrEqual(0)
      expect(d.x).toBeLessThanOrEqual(p.venue.w)
    }
  })

  it('keeps the start point when it is free', () => {
    const p = generateProject(TEMPLATES[0])
    p.decor = []
    expect(freeSpot(p, 1, 1, 10, 10)).toEqual({ x: 10, y: 10 })
  })
})
