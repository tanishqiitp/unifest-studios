import { nanoid } from 'nanoid'
import type { Deck, Fixture, GroundItem, Hoist, Project, Screen, Truss } from '../types'
import { suggestPitch } from './panels'
import { autoRig } from './calc'
import { autoLayout } from './seating'
import { applyTheme } from './themes'
import { autoDesign } from './sound'

export const EVENT_TYPES = ['College Fest', 'Open-Air Concert', 'DJ Night', 'Wedding Sangeet', 'Corporate Keynote', 'Fashion Runway', 'Stand-up Comedy', 'Seated Concert'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface WizardInput {
  name: string
  eventType: EventType
  audience: number
  venueW: number
  venueL: number
  outdoor: boolean
  // Optional detail a template can set (the wizard leaves these out and gets the automatic sizes).
  stage?: { w: number; d: number; h: number } // metres
  runway?: number // thrust from the stage front into the crowd, metres (ends in a small B-stage)
  zones?: { label: string; kind: 'vip' | 'crowd'; depth: number }[] // standing tiers, front to back; the last takes the rest
  theme?: string // theme pack id (lib/themes)
  sound?: boolean // design a full sound system (Sound tab) instead of the simple PA
}

export interface Template extends WizardInput {
  blurb: string
  region?: string // shown as a group heading, e.g. 'Jaipur'
  source?: string // what the layout is based on, shown under the template
}

export const TEMPLATES: Template[] = [
  { name: 'College Fest Main Stage', eventType: 'College Fest', audience: 3000, venueW: 60, venueL: 80, outdoor: true, blurb: 'Big outdoor end-stage, centre LED + side screens, roof truss.' },
  { name: 'Open-Air Concert', eventType: 'Open-Air Concert', audience: 8000, venueW: 90, venueL: 120, outdoor: true, blurb: 'Large festival stage with wide LED and flown PA.' },
  { name: 'EDM / DJ Night', eventType: 'DJ Night', audience: 1500, venueW: 40, venueL: 50, outdoor: true, blurb: 'DJ riser, curved LED, dense lighting rig.' },
  { name: 'Wedding Sangeet', eventType: 'Wedding Sangeet', audience: 400, venueW: 36, venueL: 50, outdoor: false, blurb: 'Seated lawn or banquet, performance stage, one LED.' },
  { name: 'Corporate Keynote', eventType: 'Corporate Keynote', audience: 600, venueW: 30, venueL: 45, outdoor: false, blurb: 'Theatre seating, low stage, 16:9 centre + IMAG screens.' },
  { name: 'Fashion Runway', eventType: 'Fashion Runway', audience: 300, venueW: 25, venueL: 40, outdoor: false, blurb: 'Catwalk thrust with seated sides and back LED.' },
  { name: 'Stand-up Comedy', eventType: 'Stand-up Comedy', audience: 250, venueW: 20, venueL: 28, outdoor: false, blurb: 'Intimate seated room, small stage and screen.' },
  // Real Jaipur venue; lawn size estimated from its listed 2,000-guest seated capacity (no published dimensions).
  { name: 'Wedding at Entertainment Paradise, Jaipur', region: 'Jaipur', eventType: 'Wedding Sangeet', audience: 1000, venueW: 55, venueL: 75, outdoor: true, blurb: 'East Lawn wedding for 1,000 guests: stage, LED, truss and round tables. Lawn size is an estimate.' },
  // Jaipur concert setups. Crowds, venues and dates come from published reports; no Jaipur show publishes its
  // stage, screen or PA specs, so those are typical sizes for Indian touring shows of that scale.
  {
    name: 'Arena Concert at JECC, Jaipur',
    region: 'Jaipur',
    eventType: 'Open-Air Concert',
    audience: 18000,
    venueW: 100,
    venueL: 180,
    outdoor: true,
    stage: { w: 24, d: 14, h: 2 },
    runway: 12,
    zones: [
      { label: 'Fan pit', kind: 'vip', depth: 15 },
      { label: 'Gold', kind: 'vip', depth: 35 },
      { label: 'General admission', kind: 'crowd', depth: 0 },
    ],
    theme: 'cyber',
    sound: true,
    blurb: 'Open ground at JECC Sitapura: 24 m roofed stage, runway to a B-stage, fan pit, Gold and GA tiers, delay towers.',
    source: 'Based on Arijit Singh (Jan 2025, 18,000+) and Diljit Dosanjh (Nov 2024) at JECC. Stage, screen and PA sizes are typical, not published.',
  },
  {
    name: 'Star Night, Sitapura, Jaipur',
    region: 'Jaipur',
    eventType: 'Open-Air Concert',
    audience: 8000,
    venueW: 80,
    venueL: 120,
    outdoor: true,
    stage: { w: 18, d: 12, h: 1.8 },
    runway: 8,
    zones: [
      { label: 'Fan pit', kind: 'vip', depth: 10 },
      { label: 'General admission', kind: 'crowd', depth: 0 },
    ],
    theme: 'royal',
    sound: true,
    blurb: 'Mid-size singer concert: 18 m stage with a short runway, fan pit and GA, one delay line.',
    source: 'Based on Sonu Nigam (Jan 2026, Sitapura) and Jubin Nautiyal (Feb 2026, JECC). Production sizes are typical, not published.',
  },
  {
    name: 'College Fest Night, Jaipur',
    region: 'Jaipur',
    eventType: 'College Fest',
    audience: 8000,
    venueW: 70,
    venueL: 100,
    outdoor: true,
    stage: { w: 16, d: 10, h: 1.5 },
    zones: [
      { label: 'Pit', kind: 'vip', depth: 8 },
      { label: 'Students', kind: 'crowd', depth: 0 },
    ],
    theme: 'cyber',
    sound: true,
    blurb: 'Campus open-air theatre for 8,000: 16 m roofed stage, pit and student area, stalls along the side.',
    source: 'Based on MNIT Blitzschlag (8,000+ in 2023; Shaan, Darshan Raval). Production sizes are typical, not published.',
  },
  {
    name: 'Holi Colour Party, Jaipur',
    region: 'Jaipur',
    eventType: 'DJ Night',
    audience: 3000,
    venueW: 70,
    venueL: 100,
    outdoor: true,
    stage: { w: 12, d: 8, h: 1.5 },
    zones: [
      { label: 'Rain dance and foam', kind: 'vip', depth: 18 },
      { label: 'Colour dance floor', kind: 'crowd', depth: 0 },
    ],
    theme: 'holi',
    sound: true,
    blurb: 'Polo-ground Holi party: DJ stage, rain-dance zone at the front, colour dance floor. Keep power away from the water.',
    source: 'Based on the yearly Holi parties at Jaipur polo clubs and garden lawns. Sizes are typical, not published.',
  },
  {
    name: 'Palace Lawn Sangeet, Jaipur',
    region: 'Jaipur',
    eventType: 'Wedding Sangeet',
    audience: 800,
    venueW: 45,
    venueL: 70,
    outdoor: true,
    stage: { w: 10, d: 6, h: 1.2 },
    theme: 'royal',
    sound: true,
    blurb: 'Heritage hotel lawn for 800: performance stage, one LED, round tables, compact line array.',
    source: 'Typical of palace-hotel wedding concerts in Jaipur. Lawn and stage sizes are estimates.',
  },
  {
    name: 'Fort Courtyard Concert, Jaipur',
    region: 'Jaipur',
    eventType: 'Seated Concert',
    audience: 500,
    venueW: 35,
    venueL: 50,
    outdoor: true,
    stage: { w: 8, d: 5, h: 0.8 },
    theme: 'royal',
    sound: true,
    blurb: 'Sunset gig in a fort courtyard: low stage, no roof, seated rows, small PA. Heritage rules: no pyro, light loads, early curfew.',
    source: 'Based on Jaigarh Heritage Festival (Dec 2024 and 2025) and Candlelight Open Air at Jawahar Kala Kendra (Mar 2025).',
  },
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
    tables: [],
    guests: [],
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
  const seated = ['Wedding Sangeet', 'Corporate Keynote', 'Fashion Runway', 'Stand-up Comedy', 'Seated Concert'].includes(inp.eventType)
  const a = inp.audience

  // Stage
  let SW = inp.stage?.w ?? (a < 300 ? 8 : a < 1000 ? 12 : a < 3000 ? 16 : a < 6000 ? 20 : 24)
  SW = Math.min(SW, inp.venueW - 8)
  SW = Math.max(4, Math.floor(SW / 2) * 2)
  const SD = inp.stage ? Math.max(3, Math.round(inp.stage.d)) : Math.max(4, Math.round((SW * 0.6) / 2) * 2)
  const SH = inp.stage?.h ?? (seated ? (inp.eventType === 'Corporate Keynote' ? 0.6 : 0.9) : a > 2000 ? 1.8 : 1.2)
  const sx = r2((inp.venueW - SW) / 2)
  const sy = 2
  const decks: Deck[] = []
  for (let c = 0; c < SW / 2; c++) for (let r = 0; r < SD; r++) decks.push({ id: id(), x: sx + c * 2, y: sy + r, w: 2, l: 1, h: SH })
  if (inp.eventType === 'Fashion Runway') {
    const rl = Math.min(16, inp.venueL - SD - 10)
    for (let r = 0; r < rl; r++) decks.push({ id: id(), x: sx + SW / 2 - 1, y: sy + SD + r, w: 2, l: 1, h: SH })
  }
  if (inp.runway && inp.eventType !== 'Fashion Runway') {
    const rl = Math.max(2, Math.min(Math.round(inp.runway), inp.venueL - sy - SD - 20))
    for (let r = 0; r < rl; r++) decks.push({ id: id(), x: sx + SW / 2 - 1, y: sy + SD + r, w: 2, l: 1, h: SH })
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) decks.push({ id: id(), x: sx + SW / 2 - 3 + c * 2, y: sy + SD + rl + r, w: 2, l: 1, h: SH })
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
  if (a >= 800 && !inp.sound) {
    for (const px of [sx - 3, sx + SW + 3]) {
      const t: Truss = { id: id(), type: 'box30', x1: px - 0.5, y1: front - 1, x2: px + 0.5, y2: front - 1, height: trussTop, legs: false }
      truss.push(t)
      hoists.push({ id: id(), x: px, y: front - 1, capacity: 1000 })
      for (let i = 0; i < (a > 3000 ? 10 : 6); i++) fixtures.push({ id: id(), kind: 'line-array', x: px, y: front - 1, z: trussTop - i * 0.35 })
    }
  }
  if (!inp.sound) for (let x = sx; x <= sx + SW; x += Math.max(2, SW / 4)) fixtures.push({ id: id(), kind: 'sub', x, y: front + 0.5, z: 0 })
  p.hoists = hoists
  p.fixtures = fixtures

  // Ground plan
  const g: GroundItem[] = []
  const add = (kind: GroundItem['kind'], x: number, y: number, w: number, h: number, label: string) => g.push({ id: id(), kind, x, y, w, h, rotation: 0, label })
  const crowdY = front + 3
  const crowdL = Math.max(4, inp.venueL - crowdY - 6)
  const crowdW = inp.venueW - 6
  const thrustEnd = inp.runway && inp.eventType !== 'Fashion Runway' ? Math.max(...decks.map((d) => d.y + d.l)) : front
  if (!seated && inp.zones?.length) {
    // Ticket tiers front to back (fan pit, gold, silver…); the crowd starts behind the runway's B-stage.
    add('barricade', sx - 2, front + 1.5, SW + 4, 0.6, 'Front barricade')
    let y = Math.max(crowdY, thrustEnd > front ? front + 3 : crowdY)
    const end = inp.venueL - 6
    inp.zones.forEach((z, i) => {
      const last = i === inp.zones!.length - 1
      const h = last ? end - y : Math.min(z.depth, end - y - 4 * (inp.zones!.length - 1 - i))
      if (h < 2) return
      add(z.kind, 3, y, crowdW, h, z.label)
      y += h + 1
    })
  } else if (!seated) {
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
  if (inp.stage && !seated) {
    // Detailed templates get the exit width the crowd needs (about 1.2 m per 250 people): gates down both sides.
    const gate = a > 10000 ? 8 : 5
    const need = (a * 1.2) / 250 - 8
    const n = Math.max(0, Math.ceil(need / gate))
    const slots: number[] = []
    for (let i = 0; i < Math.ceil(n / 2); i++) slots.push(crowdY + 6 + ((inp.venueL - crowdY - 14 - gate) * (i + 0.5)) / Math.ceil(n / 2))
    let made = 0
    const blocked = (x: number, y: number) => g.some((o) => o.x < x + 1.5 && o.x + o.w > x - 0.5 && o.y < y + gate + 1 && o.y + o.h > y - 1 && o.kind !== 'crowd' && o.kind !== 'vip')
    for (const y0 of slots)
      for (const left of [true, false]) {
        if (made >= n) break
        const x = left ? 0 : inp.venueW - 1
        // Slide down past washrooms, food or another gate.
        let y = y0
        while (blocked(x, y) && y < inp.venueL - gate - 2) y += 2
        if (blocked(x, y)) continue
        add('exit', x, r2(y), 1, gate, `Exit ${left ? 'left' : 'right'} ${Math.floor(made / 2) + 1}`)
        made++
      }
  }
  if (a >= 4000 && inp.venueL > 70) add('delay', inp.venueW / 2 - 1, front + 40, 2, 2, 'Delay tower')
  p.ground = g
  p.hoists = autoRig(p)
  // Dinner and conference formats start with real tables or rows in the seating zone.
  const style = inp.eventType === 'Wedding Sangeet' ? 'banquet' : inp.eventType === 'Corporate Keynote' || inp.eventType === 'Seated Concert' ? 'theatre' : inp.eventType === 'Stand-up Comedy' ? 'cabaret' : null
  const zone = g.find((x) => x.kind === 'seating')
  if (style && zone) {
    const vip = g.find((x) => x.kind === 'vip')
    const top = vip ? vip.y : zone.y
    const area = { x: zone.x, y: top, w: zone.w, l: zone.y + zone.h - top }
    p.tables = autoLayout({ style, guests: a, area, aisle: 2 }).tables
  }
  if (inp.theme) applyTheme(p, inp.theme, { screens: false })
  if (inp.sound) p.sound = autoDesign(p)
  return p
}
