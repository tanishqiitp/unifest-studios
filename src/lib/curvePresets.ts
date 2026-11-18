// Ready-made curve shapes (0..1 points). Kept free of three.js so the parts library stays light.
export const CURVE_PRESETS: Record<string, [number, number][]> = {
  Arch: [[0, 0], [0.12, 0.62], [0.5, 1], [0.88, 0.62], [1, 0]],
  Wave: [[0, 0.5], [0.2, 0.85], [0.4, 0.2], [0.6, 0.85], [0.8, 0.2], [1, 0.5]],
  'S-curve': [[0, 0.1], [0.3, 0.1], [0.5, 0.5], [0.7, 0.9], [1, 0.9]],
  Spiral: Array.from({ length: 14 }, (_, i) => {
    const a = i * 0.9
    const r = 0.08 + i * 0.03
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as [number, number]
  }),
  'Half circle': Array.from({ length: 9 }, (_, i) => [0.5 + Math.cos(Math.PI - (i * Math.PI) / 8) * 0.5, Math.sin(Math.PI - (i * Math.PI) / 8)] as [number, number]),
}

