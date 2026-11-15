import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { applyTheme, buildKit, KITS, ledBounds, newPiece, setLedArea, syncSetMirrors } from '../setpieces'
import { fullEquipment, quoteLines } from '../quote'
import { liteProject } from '../export/files'

const proj = () => generateProject(TEMPLATES[0])

describe('set pieces', () => {
  it('every kit builds pieces with sane sizes', () => {
    for (const k of KITS) {
      const set = buildKit(proj(), k.id)
      expect(set.length).toBeGreaterThan(1)
      for (const s of set) expect(s.w > 0 && s.h > 0 && s.d > 0 && s.z >= 0).toBe(true)
    }
  })

  it('mirrors follow their source across the centre line', () => {
    const p = proj()
    const a = newPiece('tower', p.venue.w / 2 - 10, 2)
    p.set = [a, { ...a, id: 'm', mirrorOf: a.id }]
    a.h = 12
    syncSetMirrors(p)
    const m = p.set.find((s) => s.id === 'm')!
    expect(m.h).toBe(12)
    expect(m.x).toBeCloseTo(p.venue.w / 2 + 10)
  })

  it('LED area counts faces and filled openings', () => {
    expect(setLedArea(newPiece('tower', 0, 0, { w: 3, h: 10 }))).toBeCloseTo(30)
    const frame = newPiece('frame', 0, 0, { w: 6, h: 5, border: 0.5, skin: 'gold', inner: 'led' })
    expect(setLedArea(frame)).toBeCloseTo(5 * 4)
    expect(setLedArea(newPiece('block', 0, 0, { skin: 'black' }))).toBe(0)
  })

  it('LED bounds span every LED surface', () => {
    const b = ledBounds([newPiece('tower', 0, 0, { w: 2, h: 4 }), newPiece('tower', 10, 0, { w: 2, h: 8, z: 1 })])!
    expect(b).toEqual({ x0: -1, x1: 11, z0: 0, z1: 9 })
  })

  it('themes restyle non-LED pieces but keep LED', () => {
    const set = applyTheme([newPiece('tower', 0, 0), newPiece('frame', 0, 0, { skin: 'white' })], 'carnival')
    expect(set[0].skin).toBe('led')
    expect(set[1].skin).toBe('gold')
    expect(set[1].outline?.style).toBe('bulb')
  })

  it('set pieces are priced in the quote and kept in client links without artwork', () => {
    const p = proj()
    p.set = buildKit(p, 'carnival')
    p.set[0].image = 'data:image/png;base64,AAAA'
    expect(fullEquipment(p).some((r) => r.category === 'Set')).toBe(true)
    expect(quoteLines(p).filter((l) => l.category === 'Set').every((l) => l.rate > 0)).toBe(true)
    const lite = liteProject(p)
    expect(lite.set?.length).toBe(p.set.length)
    expect(lite.set?.[0].image).toBeUndefined()
    expect(liteProject(p, true).set?.[0].image).toBeDefined()
  })
})
