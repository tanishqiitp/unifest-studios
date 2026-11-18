// Openings cut through boxes and extruded shapes: windows, portholes, arched doors, lattice.
// Laid out on a grid in the shape's own 0..1 outline space. An opening that would cross the outline is
// left out, so the shape always stays solid and buildable.
import type { Cutouts } from '../types'

type P = [number, number]

export function insidePoly(pt: P, poly: P[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi) inside = !inside
  }
  return inside
}

function opening(shape: Cutouts['shape'], cx: number, cy: number, hw: number, hh: number): P[] {
  if (shape === 'circle') return Array.from({ length: 24 }, (_, i) => [cx + Math.cos((i / 24) * Math.PI * 2) * hw, cy + Math.sin((i / 24) * Math.PI * 2) * hh])
  if (shape === 'diamond') return [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]]
  if (shape === 'arch') {
    // Straight sides to 60% of the height, then a round top.
    const spring = cy - hh + hh * 2 * 0.6
    const top = Array.from({ length: 13 }, (_, i) => {
      const a = (i / 12) * Math.PI
      return [cx + Math.cos(a) * hw, spring + Math.sin(a) * (cy + hh - spring)] as P
    })
    return [[cx - hw, cy - hh], [cx + hw, cy - hh], ...top]
  }
  return [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]]
}

/**
 * Opening outlines in 0..1 space for the given outline. `aspect` = width / height of the part, so circles
 * stay round and squares stay square on wide or tall panels.
 */
export function cutoutPaths(c: Cutouts, outline: P[], aspect: number): P[][] {
  const cols = Math.max(1, Math.min(30, Math.round(c.cols)))
  const rows = Math.max(1, Math.min(30, Math.round(c.rows)))
  const size = Math.max(0.1, Math.min(0.95, c.size))
  const xs = outline.map((p) => p[0])
  const ys = outline.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  // Keep a frame around the openings.
  const mx = (x1 - x0) * 0.08
  const my = (y1 - y0) * 0.08
  const cw = (x1 - x0 - mx * 2) / cols
  const ch = (y1 - y0 - my * 2) / rows
  // Half sizes in 0..1 space, corrected for the part's proportions.
  let hw = (cw * size) / 2
  let hh = (ch * size) / 2
  if (c.shape === 'circle' || c.shape === 'diamond') {
    const r = Math.min(hw * aspect, hh)
    hw = r / aspect
    hh = r
  }
  const out: P[][] = []
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const cx = x0 + mx + cw * (i + 0.5)
      const cy = y0 + my + ch * (j + 0.5)
      const path = opening(c.shape, cx, cy, hw, hh)
      if (path.every((p) => insidePoly(p, outline))) out.push(path)
    }
  return out
}
