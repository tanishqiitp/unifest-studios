// Arranging parts against each other: align, distribute, drop onto what's below, stack, snap while dragging.
// Pure maths on axis-aligned boxes in venue axes (x across, y depth towards the audience, z up), so it is
// cheap and testable; the Model workspace measures the boxes and applies the returned moves.
import type { Vec3 } from '../types'

export interface Box {
  min: Vec3
  max: Vec3
}
export type Axis3 = 0 | 1 | 2
export type Edge = 'min' | 'mid' | 'max'

const mid = (b: Box, i: number) => (b.min[i] + b.max[i]) / 2
const at = (b: Box, i: number, e: Edge) => (e === 'min' ? b.min[i] : e === 'max' ? b.max[i] : mid(b, i))
const zero = (): Vec3 => [0, 0, 0]
const axisDelta = (i: number, d: number): Vec3 => {
  const v = zero()
  v[i] = d
  return v
}

/** The box around several boxes. */
export function boundsOf(boxes: Box[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i])
      max[i] = Math.max(max[i], b.max[i])
    }
  return { min, max }
}

export const sizeOf = (b: Box): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]

/** Moves that line every box's edge (or centre) up with the reference box on one axis. */
export function alignMoves(boxes: Box[], axis: Axis3, edge: Edge, ref: Box): Vec3[] {
  const target = at(ref, axis, edge)
  return boxes.map((b) => axisDelta(axis, target - at(b, axis, edge)))
}

/**
 * Spread boxes along an axis. With no gap: the first and last stay put and the space between neighbours is
 * made equal (needs 3+). With a gap: they line up from the first one with exactly that space between them.
 */
export function distributeMoves(boxes: Box[], axis: Axis3, gap?: number): Vec3[] {
  const out = boxes.map(zero)
  if (boxes.length < (gap === undefined ? 3 : 2)) return out
  const order = boxes.map((_, i) => i).sort((a, b) => mid(boxes[a], axis) - mid(boxes[b], axis))
  const len = (i: number) => boxes[i].max[axis] - boxes[i].min[axis]
  let space = gap ?? 0
  if (gap === undefined) {
    const first = boxes[order[0]]
    const last = boxes[order[order.length - 1]]
    const total = order.reduce((a, i) => a + len(i), 0)
    space = (last.max[axis] - first.min[axis] - total) / (order.length - 1)
  }
  let cursor = boxes[order[0]].max[axis]
  for (let k = 1; k < order.length; k++) {
    const i = order[k]
    out[i] = axisDelta(axis, cursor + space - boxes[i].min[axis])
    cursor += space + len(i)
  }
  return out
}

/** Footprints overlap when seen from above (a small inset so touching edges don't count). */
const overlapsXY = (a: Box, b: Box, inset = 0.01) =>
  a.min[0] < b.max[0] - inset && a.max[0] > b.min[0] + inset && a.min[1] < b.max[1] - inset && a.max[1] > b.min[1] + inset

/**
 * How far to move a box down (or up) so it rests on the highest thing under it, or on the floor.
 * Things already sunk a little into the box (up to 5 cm) still count as support.
 */
export function dropMove(box: Box, others: Box[], floor = 0): Vec3 {
  let rest = floor
  for (const o of others) if (overlapsXY(box, o) && o.max[2] <= box.min[2] + 0.05 && o.max[2] > rest) rest = o.max[2]
  return [0, 0, rest - box.min[2]]
}

/** Centre the box on top of the reference box. */
export function stackMove(box: Box, ref: Box): Vec3 {
  return [mid(ref, 0) - mid(box, 0), mid(ref, 1) - mid(box, 1), ref.max[2] - box.min[2]]
}

/** Space between two boxes on each axis (negative = they overlap by that much) and the centre distance. */
export function gapBetween(a: Box, b: Box): { gap: Vec3; centres: number } {
  const gap = [0, 1, 2].map((i) => Math.max(b.min[i] - a.max[i], a.min[i] - b.max[i])) as Vec3
  const d = [0, 1, 2].map((i) => mid(a, i) - mid(b, i))
  return { gap, centres: Math.hypot(...d) }
}

export interface Snap {
  move: Vec3
  /** For each snapped axis: the shared coordinate and the box it lined up with (null = the floor). */
  hits: { axis: Axis3; value: number; other: Box | null }[]
}

/**
 * Snap a box being dragged to nearby parts: its edges and centre catch the other boxes' edges and centres
 * (and the floor) when within `reach`. Only axes that are actually being dragged are snapped.
 */
export function snapToParts(box: Box, others: Box[], axes: [boolean, boolean, boolean], reach: number): Snap {
  const move = zero()
  const hits: Snap['hits'] = []
  const edges: Edge[] = ['min', 'mid', 'max']
  for (const i of [0, 1, 2] as Axis3[]) {
    if (!axes[i]) continue
    let best = reach
    let hit: Snap['hits'][number] | null = null
    const tryTo = (value: number, other: Box | null, from: number) => {
      const d = value - from
      if (Math.abs(d) < Math.abs(best) || (Math.abs(d) === Math.abs(best) && !hit)) {
        if (Math.abs(d) >= reach) return
        best = d
        hit = { axis: i, value, other }
      }
    }
    for (const o of others) {
      // Only bother with parts nearby on the other axes, so far-away things don't tug.
      let near = true
      for (const j of [0, 1, 2]) if (j !== i && (o.min[j] > box.max[j] + 4 * reach + 2 || o.max[j] < box.min[j] - 4 * reach - 2)) near = false
      if (!near) continue
      for (const e of edges) for (const f of edges) tryTo(at(o, i, f), o, at(box, i, e))
    }
    if (i === 2) tryTo(0, null, box.min[2])
    if (hit) {
      move[i] = best
      hits.push(hit)
    }
  }
  return { move, hits }
}

/** Scale factors that make a box the same size as the reference on the chosen axes. */
export function matchScale(box: Box, ref: Box, scl: Vec3, axes: [boolean, boolean, boolean]): Vec3 {
  const a = sizeOf(box)
  const b = sizeOf(ref)
  return scl.map((s, i) => (axes[i] && a[i] > 1e-6 && b[i] > 1e-6 ? +((s * b[i]) / a[i]).toFixed(4) : s)) as Vec3
}
