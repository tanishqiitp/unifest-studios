import { nanoid } from 'nanoid'
import type { Decor, DecorKind, Project } from '../types'

export type DecorGroup = 'Wedding & decor' | 'Special effects' | 'Sponsors & branding' | 'Imported'

// Default size (w × d × h, metres), colour and a short note for every placeable decor item.
export const DECOR: Record<DecorKind, { name: string; group: DecorGroup; size: [number, number, number]; color: string; tip: string; effect?: boolean; artwork?: boolean }> = {
  mandap: { name: 'Mandap', group: 'Wedding & decor', size: [5, 5, 4], color: '#f4e4c1', tip: 'Four-pillar wedding canopy.' },
  'floral-arch': { name: 'Floral arch', group: 'Wedding & decor', size: [3, 0.6, 3], color: '#f2c6d0', tip: 'Flower arch for entries, aisles or the stage.' },
  'flower-wall': { name: 'Flower wall', group: 'Wedding & decor', size: [4, 0.3, 3], color: '#e8a9b8', tip: 'Backdrop wall of flowers; good for photos.' },
  drape: { name: 'Drapes', group: 'Wedding & decor', size: [6, 0.2, 5], color: '#f5f0e6', tip: 'Fabric draping: stage wings, ceilings or walls.' },
  pillar: { name: 'Decor pillar', group: 'Wedding & decor', size: [0.6, 0.6, 3], color: '#e9dcc0', tip: 'Decorative column with florals.' },
  chandelier: { name: 'Chandelier', group: 'Wedding & decor', size: [1.4, 1.4, 1.2], color: '#ffe9b0', tip: 'Hanging chandelier. Set its height (base) to where it hangs.' },
  centrepiece: { name: 'Centrepiece', group: 'Wedding & decor', size: [0.6, 0.6, 0.9], color: '#f2c6d0', tip: 'Tall table centrepiece.' },
  'photo-booth': { name: 'Photo booth', group: 'Wedding & decor', size: [3, 2, 2.6], color: '#d9d9d9', tip: 'Selfie or photo-booth set.' },
  'entrance-gate': { name: 'Entrance gate', group: 'Wedding & decor', size: [6, 1, 5], color: '#f0d9a8', tip: 'Themed welcome gate.' },
  'cold-pyro': { name: 'Cold pyro (sparkular)', group: 'Special effects', size: [0.4, 0.4, 3.5], color: '#ffd27a', tip: 'Cold-spark fountain. Height = spark height. Keep 1.5 m clear around it.', effect: true },
  smoke: { name: 'Smoke / fog gun', group: 'Special effects', size: [0.6, 0.6, 2.5], color: '#e6e6e6', tip: 'Low smoke or fog. Check venue smoke detectors.', effect: true },
  'co2-jet': { name: 'CO₂ jet', group: 'Special effects', size: [0.4, 0.4, 6], color: '#ffffff', tip: 'Vertical CO₂ cryo blast. Height = plume height.', effect: true },
  confetti: { name: 'Confetti cannon', group: 'Special effects', size: [0.5, 0.5, 10], color: '#ffffff', tip: 'Confetti or streamer blast. Single use.', effect: true },
  flame: { name: 'Flame projector', group: 'Special effects', size: [0.5, 0.5, 4], color: '#ff7a1a', tip: 'Live flame. Outdoor only, licensed operator, 5 m+ from the audience.', effect: true },
  firework: { name: 'Fireworks / gerb', group: 'Special effects', size: [0.4, 0.4, 8], color: '#ffcf5a', tip: 'Stage gerb or aerial firework. Needs a PESO-licensed operator.', effect: true },
  bubble: { name: 'Bubble machine', group: 'Special effects', size: [0.5, 0.5, 2], color: '#cfe8ff', tip: 'Bubbles over the stage or dance floor.', effect: true },
  banner: { name: 'Sponsor banner', group: 'Sponsors & branding', size: [4, 0.05, 2], color: '#ffffff', tip: 'Flex banner on a frame. Upload the sponsor artwork.', artwork: true },
  standee: { name: 'Standee', group: 'Sponsors & branding', size: [0.9, 0.4, 2], color: '#ffffff', tip: 'Roll-up standee (3 × 6 ft).', artwork: true },
  flag: { name: 'Flag / teardrop', group: 'Sponsors & branding', size: [0.8, 0.05, 3.5], color: '#ffffff', tip: 'Teardrop or feather flag.', artwork: true },
  backdrop: { name: 'Printed backdrop', group: 'Sponsors & branding', size: [8, 0.1, 4], color: '#ffffff', tip: 'Printed stage or media-wall backdrop.', artwork: true },
  model: { name: 'Imported 3D model', group: 'Imported', size: [4, 4, 3], color: '#ffffff', tip: 'Your own Blender or glTF model.' },
}

