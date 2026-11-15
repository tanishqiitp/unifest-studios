import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { applyTheme, buildKit, footprint, fromFootprint, KITS, ledBounds, lineLength, newPiece, pieceFromSketch, polyArea, setLedArea, syncSetMirrors } from '../setpieces'
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

describe('drawing set pieces', () => {
  it('a box dragged in the front view becomes a block standing on the ground', () => {
    const s = pieceFromSketch('front', 'rect', [{ x: 10, y: -4 }, { x: 14, y: 0 }], { x: 0, y: 2, z: 0 })!
    expect(s.kind).toBe('block')
    expect([s.x, s.z, s.w, s.h, s.y]).toEqual([12, 0, 4, 4, 2])
  })

  it('a shape drawn in the top view is pushed up and keeps its outline', () => {
    const s = pieceFromSketch('top', 'poly', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 2 }], { x: 0, y: 0, z: 1 })!
    expect(s.kind).toBe('shape')
    expect(s.plane).toBe('top')
    expect([s.w, s.d, s.z]).toEqual([4, 2, 1])
    expect(s.pts).toEqual([[0, 0], [1, 0], [0, 1]])
  })

  it('a line keeps its length and LED area follows its thickness', () => {
    const s = pieceFromSketch('side', 'line', [{ x: 0, y: 0 }, { x: 3, y: -4 }], { x: 5, y: 0, z: 0 })!
    expect(s.kind).toBe('line')
    expect(lineLength(s)).toBeCloseTo(5)
    expect(setLedArea({ ...s, skin: 'led', border: 0.2 })).toBeCloseTo(1)
  })

  it('footprints round-trip in every view', () => {
    const s = newPiece('tower', 10, 3, { z: 1, rot: 30 })
    for (const v of ['front', 'top', 'side'] as const) {
      const back = fromFootprint(v, footprint(s, v))
      for (const [k, val] of Object.entries(back)) expect(val).toBeCloseTo(s[k as 'x'] as number)
    }
  })

  it('mirrors flip drawn outlines and turns', () => {
    const p = proj()
    const a = pieceFromSketch('front', 'triangle', [{ x: 1, y: -3 }, { x: 4, y: 0 }], { x: 0, y: 2, z: 0 })!
    a.pts = [[0, 0], [1, 0], [0, 1]]
    a.rot = 20
    p.set = [a, { ...a, id: 'm', mirrorOf: a.id }]
    syncSetMirrors(p)
    const m = p.set.find((s) => s.id === 'm')!
    expect(m.pts).toEqual([[1, 0], [0, 0], [1, 1]])
    expect(m.rot).toBe(-20)
  })

  it('area of a unit right triangle', () => expect(polyArea([[0, 0], [1, 0], [0, 1]])).toBeCloseTo(0.5))
})
