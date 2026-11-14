import { describe, expect, it } from 'vitest'
import { emptyProject } from '../templates'
import type { Decor, DecorKind } from '../../types'
import { decorRows, defaultQuote, defaultRate, fullEquipment, quoteCSV, quoteLines, quoteTotals, SAC } from '../quote'

const decor = (kind: DecorKind, sponsor?: string): Decor => ({ id: Math.random().toString(36), kind, x: 0, y: 0, z: 0, w: 1, d: 1, h: 1, rotation: 0, color: '#fff', label: '', sponsor })
const row = (category: string, item: string) => ({ category, item, qty: 1, unit: 'pcs', weightKg: 0, powerW: 0 })

describe('decorRows', () => {
  it('groups by kind and names sponsored banners', () => {
    const p = emptyProject()
    p.decor = [decor('pillar'), decor('pillar'), decor('banner', 'Acme'), decor('banner')]
    const rows = decorRows(p)
    expect(rows.find((r) => r.item === 'Pillar')?.qty).toBe(2)
    expect(rows.find((r) => r.item === 'Banner - Acme')?.category).toBe('Branding')
    expect(rows.find((r) => r.item === 'Banner')?.qty).toBe(1)
    expect(fullEquipment(p).length).toBe(rows.length)
  })
})

describe('defaultRate', () => {
  it('guesses by item text', () => {
    expect(defaultRate(row('LED', 'ROE cabinet'))).toBe(900)
    expect(defaultRate(row('Truss', 'Box truss 4 m'))).toBe(600)
    expect(defaultRate(row('Truss', 'Ground-support tower 6 m'))).toBe(2500)
    expect(defaultRate(row('Lighting', 'LED par'))).toBe(400)
    expect(defaultRate(row('Lighting', 'Moving head'))).toBe(1800)
    expect(defaultRate(row('Sound', 'Subwoofer'))).toBe(3500)
    expect(defaultRate(row('Effects', 'Smoke machine'))).toBe(1500)
    expect(defaultRate(row('Misc', 'Mystery box'))).toBe(0)
  })
})

describe('quote', () => {
  it('computes lines with override, margin, days, single-use and crew', () => {
    const p = emptyProject()
    p.decor = [decor('pillar'), decor('firework'), decor('firework')]
    p.crew = [
      { id: '1', name: 'A', role: 'Tech', phone: '', call: '', dept: 'LED' },
      { id: '2', name: 'B', role: 'Tech', phone: '', call: '', dept: 'LED' },
    ]
    p.quote = { ...defaultQuote(), days: 3, margin: 10, rates: { Pillar: 1000 } }
    const lines = quoteLines(p)
    expect(lines.find((l) => l.item === 'Pillar')).toMatchObject({ rate: 1100, amount: 3300 })
    expect(lines.find((l) => l.item.startsWith('Ground firework'))).toMatchObject({ qty: 2, days: 1, amount: 1760 })
    expect(lines.find((l) => l.category === 'Crew')).toMatchObject({ qty: 2, unit: 'person-days', amount: 2 * 2750 * 3 })
  })

  it('splits GST into CGST+SGST or IGST', () => {
    const p = emptyProject()
    p.quote = { ...defaultQuote(), extras: [{ id: 'x', item: 'Misc', qty: 1, unit: 'lot', rate: 10000 }], discount: 10 }
    expect(quoteTotals(p)).toEqual({ subtotal: 10000, discount: 1000, taxable: 9000, cgst: 810, sgst: 810, igst: 0, total: 10620 })
    p.quote.sameState = false
    expect(quoteTotals(p)).toMatchObject({ cgst: 0, sgst: 0, igst: 1620, total: 10620 })
    expect(SAC).toBe('998596')
  })

  it('exports CSV with header and rows', () => {
    const p = emptyProject()
    p.decor = [decor('flag')]
    const csv = quoteCSV(p).split('\r\n')
    expect(csv[0]).toContain('"Amount (INR)"')
    expect(csv[1]).toContain('"Flag"')
  })
})
