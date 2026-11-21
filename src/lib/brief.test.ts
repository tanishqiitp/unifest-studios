import { describe, expect, it } from 'vitest'
import { normalizePlan, planToProject, rulePlan } from './brief'
import { applyTheme } from './themes'
import { generateProject, TEMPLATES } from './templates'

describe('text to layout', () => {
  it('reads the example brief', () => {
    const p = rulePlan('1,500-guest sangeet on a 60×40 lawn, 40×20 ft stage, two LED sides, cold pyro')
    expect(p.eventType).toBe('Wedding Sangeet')
    expect(p.audience).toBe(1500)
    expect(p.venue).toMatchObject({ w: 60, l: 40, outdoor: true })
    expect(p.stage?.w).toBeCloseTo(12.2, 0)
    expect(p.screens).toEqual({ center: false, sides: true })
    expect(p.effects).toContain('cold pyro')
  })

  it('reads Hinglish, seating, theme and stage height', () => {
    const p = rulePlan('500 log ki shaadi, banquet hall, round tables, royal rajasthani theme, 3 ft high stage, no screens')
    expect(p.audience).toBe(500)
    expect(p.venue.outdoor).toBe(false)
    expect(p.seating).toBe('banquet')
    expect(p.theme).toBe('royal')
    expect(p.stage?.h).toBeCloseTo(0.9, 1)
    expect(p.screens).toEqual({ center: false, sides: false })
  })

  it('builds a full draft: stage, side screens only, seating, effects, sound and theme', () => {
    const { project } = planToProject(rulePlan('800 guests wedding reception on a 50x60 lawn, 12x8 m stage, two side screens, round tables, cold pyro and smoke, neon cyberpunk theme'))
    expect(project.decks.reduce((a, d) => a + d.w * d.l, 0)).toBeCloseTo(96, 0)
    expect(project.screens.length).toBeGreaterThan(0)
    expect(project.screens.every((s) => !/cent/i.test(s.name))).toBe(true)
    expect(project.tables.length).toBeGreaterThan(10)
    expect(project.decor?.some((d) => d.kind === 'cold-pyro')).toBe(true)
    expect(project.sound?.sources.length).toBeGreaterThan(3)
    expect(project.look?.theme).toBe('cyber')
  })

  it('never trusts an outside (AI) answer blindly', () => {
    const p = normalizePlan({ eventType: 'Rocket launch', audience: -5, venue: { w: 99999 }, decor: ['mandap', 'unicorns'], theme: 'nope' })
    expect(p.eventType).toBe('Wedding Sangeet')
    expect(p.audience).toBe(10)
    expect(p.venue.w).toBe(600)
    expect(p.decor).toEqual(['mandap'])
    expect(p.theme).toBeUndefined()
  })
})

describe('themes', () => {
  it('restyle colours and finishes, never sizes or effects', () => {
    const p = generateProject(TEMPLATES[0])
    const before = JSON.stringify(p.decks.map((d) => [d.x, d.y, d.w, d.l, d.h]))
    applyTheme(p, 'royal')
    expect(p.look?.theme).toBe('royal')
    expect(p.truss.every((t) => t.finish === 'black')).toBe(true)
    expect(p.decks.every((d) => d.color === '#3a0a10')).toBe(true)
    expect(JSON.stringify(p.decks.map((d) => [d.x, d.y, d.w, d.l, d.h]))).toBe(before)
  })
})
