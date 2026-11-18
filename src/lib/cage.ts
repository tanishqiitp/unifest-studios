// Cage deform: a 3×3 grid of handles in the front view (across × up) and in the side view (depth × up).
// Moving a handle bends the whole shape smoothly (quadratic free-form deformation), so towers can lean,
// bulge, flare or S-curve without editing single points. Offsets are fractions of the part's size.
export type CageGrid = number[] // 9 handles × [dx, dy], row by row from the bottom-left

export const EMPTY_CAGE: CageGrid = Array(18).fill(0)
export const CAGE_PRESETS: Record<string, { front?: CageGrid; side?: CageGrid }> = {
  Bulge: { front: [0, 0, 0, 0, 0, 0, -0.25, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0], side: [0, 0, 0, 0, 0, 0, -0.25, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0] },
  Pinch: { front: [0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, -0.3, 0, 0, 0, 0, 0, 0, 0], side: [0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, -0.3, 0, 0, 0, 0, 0, 0, 0] },
  Flare: { front: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.35, 0, 0, 0, 0.35, 0], side: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.35, 0, 0, 0, 0.35, 0] },
  Lean: { front: [0, 0, 0, 0, 0, 0, 0.15, 0, 0.15, 0, 0.15, 0, 0.4, 0, 0.4, 0, 0.4, 0] },
  'S-curve': { front: [0, 0, 0, 0, 0, 0, 0.35, 0, 0.35, 0, 0.35, 0, -0.1, 0, -0.1, 0, -0.1, 0] },
  Wave: { front: [0, 0, 0, 0.2, 0, 0, 0, 0, 0, -0.2, 0, 0, 0, 0, 0, 0.2, 0, 0] },
}

const B = (t: number) => [(1 - t) * (1 - t), 2 * t * (1 - t), t * t]

/** Smooth offset at (u, v) in 0..1 from a cage grid. */
export function cageOffset(grid: CageGrid, u: number, v: number): [number, number] {
  const bu = B(u)
  const bv = B(v)
  let dx = 0
  let dy = 0
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const w = bu[i] * bv[j]
      dx += grid[(j * 3 + i) * 2] * w
      dy += grid[(j * 3 + i) * 2 + 1] * w
    }
  return [dx, dy]
}

export const hasCage = (c?: { front?: CageGrid; side?: CageGrid }) => !!c && [c.front, c.side].some((g) => g?.some((x) => Math.abs(x) > 1e-4))

/**
 * Bend positions (x across, y up, z depth) inside the box [min, max] by the front and side cages.
 * `size` = the part's width, height and depth in metres.
 */
export function applyCage(pos: Float32Array, min: [number, number, number], max: [number, number, number], size: [number, number, number], cage: { front?: CageGrid; side?: CageGrid }) {
  const span = [0, 1, 2].map((k) => Math.max(1e-6, max[k] - min[k]))
  for (let i = 0; i < pos.length; i += 3) {
    const u = (pos[i] - min[0]) / span[0]
    const v = (pos[i + 1] - min[1]) / span[1]
    const w = (pos[i + 2] - min[2]) / span[2]
    if (cage.front) {
      const [dx, dy] = cageOffset(cage.front, u, v)
      pos[i] += dx * size[0]
      pos[i + 1] += dy * size[1]
    }
    if (cage.side) {
      const [dz, dy] = cageOffset(cage.side, w, v)
      pos[i + 2] += dz * size[2]
      pos[i + 1] += dy * size[1]
    }
  }
}
