import type { Panel } from '../types'

// Representative rental cabinets. Figures are typical published values; users can add exact models under "My panels".
export const PANELS: Panel[] = [
  { id: 'p26-500', brand: 'Generic', model: 'P2.6 Indoor 500×500', pitch: 2.6, w: 500, h: 500, pxW: 192, pxH: 192, weight: 7.5, maxW: 180, avgW: 60, viewAngle: 160, outdoor: false },
  { id: 'p29-500', brand: 'Generic', model: 'P2.9 Indoor 500×500', pitch: 2.9, w: 500, h: 500, pxW: 168, pxH: 168, weight: 7.5, maxW: 170, avgW: 57, viewAngle: 160, outdoor: false },
  { id: 'p29-1000', brand: 'Generic', model: 'P2.9 Indoor 500×1000', pitch: 2.9, w: 500, h: 1000, pxW: 168, pxH: 336, weight: 13, maxW: 340, avgW: 115, viewAngle: 160, outdoor: false },
  { id: 'p39-500', brand: 'Generic', model: 'P3.9 Rental 500×500', pitch: 3.9, w: 500, h: 500, pxW: 128, pxH: 128, weight: 7.5, maxW: 150, avgW: 50, viewAngle: 160, outdoor: false },
  { id: 'p39-1000', brand: 'Generic', model: 'P3.9 Rental 500×1000', pitch: 3.9, w: 500, h: 1000, pxW: 128, pxH: 256, weight: 13.5, maxW: 300, avgW: 100, viewAngle: 160, outdoor: false },
  { id: 'p39-o', brand: 'Generic', model: 'P3.9 Outdoor 500×1000', pitch: 3.9, w: 500, h: 1000, pxW: 128, pxH: 256, weight: 14, maxW: 500, avgW: 170, viewAngle: 140, outdoor: true },
  { id: 'p48-o', brand: 'Generic', model: 'P4.8 Outdoor 500×1000', pitch: 4.8, w: 500, h: 1000, pxW: 104, pxH: 208, weight: 14, maxW: 480, avgW: 160, viewAngle: 140, outdoor: true },
  { id: 'p6-o', brand: 'Generic', model: 'P6 Outdoor 960×960', pitch: 6, w: 960, h: 960, pxW: 160, pxH: 160, weight: 30, maxW: 800, avgW: 270, viewAngle: 140, outdoor: true },
  { id: 'p10-o', brand: 'Generic', model: 'P10 Outdoor 960×960', pitch: 10, w: 960, h: 960, pxW: 96, pxH: 96, weight: 32, maxW: 650, avgW: 220, viewAngle: 140, outdoor: true },
]

export function findPanel(id: string, custom: Panel[] = []): Panel {
  return custom.find((p) => p.id === id) ?? PANELS.find((p) => p.id === id) ?? PANELS[3]
}

export function allPanels(custom: Panel[]): Panel[] {
  return [...PANELS, ...custom]
}

// Rule of thumb used by rental companies: closest comfortable viewing distance in metres ≈ pitch in mm.
export function suggestPitch(nearestViewerM: number, outdoor: boolean): Panel {
  const pool = PANELS.filter((p) => p.outdoor === outdoor || (!outdoor && p.pitch < 4))
  const fit = pool.filter((p) => p.pitch <= nearestViewerM).sort((a, b) => b.pitch - a.pitch)
  return fit[0] ?? pool.sort((a, b) => a.pitch - b.pitch)[0]
}
