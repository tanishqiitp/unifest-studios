import { describe, expect, it } from 'vitest'
import { alignMoves, boundsOf, distributeMoves, dropMove, gapBetween, matchScale, snapToParts, stackMove, type Box } from './arrange'

const box = (x: number, y: number, z: number, w = 1, d = 1, h = 1): Box => ({ min: [x, y, z], max: [x + w, y + d, z + h] })

describe('arrange', () => {
  it('aligns edges and centres to a reference', () => {
    const a = box(0, 0, 0)
    const b = box(3, 2, 1, 2)
    expect(alignMoves([a, b], 0, 'min', a).map((m) => m[0])).toEqual([0, -3])
    expect(alignMoves([a, b], 0, 'mid', boundsOf([a, b]))[0][0]).toBeCloseTo(2)
    expect(alignMoves([a, b], 2, 'max', b)[0]).toEqual([0, 0, 1])
  })

  it('spaces boxes evenly between the first and last', () => {
    const bs = [box(0, 0, 0), box(9, 0, 0), box(2, 0, 0, 2)]
    const m = distributeMoves(bs, 0)
    expect(m[0][0]).toBe(0)
    expect(m[1][0]).toBe(0)
    // total 10 m span, 4 m of boxes, 2 gaps of 3 m: the middle one starts at 4
    expect(bs[2].min[0] + m[2][0]).toBeCloseTo(4)
  })

  it('lines boxes up with a fixed gap', () => {
    const bs = [box(0, 0, 0), box(5, 0, 0), box(1, 0, 0)]
    const m = distributeMoves(bs, 0, 0.5)
    expect(bs[2].min[0] + m[2][0]).toBeCloseTo(1.5)
    expect(bs[1].min[0] + m[1][0]).toBeCloseTo(3)
  })

  it('drops onto the highest support under it, else the floor', () => {
    const table = box(0, 0, 0, 4, 4, 1)
    const shelf = box(0, 0, 0, 1, 1, 2)
    expect(dropMove(box(1.5, 1.5, 5), [table, shelf])).toEqual([0, 0, -4])
    expect(dropMove(box(10, 10, 3), [table])).toEqual([0, 0, -3])
    // Off to the side: footprints only touch, so it falls to the floor.
    expect(dropMove(box(4, 0, 2), [table])[2]).toBe(-2)
  })

  it('stacks centred on top', () => {
    expect(stackMove(box(5, 5, 0), box(0, 0, 0, 3, 3, 2))).toEqual([-4, -4, 2])
  })

  it('measures gaps and overlaps', () => {
    const g = gapBetween(box(0, 0, 0), box(3, 0.5, 0))
    expect(g.gap[0]).toBe(2)
    expect(g.gap[1]).toBe(-0.5)
  })

  it('snaps a dragged box to a nearby edge and the floor', () => {
    const other = box(2, 0, 0)
    const s = snapToParts(box(3.08, 0, 0.06), [other], [true, false, true], 0.15)
    expect(s.move[0]).toBeCloseTo(-0.08)
    expect(s.move[2]).toBeCloseTo(-0.06)
    expect(s.move[1]).toBe(0)
    expect(snapToParts(box(3.5, 0, 0.5), [other], [true, false, false], 0.15).hits).toHaveLength(0)
  })

  it('ignores parts far away on the other axes', () => {
    expect(snapToParts(box(2.05, 0, 0), [box(2, 50, 0)], [true, false, false], 0.15).hits).toHaveLength(0)
  })

  it('matches size by scaling', () => {
    expect(matchScale(box(0, 0, 0, 2, 1, 1), box(0, 0, 0, 4, 3, 1), [1, 1, 1], [true, false, true])).toEqual([2, 1, 1])
  })
})