export const DECOR_GROUPS: DecorGroup[] = ['Wedding & decor', 'Special effects', 'Sponsors & branding']

export function newDecor(kind: DecorKind, x: number, y: number, extra: Partial<Decor> = {}): Decor {
  const d = DECOR[kind]
  const [w, dd, h] = d.size
  return { id: nanoid(8), kind, x, y, z: kind === 'chandelier' ? 5 : 0, w, d: dd, h, rotation: 0, color: d.color, label: d.name, ...(d.effect ? { intensity: 0.8, fire: true } : {}), ...extra }
}

// Ready-made arrangements around the stage.
export function decorPreset(p: Project, kind: 'pyro-front' | 'smoke-wings' | 'co2-row' | 'wedding-stage' | 'sponsor-wall' | 'fireworks-finale'): Decor[] {
  const xs = p.decks.flatMap((d) => [d.x, d.x + d.w])
  const ys = p.decks.flatMap((d) => [d.y, d.y + d.l])
  const sb = xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), l: Math.max(...ys) - Math.min(...ys), h: Math.max(...p.decks.map((d) => d.h)) } : { x: p.venue.w / 2 - 6, y: 2, w: 12, l: 8, h: 1.2 }
  const front = sb.y + sb.l
  const out: Decor[] = []
  if (kind === 'pyro-front') for (let i = 0; i < 4; i++) out.push(newDecor('cold-pyro', sb.x + 1 + ((sb.w - 2) * i) / 3, front - 0.4, { z: sb.h }))
  if (kind === 'smoke-wings') out.push(newDecor('smoke', sb.x - 0.8, sb.y + sb.l / 2), newDecor('smoke', sb.x + sb.w + 0.8, sb.y + sb.l / 2))
  if (kind === 'co2-row') for (let i = 0; i < 6; i++) out.push(newDecor('co2-jet', sb.x + 0.5 + ((sb.w - 1) * i) / 5, sb.y + 0.8, { z: sb.h }))
  if (kind === 'fireworks-finale') for (let i = 0; i < 5; i++) out.push(newDecor('firework', sb.x - 4 + ((sb.w + 8) * i) / 4, Math.max(0.5, sb.y - 3)))
  if (kind === 'wedding-stage') {
    out.push(newDecor('flower-wall', sb.x + sb.w / 2, sb.y + 0.4, { z: sb.h, w: Math.min(10, sb.w * 0.7) }))
    out.push(newDecor('drape', sb.x + 0.6, sb.y + sb.l / 2, { z: 0, rotation: 90, w: sb.l, h: 5 }), newDecor('drape', sb.x + sb.w - 0.6, sb.y + sb.l / 2, { z: 0, rotation: 90, w: sb.l, h: 5 }))
    out.push(newDecor('pillar', sb.x - 0.5, front + 0.5), newDecor('pillar', sb.x + sb.w + 0.5, front + 0.5))
    out.push(newDecor('floral-arch', p.venue.w / 2, Math.min(p.venue.l - 1, front + 12)))
  }
  if (kind === 'sponsor-wall') {
    const n = 4
    for (let i = 0; i < n; i++) out.push(newDecor('standee', sb.x - 3 + ((sb.w + 6) * i) / (n - 1), front + 3, { rotation: 0 }))
    out.push(newDecor('banner', sb.x - 2.5, front - 1, { z: 0, rotation: 90 }), newDecor('banner', sb.x + sb.w + 2.5, front - 1, { z: 0, rotation: 90 }))
  }
  return out
}
