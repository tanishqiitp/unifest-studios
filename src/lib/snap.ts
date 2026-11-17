// Smart snapping and alignment, shared by every CAD view.
// Pure functions: rectangles are in a view's canvas metres, boxes in venue metres (x across, y depth, z up).
import type { Box3 } from './cad'

export interface R {
  x: number
  y: number
  w: number
  h: number
}
// A dashed line shown while dragging: vertical lines sit at x = at, horizontal ones at y = at.
export interface Guide {
  vertical: boolean
  at: number
  from: number
  to: number
}

const STEPS = [0, 0.5, 1] as const

// Best match of the moving span's start, centre or end against target positions. Returns the shift.
function matchAxis(lo: number, size: number, targets: number[], tol: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null
  for (const t of targets)
    for (const k of STEPS) {
      const d = t - (lo + size * k)
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, at: t }
    }
  return best
}

/**
 * Snap a dragged rectangle to the edges and centres of other rectangles (and to extra lines such as the
 * ground), falling back to a grid. `grid` 0 turns the grid off. Guides show what it snapped to.
 */
export function snapRect(r: R, others: R[], tol: number, opts: { hLines?: number[]; vLines?: number[]; grid?: number } = {}): { x: number; y: number; guides: Guide[] } {
  const grid = opts.grid ?? 0.25
  const xs = [...(opts.vLines ?? []), ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
  const ys = [...(opts.hLines ?? []), ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  const mx = matchAxis(r.x, r.w, xs, tol)
  const my = matchAxis(r.y, r.h, ys, tol)
  const roundC = (lo: number, size: number) => (grid ? Math.round((lo + size / 2) / grid) * grid - size / 2 : Math.round(lo * 100) / 100)
  const x = mx ? r.x + mx.shift : roundC(r.x, r.w)
  const y = my ? r.y + my.shift : roundC(r.y, r.h)
  const guides: Guide[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  if (mx) {
    // Span the guide over every item lined up on it.
    const hits = others.filter((o) => [o.x, o.x + o.w / 2, o.x + o.w].some((v) => near(v, mx.at)))
    const ys0 = [y, y + r.h, ...hits.flatMap((o) => [o.y, o.y + o.h])]
    guides.push({ vertical: true, at: mx.at, from: Math.min(...ys0) - 0.5, to: Math.max(...ys0) + 0.5 })
  }
  if (my) {
    const hits = others.filter((o) => [o.y, o.y + o.h / 2, o.y + o.h].some((v) => near(v, my.at)))
    const xs0 = [x, x + r.w, ...hits.flatMap((o) => [o.x, o.x + o.w])]
    guides.push({ vertical: false, at: my.at, from: Math.min(...xs0) - 0.5, to: Math.max(...xs0) + 0.5 })
  }
  return { x, y, guides }
}

/** Snap a 3D box to other boxes on every axis (edges and centres; the floor for height). */
export function snapBox(b: Box3, others: Box3[], tol: number): Box3 {
  const axis = (lo: number, hi: number, targets: number[]) => matchAxis(lo, hi - lo, targets, tol)?.shift ?? 0
  const dx = axis(b.x0, b.x1, others.flatMap((o) => [o.x0, (o.x0 + o.x1) / 2, o.x1]))
  const dy = axis(b.y0, b.y1, others.flatMap((o) => [o.y0, (o.y0 + o.y1) / 2, o.y1]))
  const dz = axis(b.z0, b.z1, [0, ...others.flatMap((o) => [o.z0, o.z1])])
  return { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, z0: b.z0 + dz, z1: b.z1 + dz }
}

export type AlignOp =
  | 'x-min' // left edges (across)
  | 'x-mid'
  | 'x-max'
  | 'y-min' // back edges (depth)
  | 'y-mid'
  | 'y-max'
  | 'z-min' // same base height (level)
  | 'z-max' // same top height
  | 'stack' // sit on top of the reference
  | 'floor' // down to the ground
  | 'dist-x' // equal gaps across
  | 'dist-y' // equal gaps in depth

const move = (b: Box3, dx: number, dy: number, dz: number): Box3 => ({ x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, z0: b.z0 + dz, z1: b.z1 + dz })

/**
 * Align boxes to a reference box (the first one picked, or e.g. the stage). Returns the new boxes in the same
 * order as `boxes`; only position changes, never size.
 */
export function alignBoxes(ref: Box3, boxes: Box3[], op: AlignOp): Box3[] {
  if (op === 'dist-x' || op === 'dist-y') return distribute(boxes, op === 'dist-x' ? 'x' : 'y')
  return boxes.map((b) => {
    switch (op) {
      case 'x-min':
        return move(b, ref.x0 - b.x0, 0, 0)
      case 'x-mid':
        return move(b, (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2, 0, 0)
      case 'x-max':
        return move(b, ref.x1 - b.x1, 0, 0)
      case 'y-min':
        return move(b, 0, ref.y0 - b.y0, 0)
      case 'y-mid':
        return move(b, 0, (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2, 0)
      case 'y-max':
        return move(b, 0, ref.y1 - b.y1, 0)
      case 'z-min':
        return move(b, 0, 0, ref.z0 - b.z0)
      case 'z-max':
        return move(b, 0, 0, ref.z1 - b.z1)
      case 'stack':
        return move(b, 0, 0, ref.z1 - b.z0)
      case 'floor':
        return move(b, 0, 0, -b.z0)
    }
    return b
  })
}

// Keep the outermost two where they are and give every gap between neighbours the same size.
function distribute(boxes: Box3[], ax: 'x' | 'y'): Box3[] {
  if (boxes.length < 3) return boxes
  const lo = (b: Box3) => (ax === 'x' ? b.x0 : b.y0)
  const hi = (b: Box3) => (ax === 'x' ? b.x1 : b.y1)
  const order = boxes.map((_, i) => i).sort((a, c) => lo(boxes[a]) + hi(boxes[a]) - lo(boxes[c]) - hi(boxes[c]))
  const first = boxes[order[0]]
  const last = boxes[order[order.length - 1]]
  const total = order.reduce((s, i) => s + hi(boxes[i]) - lo(boxes[i]), 0)
  const gap = (hi(last) - lo(first) - total) / (order.length - 1)
  const out = [...boxes]
  let cur = lo(first)
  for (const i of order) {
    const b = boxes[i]
    const d = cur - lo(b)
    out[i] = ax === 'x' ? move(b, d, 0, 0) : move(b, 0, d, 0)
    cur += hi(b) - lo(b) + gap
  }
  return out
}
