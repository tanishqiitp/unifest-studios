import { describe, expect, it } from 'vitest'
import { generateProject } from '../templates'
import { CHECKLIST, CHECKLIST_DISCLAIMER, INDIAN_STATES, checklistFor, crowdCheck, noiseNote } from '../safety'

const base = { name: 'T', eventType: 'College Fest' as const, audience: 1000, venueW: 60, venueL: 80, outdoor: true }

describe('crowdCheck', () => {
  it('reports exits and flags overcrowding', () => {
    const p = generateProject(base)
    const c = crowdCheck(p)
    expect(c.exits.length).toBe(2)
    expect(c.totalExitWidth).toBeGreaterThan(0)
    expect(c.targetMinutes).toBe(8)
    expect(c.exitsNeeded).toBeGreaterThanOrEqual(2)
    p.audience = 100000
    expect(crowdCheck(p).level).toBe('error')
  })
  it('handles no exits and indoor target', () => {
    const p = generateProject({ ...base, eventType: 'Corporate Keynote', audience: 600 })
    p.ground = p.ground.filter((g) => g.kind !== 'exit')
    const c = crowdCheck(p)
    expect(c.targetMinutes).toBe(2.5)
    expect(c.evacMinutes).toBe(Infinity)
    expect(c.messages.some((m) => /No exits/.test(m))).toBe(true)
  })
})

describe('checklist', () => {
  it('filters by state', () => {
    expect(CHECKLIST.length).toBeGreaterThanOrEqual(25)
    expect(checklistFor().length).toBe(CHECKLIST.length)
    const rj = checklistFor('RJ')
    expect(rj.some((c) => c.id === 'rj-fire')).toBe(true)
    expect(rj.some((c) => c.id === 'dl-fire')).toBe(false)
    expect(INDIAN_STATES.find((s) => s.code === 'RJ')?.name).toBe('Rajasthan')
    expect(CHECKLIST_DISCLAIMER).toMatch(/verify/)
    expect(noiseNote('DJ Night')).toMatch(/10 pm/)
  })
})
