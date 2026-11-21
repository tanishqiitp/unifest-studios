import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from './templates'
import { autoDesign, coverage, delayFor, levelFrom, newSource, soundRows, soundWarnings, targetOf } from './sound'

describe('sound planning', () => {
  it('a point source loses 6 dB per doubling of distance', () => {
    const s = newSource('top12', 'main', 0, 0, { z: 0 })
    const a = levelFrom(s, 0, 10)
    const b = levelFrom(s, 0, 20)
    expect(a - b).toBeGreaterThan(5.5)
    expect(a - b).toBeLessThan(6.6)
  })

  it('a tall line array falls off more slowly up close', () => {
    const s = newSource('la12', 'main', 0, 0, { z: 10, flown: true, boxes: 12 })
    expect(levelFrom(s, 0, 5) - levelFrom(s, 0, 10)).toBeLessThan(4)
  })

  it('off-axis listeners are quieter', () => {
    const s = newSource('top15', 'main', 0, 0)
    expect(levelFrom(s, 0, 20)).toBeGreaterThan(levelFrom(s, 20, 3) + 5)
  })

  it('designs a sensible system for every template', () => {
    for (const t of TEMPLATES) {
      const p = generateProject(t)
      const plan = autoDesign(p)
      p.sound = plan
      const mains = plan.sources.filter((s) => s.role === 'main')
      expect(mains.length).toBeGreaterThanOrEqual(2)
      expect(plan.sources.some((s) => s.role === 'sub')).toBe(true)
      const cov = coverage(p, plan)
      // Most of the audience within ±6 dB of the target, and the mixing desk close to it.
      expect(1 - cov.stats.quiet - cov.stats.loud).toBeGreaterThan(0.75)
      if (cov.stats.foh !== null) expect(Math.abs(cov.stats.foh - targetOf(plan))).toBeLessThan(8)
      expect(soundRows(p).length).toBeGreaterThan(2)
      expect(soundWarnings(p, cov).filter((w) => /delay is/.test(w))).toHaveLength(0)
    }
  })

  it('big open-air shows get delay towers with the right delay', () => {
    const p = generateProject(TEMPLATES.find((t) => t.audience >= 8000)!)
    const plan = autoDesign(p)
    const delays = plan.sources.filter((s) => s.role === 'delay')
    expect(delays.length).toBeGreaterThanOrEqual(2)
    for (const d of delays) expect(d.delay).toBeCloseTo(delayFor(plan, d), 1)
    expect(delays[0].delay!).toBeGreaterThan(50)
  })
})
