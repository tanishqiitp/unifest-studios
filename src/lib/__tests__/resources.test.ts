import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyProject } from '../templates'
import { writeProject } from '../library'
import type { Decor, DecorKind, Fixture } from '../../types'
import { availability, crewSuggestion, generatorPlan, inventoryFromProject, otherProjects, packList, readInventory, writeInventory } from '../resources'

// Tests run in node: give them an in-memory localStorage.
beforeEach(() => {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) })
})

const decor = (kind: DecorKind): Decor => ({ id: Math.random().toString(36), kind, x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, rotation: 0, color: '#fff', label: '' })
const fixture = (kind: Fixture['kind']): Fixture => ({ id: Math.random().toString(36), kind, x: 0, y: 0, z: 0 })

describe('inventory', () => {
  it('round-trips through localStorage and seeds from a project', () => {
    const p = emptyProject()
    p.decor = [decor('pillar'), decor('pillar')]
    const inv = inventoryFromProject(p)
    expect(inv).toEqual([expect.objectContaining({ item: 'Pillar', qty: 2, category: 'Decor' })])
    writeInventory(inv)
    expect(readInventory()).toEqual(inv)
  })
})

describe('availability', () => {
  it('counts overlapping events and flags hire-in', () => {
    const p = emptyProject('A')
    p.id = 'a'
    p.decor = [decor('pillar'), decor('pillar'), decor('flag')]
    p.eventDate = '2026-12-10'
    p.eventDays = 2
    const o = emptyProject('B')
    o.id = 'b'
    o.decor = [decor('pillar'), decor('pillar'), decor('pillar')]
    o.eventDate = '2026-12-11'
    const far = { ...o, id: 'c', eventDate: '2027-01-20' }
    const rows = availability(p, [{ id: '1', item: 'Pillar', category: 'Decor', qty: 4 }], [o, far])
    expect(rows.find((r) => r.item === 'Pillar')).toMatchObject({ need: 2, own: 4, bookedElsewhere: 3, short: 1, hireIn: false })
    expect(rows.find((r) => r.item === 'Flag')).toMatchObject({ own: 0, short: 1, hireIn: true })
    expect(availability({ ...p, eventDate: undefined }, [], [o])[0].bookedElsewhere).toBe(0)
  })

  it('reads other projects from the library', () => {
    const a = { ...emptyProject('A'), id: 'a' }
    const b = { ...emptyProject('B'), id: 'b' }
    writeProject(a)
    writeProject(b)
    expect(otherProjects(a).map((x) => x.id)).toEqual(['b'])
  })
})

describe('packList', () => {
  it('splits rows across trucks by weight in load order', () => {
    const p = emptyProject()
    p.decor = Array.from({ length: 5 }, () => decor('mandap')) // 5 x 400 kg
    p.decor.push(decor('flag'))
    const trucks = packList(p, 1000)
    expect(trucks.length).toBe(3)
    expect(trucks[0].items[0]).toMatchObject({ item: 'Mandap', qty: 2 })
    expect(trucks.reduce((a, t) => a + t.items.filter((i) => i.item === 'Mandap').reduce((s, i) => s + i.qty, 0), 0)).toBe(5)
    expect(trucks.every((t) => t.kg <= 1000)).toBe(true)
  })
})

describe('generatorPlan', () => {
  it('sizes a DG set with diversity and headroom', () => {
    const p = emptyProject()
    p.decor = Array.from({ length: 10 }, () => decor('smoke')) // 12 kW at 0.5
    const g = generatorPlan(p)
    expect(g.connectedKw).toBe(12)
    expect(g.diversity).toBe(0.5)
    expect(g.demandKva).toBe(7.5)
    expect(g.suggestedKva).toBe(15) // 7.5 * 1.25 = 9.4 -> 15 kVA
    expect(g.standby).toBe(false)
  })
  it('uses multiple sets and standby for big loads', () => {
    const p = emptyProject()
    for (let i = 0; i < 1500; i++) p.fixtures.push(fixture('blinder'))
    const g = generatorPlan(p)
    expect(g.sets.every((s) => s <= 500)).toBe(true)
    expect(g.sets.length).toBeGreaterThan(1)
    expect(g.standby).toBe(true)
  })
})

describe('crewSuggestion', () => {
  it('scales crew with scope', () => {
    const p = emptyProject()
    expect(crewSuggestion(p).map((c) => c.dept)).toEqual(['Production'])
    for (let i = 0; i < 25; i++) p.fixtures.push(fixture('par'))
    p.fixtures.push(fixture('sub'))
    p.decor = [decor('pillar')]
    const c = crewSuggestion(p)
    expect(c.filter((x) => x.dept === 'Lighting').length).toBe(3) // ceil(25/20)+1
    expect(c.filter((x) => x.dept === 'Sound').length).toBe(2)
    expect(c.filter((x) => x.dept === 'Decor').length).toBe(2)
  })
})
