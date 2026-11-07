import { describe, expect, it } from 'vitest'
import { autoLayout, autoSeat, footprint, parseGuests, seatCount, seatingCSV, seatPositions, TABLE_PRESETS, newTable, withSeating } from '../seating'
import { emptyProject, generateProject, TEMPLATES } from '../templates'
import type { Project } from '../../types'

const preset = (id: string) => TABLE_PRESETS.find((p) => p.id === id)!

describe('Table seats', () => {
  it('places one chair per seat, outside the table edge', () => {
    for (const p of TABLE_PRESETS) {
      const t = newTable(p, 10, 10, '1')
      const seats = seatPositions(t)
      expect(seats).toHaveLength(p.seats)
      if (p.kind === 'round') for (const s of seats) expect(Math.hypot(s.x - 10, s.y - 10)).toBeGreaterThan(p.w / 2)
    }
  })

  it('rotates chairs with the table', () => {
    const t = { ...newTable(preset('banquet-8'), 0, 0, '1'), rotation: 90 }
    const xs = seatPositions(t).map((s) => Math.abs(s.x))
    // Rotated a quarter turn, the long sides face left and right.
    for (const x of xs) expect(x).toBeGreaterThan(0.3)
  })

  it('leaves the stage side open on cabaret tables', () => {
    const t = { ...newTable(preset('round-72'), 0, 0, '1'), seats: 7, open: true }
    // Stage is towards -y: no chair sits directly in front.
    expect(seatPositions(t).every((s) => !(s.y < -0.5 && Math.abs(s.x) < 0.4))).toBe(true)
  })
})

describe('Automatic layout', () => {
  const area = { x: 2, y: 10, w: 30, l: 25 }

  for (const style of ['banquet', 'theatre', 'classroom', 'cabaret'] as const) {
    it(`${style}: seats everyone inside the area with a clear centre aisle`, () => {
      const res = autoLayout({ style, guests: 200, area, aisle: 2 })
      expect(res.fits).toBe(true)
      expect(res.seats).toBeGreaterThanOrEqual(200)
      for (const t of res.tables) {
        const f = footprint(t)
        expect(t.x - f.w / 2).toBeGreaterThanOrEqual(area.x - 0.01)
        expect(t.x + f.w / 2).toBeLessThanOrEqual(area.x + area.w + 0.01)
        expect(t.y + f.l / 2).toBeLessThanOrEqual(area.y + area.l + 0.01)
        // Nothing sits in the aisle down the middle.
        expect(Math.abs(t.x - (area.x + area.w / 2)) - f.w / 2).toBeGreaterThanOrEqual(0.99)
      }
    })
  }

  it('reports when the area is too small', () => {
    const res = autoLayout({ style: 'banquet', guests: 5000, area, aisle: 2 })
    expect(res.fits).toBe(false)
    expect(res.seats).toBeLessThan(5000)
  })

  it('wedding and keynote templates start with tables or rows for the audience', () => {
    for (const name of ['Wedding Sangeet', 'Corporate Keynote']) {
      const t = TEMPLATES.find((x) => x.name === name)!
      const p = generateProject(t)
      expect(seatCount(p)).toBeGreaterThanOrEqual(Math.round(t.audience * 0.9))
    }
  })
})

describe('Guests', () => {
  it('reads a pasted list with groups, meals and VIPs', () => {
    const g = parseGuests('Aarav Mehta, Bride family, Veg, VIP\nSara Khan\tCollege friends\tnon-veg\n\n  Jain Uncle; Groom family; jain')
    expect(g.map((x) => [x.name, x.group, x.meal, x.vip])).toEqual([
      ['Aarav Mehta', 'Bride family', 'veg', true],
      ['Sara Khan', 'College friends', 'non-veg', false],
      ['Jain Uncle', 'Groom family', 'jain', false],
    ])
  })

  it('auto-seat keeps groups together and puts VIPs nearest the stage', () => {
    const p: Project = { ...emptyProject(), decks: [{ id: 'd', x: 10, y: 0, w: 10, l: 4, h: 1 }] }
    const near = newTable(preset('round-60'), 15, 8, '1')
    const far = newTable(preset('round-60'), 15, 20, '2')
    p.tables = [far, near]
    p.guests = [...parseGuests(Array.from({ length: 6 }, (_, i) => `Friend ${i}, Friends`).join('\n')), ...parseGuests('Chief Guest, Hosts, Veg, VIP\nSpouse, Hosts, Veg, VIP')]
    const seated = autoSeat(p)
    expect(seated.every((g) => g.tableId)).toBe(true)
    expect(seated.filter((g) => g.vip).every((g) => g.tableId === near.id)).toBe(true)
    expect(new Set(seated.filter((g) => g.group === 'Friends').map((g) => g.tableId)).size).toBe(1)
  })

  it('never seats more guests than a table holds', () => {
    const p = emptyProject()
    p.tables = [newTable(preset('round-60'), 10, 10, '1')]
    p.guests = parseGuests(Array.from({ length: 12 }, (_, i) => `G${i}`).join('\n'))
    const seated = autoSeat(p)
    expect(seated.filter((g) => g.tableId).length).toBe(8)
  })

  it('exports a seating chart with table names', () => {
    const p = emptyProject()
    p.tables = [newTable(preset('round-60'), 10, 10, '7')]
    p.guests = parseGuests('Zoya, Family, vegan')
    p.guests[0].tableId = p.tables[0].id
    expect(seatingCSV(p).split('\n')[1]).toBe('Zoya,Family,Vegan,,Table 7')
  })

  it('upgrades older projects that have no seating', () => {
    const old = { ...emptyProject() } as Partial<Project>
    delete old.tables
    delete old.guests
    const p = withSeating(old as Project)
    expect(p.tables).toEqual([])
    expect(p.guests).toEqual([])
  })
})
