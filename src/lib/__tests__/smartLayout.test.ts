import { describe, expect, it } from 'vitest'
import { briefToProject, parseBrief } from '../smartLayout'

describe('parseBrief', () => {
  it('parses an English sangeet brief', () => {
    const { input, extras } = parseBrief('300 pax sangeet, 40x20 stage, round tables, 2 side screens, outdoor lawn, mandap and cold pyro')
    expect(input.audience).toBe(300)
    expect(input.eventType).toBe('Wedding Sangeet')
    expect(input.outdoor).toBe(true)
    expect(extras.stageW).toBeCloseTo(12.2, 1) // 40x20: ambiguous, read as feet
    expect(extras.stageL).toBeCloseTo(6.1, 1)
    expect(extras.tables).toBe('round')
    expect(extras.screens).toBe(2)
    expect(extras.decor).toEqual(expect.arrayContaining(['mandap', 'cold pyro']))
  })
  it('parses Hinglish', () => {
    const { input, extras } = parseBrief('500 log ki shaadi, mandap, lawn')
    expect(input.audience).toBe(500)
    expect(input.eventType).toBe('Wedding Sangeet')
    expect(input.outdoor).toBe(true)
    expect(extras.decor).toContain('mandap')
  })
  it('reads metre stage and venue sizes', () => {
    const { input, extras } = parseBrief('DJ party for 1200 people, stage 12m x 8m, venue 60x80')
    expect(input.eventType).toBe('DJ Night')
    expect(extras.stageW).toBe(12)
    expect(extras.stageL).toBe(8)
    expect(input.venueW).toBe(60)
    expect(input.venueL).toBe(80)
  })
  it('derives a venue and indoor hall', () => {
    const { input, notes } = parseBrief('corporate keynote, 200 guests in a hall')
    expect(input.eventType).toBe('Corporate Keynote')
    expect(input.outdoor).toBe(false)
    expect(input.venueW).toBeGreaterThanOrEqual(20)
    expect(notes.some((n) => /estimated/.test(n))).toBe(true)
  })
})

describe('briefToProject', () => {
  it('resizes the stage', () => {
    const { project } = briefToProject('400 guests sangeet, 12m x 6m stage, lawn')
    expect(project.audience).toBe(400)
    expect(project.decks.length).toBe(6 * 6)
  })
})
