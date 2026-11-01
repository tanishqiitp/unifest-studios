import { nanoid } from 'nanoid'
import type { Deck, Fixture, GroundItem, Hoist, Project, Screen, Truss } from '../types'
import { suggestPitch } from './panels'
import { autoRig } from './calc'

export const EVENT_TYPES = ['College Fest', 'Open-Air Concert', 'DJ Night', 'Wedding Sangeet', 'Corporate Keynote', 'Fashion Runway', 'Stand-up Comedy'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface WizardInput {
  name: string
  eventType: EventType
  audience: number
  venueW: number
  venueL: number
  outdoor: boolean
}

export const TEMPLATES: (WizardInput & { blurb: string })[] = [
  { name: 'College Fest Main Stage', eventType: 'College Fest', audience: 3000, venueW: 60, venueL: 80, outdoor: true, blurb: 'Big outdoor end-stage, centre LED + side screens, roof truss.' },
  { name: 'Open-Air Concert', eventType: 'Open-Air Concert', audience: 8000, venueW: 90, venueL: 120, outdoor: true, blurb: 'Large festival stage with wide LED and flown PA.' },
  { name: 'EDM / DJ Night', eventType: 'DJ Night', audience: 1500, venueW: 40, venueL: 50, outdoor: true, blurb: 'DJ riser, curved LED, dense lighting rig.' },
  { name: 'Wedding Sangeet', eventType: 'Wedding Sangeet', audience: 400, venueW: 30, venueL: 40, outdoor: false, blurb: 'Seated lawn or banquet, performance stage, one LED.' },
  { name: 'Corporate Keynote', eventType: 'Corporate Keynote', audience: 600, venueW: 30, venueL: 45, outdoor: false, blurb: 'Theatre seating, low stage, 16:9 centre + IMAG screens.' },
  { name: 'Fashion Runway', eventType: 'Fashion Runway', audience: 300, venueW: 25, venueL: 40, outdoor: false, blurb: 'Catwalk thrust with seated sides and back LED.' },
  { name: 'Stand-up Comedy', eventType: 'Stand-up Comedy', audience: 250, venueW: 20, venueL: 28, outdoor: false, blurb: 'Intimate seated room, small stage and screen.' },
]

const id = () => nanoid(8)
const r2 = (n: number) => Math.round(n * 2) / 2

export function emptyProject(name = 'Untitled event'): Project {
  return {
    version: 1,
    name,
    eventType: 'College Fest',
    units: 'm',
    venue: { w: 40, l: 50 },
    audience: 1000,
    screens: [],
    ground: [],
    decks: [],
    truss: [],
    hoists: [],
    fixtures: [],
    customPanels: [],
    processor: { name: 'Generic 1G sending card', portPx: 655360 },
    circuitAmps: 16,
    updatedAt: Date.now(),
  }
}

export function generateProject(inp: WizardInput): Project {
  const p = emptyProject(inp.name)
  p.eventType = inp.eventType
  p.audience = inp.audience
  p.venue = { w: inp.venueW, l: inp.venueL }
  const seated = ['Wedding Sangeet', 'Corporate Keynote', 'Fashion Runway', 'Stand-up Comedy'].includes(inp.eventType)
  const a = inp.audience

  // Stage
  let SW = a < 300 ? 8 : a < 1000 ? 12 : a < 3000 ? 16 : a < 6000 ? 20 : 24
  SW = Math.min(SW, inp.venueW - 8)
  SW = Math.max(4, Math.floor(SW / 2) * 2)
  const SD = Math.max(4, Math.round((SW * 0.6) / 2) * 2)
  const SH = seated ? (inp.eventType === 'Corporate Keynote' ? 0.6 : 0.9) : a > 2000 ? 1.8 : 1.2
  const sx = r2((inp.venueW - SW) / 2)
  const sy = 2
  const decks: Deck[] = []
  for (let c = 0; c < SW / 2; c++) for (let r = 0; r < SD; r++) decks.push({ id: id(), x: sx + c * 2, y: sy + r, w: 2, l: 1, h: SH })
  if (inp.eventType === 'Fashion Runway') {
    const rl = Math.min(16, inp.venueL - SD - 10)
    for (let r = 0; r < rl; r++) decks.push({ id: id(), x: sx + SW / 2 - 1, y: sy + SD + r, w: 2, l: 1, h: SH })
  }
  if (inp.eventType === 'DJ Night') decks.push({ id: id(), x: sx + SW / 2 - 2, y: sy + 1, w: 4, l: 2, h: SH + 0.6 })
  p.decks = decks
  const front = sy + SD

  // Screens
  const throwDist = inp.venueL - front
  const nearest = seated ? 4 : 3
  const panel = suggestPitch(nearest + (a > 3000 ? 3 : 0), inp.outdoor)
  const pw = panel.w / 1000
  const ph = panel.h / 1000
  const targetH = Math.min(9, Math.max(2, throwDist / 6))
  const rows = Math.max(2, Math.round(targetH / ph))
  const maxW = SW - 1
  const cols = Math.max(4, Math.min(Math.floor(maxW / pw), Math.round((rows * ph * 16) / 9 / pw)))
  const mainW = cols * pw
  const main: Screen = {
    id: id(),
    name: 'CENTER',
    panelId: panel.id,
    cols,
    rows,
    virtual: [],
    x: Math.round((inp.venueW / 2 - mainW / 2) * 1000) / 1000,
    y: sy + 0.6,
    z: SH + 0.5,
    rotation: 0,
    shape: inp.eventType === 'DJ Night' ? 'concave' : 'flat',
    curveDeg: inp.eventType === 'DJ Night' ? 3 : 0,
    mount: 'flown',
    color: '#d4d4d4',
  }
  p.screens = [main]
  if (a >= 600 && !['Stand-up Comedy', 'Fashion Runway'].includes(inp.eventType)) {
    const sCols = Math.max(2, Math.round((rows * ph * 0.6) / pw))
    const sRows = rows
    const left: Screen = { ...main, id: id(), name: 'LEFT', cols: sCols, rows: sRows, shape: 'flat', curveDeg: 0, x: sx - 1.5 - sCols * pw, rotation: 0, virtual: [] }
    const right: Screen = { ...left, id: id(), name: 'RIGHT', mirrorOf: left.id, x: sx + SW + 1.5 }
    p.screens.push(left, right)
  }

  // Truss: upstage screen truss (+ roof sides and front lighting truss for bigger shows)
  const truss: Truss[] = []
  const trussTop = main.z + rows * ph + 0.8
  const tx1 = Math.min(sx, ...p.screens.map((s) => s.x)) - 1
  const tx2 = Math.max(sx + SW, ...p.screens.map((s) => s.x + s.cols * pw)) + 1
  truss.push({ id: id(), type: a > 2000 ? 'box40' : 'box30', x1: tx1, y1: sy + 0.6, x2: tx2, y2: sy + 0.6, height: trussTop, legs: true })
  const fixtures: Fixture[] = []
  if (a >= 500 || inp.eventType === 'DJ Night') {
    const ly = front - 0.5
    truss.push({ id: id(), type: 'box30', x1: sx - 1, y1: ly, x2: sx + SW + 1, y2: ly, height: trussTop, legs: true })
    for (let x = sx + 1; x < sx + SW; x += 2) fixtures.push({ id: id(), kind: 'moving-head', x, y: ly, z: trussTop })
    if (a >= 1500) {
      truss.push({ id: id(), type: 'box30', x1: sx - 1, y1: sy + 0.6, x2: sx - 1, y2: ly, height: trussTop, legs: false })
      truss.push({ id: id(), type: 'box30', x1: sx + SW + 1, y1: sy + 0.6, x2: sx + SW + 1, y2: ly, height: trussTop, legs: false })
    }
  }
  for (let x = sx + 1; x < sx + SW; x += 3) fixtures.push({ id: id(), kind: 'par', x, y: front - 0.2, z: SH })
  p.truss = truss

  // PA: flown hangs on short flybars with a hoist each, subs on the ground
  const hoists: Hoist[] = []
  if (a >= 800) {
    for (const px of [sx - 3, sx + SW + 3]) {
      const t: Truss = { id: id(), type: 'box30', x1: px - 0.5, y1: front - 1, x2: px + 0.5, y2: front - 1, height: trussTop, legs: false }
      truss.push(t)
      hoists.push({ id: id(), x: px, y: front - 1, capacity: 1000 })
      for (let i = 0; i < (a > 3000 ? 10 : 6); i++) fixtures.push({ id: id(), kind: 'line-array', x: px, y: front - 1, z: trussTop - i * 0.35 })
    }
  }
  for (let x = sx; x <= sx + SW; x += Math.max(2, SW / 4)) fixtures.push({ id: id(), kind: 'sub', x, y: front + 0.5, z: 0 })
  p.hoists = hoists
  p.fixtures = fixtures

  // Ground plan
  const g: GroundItem[] = []
  const add = (kind: GroundItem['kind'], x: number, y: number, w: number, h: number, label: string) => g.push({ id: id(), kind, x, y, w, h, rotation: 0, label })
  const crowdY = front + 3
  const crowdL = Math.max(4, inp.venueL - crowdY - 6)
  const crowdW = inp.venueW - 6
  if (!seated) {
    add('barricade', sx - 2, front + 1.5, SW + 4, 0.6, 'Front barricade')
    if (a >= 2000) add('vip', 3, crowdY, crowdW, Math.min(10, crowdL * 0.15), 'Fan pit')
    const vipH = a >= 2000 ? Math.min(10, crowdL * 0.15) + 1 : 0
    add('crowd', 3, crowdY + vipH, crowdW, crowdL - vipH, 'Standing crowd')
  } else if (inp.eventType === 'Fashion Runway') {
    add('seating', 2, front, sx + SW / 2 - 1 - 3, crowdL, 'Seating left')
    add('seating', sx + SW / 2 + 2, front, inp.venueW - (sx + SW / 2 + 2) - 2, crowdL, 'Seating right')
  } else {
    add('vip', 3, crowdY, crowdW, 4, 'VIP rows')
    add('seating', 3, crowdY + 5, crowdW, crowdL - 5, 'Seating')
  }
  const fohY = Math.min(front + 25, inp.venueL - 10)
  add('foh', inp.venueW / 2 - 2.5, fohY, 5, 4, 'FOH')
  add('entry', inp.venueW / 2 - 3, inp.venueL - 1, 6, 1, 'Main entry')
  add('exit', 0, inp.venueL - 6, 1, 4, 'Exit')
  add('exit', inp.venueW - 1, inp.venueL - 6, 1, 4, 'Exit')
  add('greenroom', Math.max(0.5, sx - 9), 0.5, 6, 4, 'Green room')
  add('generator', Math.min(inp.venueW - 6.5, sx + SW + 4), 0.5, 5, 3, 'Generator')
  if (a >= 500) {
    add('washroom', 0.5, inp.venueL * 0.55, 4, 6, 'Washrooms')
    add('food', inp.venueW - 6.5, inp.venueL * 0.55, 6, 8, 'Food court')
  }
  if (a >= 4000 && inp.venueL > 70) add('delay', inp.venueW / 2 - 1, front + 40, 2, 2, 'Delay tower')
  p.ground = g
  p.hoists = autoRig(p)
  return p
}
