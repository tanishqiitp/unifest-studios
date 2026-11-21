import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from './templates'
import { stageBounds } from './calc'
import { coverage } from './sound'
import { getWarnings } from './warnings'

const jaipur = TEMPLATES.filter((t) => t.region === 'Jaipur')

describe('Jaipur templates', () => {
  it('there are several, each with a source note', () => {
    expect(jaipur.length).toBeGreaterThanOrEqual(6)
    for (const t of jaipur.filter((t) => t.sound)) expect(t.source).toBeTruthy()
  })

  it('build the stage, tiers, theme and sound system they describe', () => {
    for (const t of jaipur.filter((t) => t.stage)) {
      const p = generateProject(t)
      const sb = stageBounds(p)!
      expect(sb.w).toBe(t.stage!.w)
      expect(p.look?.theme).toBe(t.theme)
      expect(p.sound?.sources.length).toBeGreaterThan(2)
      expect(p.fixtures.some((f) => f.kind === 'line-array')).toBe(false)
      for (const z of t.zones ?? []) expect(p.ground.some((g) => g.label === z.label && g.h > 2)).toBe(true)
      // Everything inside the venue.
      for (const g of p.ground) {
        expect(g.x).toBeGreaterThanOrEqual(0)
        expect(g.y + g.h).toBeLessThanOrEqual(p.venue.l + 0.01)
      }
      // Only the permit reminders and the seat-count note: no safety, exit or sound problems.
      const bad = getWarnings(p).filter((w) => !/permission|approval|Seating holds/.test(w.text))
      expect(bad.map((w) => w.text)).toEqual([])
      const cov = coverage(p, p.sound!)
      expect(1 - cov.stats.quiet - cov.stats.loud).toBeGreaterThan(0.7)
    }
  })

  it('the arena show gets a runway with a B-stage and delay towers', () => {
    const p = generateProject(jaipur.find((t) => t.audience >= 15000)!)
    const sb = stageBounds(p)!
    expect(sb.l).toBeGreaterThan(14 + 10)
    expect(p.sound!.sources.filter((s) => s.role === 'delay').length).toBeGreaterThanOrEqual(2)
  })
})
