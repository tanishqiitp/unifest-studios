import type { GroundItem } from '../../types'

export const GROUND_LABELS: Record<GroundItem['kind'], string> = {
  crowd: 'Standing crowd',
  seating: 'Seating',
  vip: 'VIP / fan pit',
  foh: 'FOH',
  barricade: 'Barricade',
  entry: 'Entry',
  exit: 'Emergency exit',
  delay: 'Delay tower',
  camera: 'Camera riser',
  generator: 'Generator',
  greenroom: 'Green room',
  washroom: 'Washrooms',
  food: 'Food court',
  label: 'Label',
}
