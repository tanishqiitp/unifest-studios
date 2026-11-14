import { nanoid } from 'nanoid'
import type { Deck, Project } from '../types'
import { generateProject, type EventType, type WizardInput } from './templates'

// Rule-based (no AI, no network) reader for a one-line event brief, English or Hinglish.

export interface BriefExtras {
  stageW?: number
  stageL?: number
  tables?: 'round' | 'banquet' | 'theatre' | 'cocktail'
  screens?: number
  truss?: boolean
  decor?: string[]
}

const FT = 0.3048
const r1 = (n: number) => Math.round(n * 10) / 10
const NUM = '(\\d+(?:\\.\\d+)?)'
const UNIT = "(m|meters?|metres?|ft|feet|')?"
const SEP = '\\s*(?:x|×|by)\\s*'

// Keyword -> event type, first match wins (most specific first).
const TYPE_RULES: [RegExp, EventType][] = [
  [/sangeet|wedding|shaadi|shadi|reception|mehendi|mehndi|haldi|mehfil/, 'Wedding Sangeet'],
  [/fashion|runway|ramp/, 'Fashion Runway'],
  [/comedy|stand-?up/, 'Stand-up Comedy'],
  [/corporate|keynote|conference|launch|town-?hall/, 'Corporate Keynote'],
  [/\bdj\b|edm|party/, 'DJ Night'],
  [/concert|live|band/, 'Open-Air Concert'],
  [/fest|college/, 'College Fest'],
]

const DECOR_WORDS: [RegExp, string][] = [
  [/mandap/, 'mandap'], [/floral|flower/, 'floral'], [/drape/, 'drapes'], [/chandelier/, 'chandelier'], [/photo\s*booth/, 'photo booth'],
  [/cold\s*pyro/, 'cold pyro'], [/smoke/, 'smoke'], [/co2/, 'co2'], [/confetti/, 'confetti'], [/firework/, 'fireworks'], [/flame/, 'flames'],
]

export function parseBrief(text: string): { input: WizardInput; notes: string[]; extras: BriefExtras } {
  const t = text.toLowerCase()
  const notes: string[] = []
  const extras: BriefExtras = {}

  // Event type
  let eventType: EventType = 'Wedding Sangeet'
  const hit = TYPE_RULES.find(([re]) => re.test(t))
  if (hit) eventType = hit[1]
  else notes.push(`No event type found; assumed ${eventType}.`)

  // Audience: "300 pax", "500 log", or a lone number above 50 outside any size and not a screen count
  const sizeRe = new RegExp(`${NUM}\\s*${UNIT}${SEP}${NUM}\\s*${UNIT}`, 'g')
  const stripped = t.replace(sizeRe, ' ')
  let audience = 0
  const am = stripped.match(/(\d[\d,]*)\s*(?:\+\s*)?(?:pax|guests?|people|persons?|audience|crowd|log|mehmaan|attendees?|members?)/)
  if (am) audience = parseInt(am[1].replace(/,/g, ''), 10)
  else {
    const lone = [...stripped.matchAll(/\b(\d[\d,]*)\b(?!\s*(?:side\s*)?screens?)/g)].map((m) => parseInt(m[1].replace(/,/g, ''), 10)).find((n) => n > 50)
    if (lone) {
      audience = lone
      notes.push(`Took ${lone} as the audience size.`)
    }
  }
  if (!audience) {
    audience = 300
    notes.push('No audience size found; assumed 300.')
  }

  // Sizes: "40x20", "12m x 8m", "40 x 20 ft"; stage vs venue by nearby keyword
  const toM = (a: number, b: number, u1: string | undefined, u2: string | undefined, what: string): [number, number] => {
    const unit = u2 || u1
    const feet = unit ? /^(ft|feet|')$/.test(unit) : what === 'Stage' && Math.max(a, b) > 30 // venues default to metres
    if (feet) {
      notes.push(`${what} ${a}x${b} read as feet${unit ? '' : ' (over 30 with no unit, too big for a stage in metres)'}: ${r1(a * FT)} x ${r1(b * FT)} m.`)
      return [r1(a * FT), r1(b * FT)]
    }
    return [a, b]
  }
  let venue: [number, number] | undefined
  for (const m of t.matchAll(sizeRe)) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[3])
    const i = m.index ?? 0
    const before = t.slice(Math.max(0, i - 14), i)
    const after = t.slice(i + m[0].length, i + m[0].length + 14)
    if (/stage|mandap|deck/.test(after) || /stage/.test(before)) {
      const [w, l] = toM(a, b, m[2], m[4], 'Stage')
      extras.stageW = w
      extras.stageL = l
    } else if (/venue|hall|lawn|ground|room|ballroom|banquet|area|site/.test(before) || /venue|hall|lawn|ground/.test(after)) {
      venue = toM(a, b, m[2], m[4], 'Venue')
    } else if (!extras.stageW) {
      // An unlabelled size is most likely the stage.
      const [w, l] = toM(a, b, m[2], m[4], 'Stage')
      extras.stageW = w
      extras.stageL = l
      notes.push('Unlabelled size taken as the stage.')
    }
  }

  // Indoor / outdoor
  const out = /lawn|open|ground|outdoor|farm|terrace|garden/.test(t)
  const inn = /hall|ballroom|banquet|indoor|auditorium|room/.test(t)
  const outdoor = out ? true : inn ? false : ['Open-Air Concert', 'College Fest', 'DJ Night'].includes(eventType)
  if (!out && !inn) notes.push(`Indoor or outdoor not stated; assumed ${outdoor ? 'outdoor' : 'indoor'}.`)

  // Tables, screens, truss, decor
  if (/round/.test(t)) extras.tables = 'round'
  else if (/banquet\s*table|long\s*table/.test(t)) extras.tables = 'banquet'
  else if (/theat(re|er)|chair\s*rows?|rows?\s*of\s*chairs/.test(t)) extras.tables = 'theatre'
  else if (/cocktail|high\s*table/.test(t)) extras.tables = 'cocktail'
  const sm = t.match(/(\d+|one|two|three|four)\s*(?:side\s*|led\s*|big\s*)?screens?/)
  if (sm) extras.screens = ({ one: 1, two: 2, three: 3, four: 4 } as Record<string, number>)[sm[1]] ?? parseInt(sm[1], 10)
  if (/truss|rigging/.test(t)) extras.truss = true
  const decor = DECOR_WORDS.filter(([re]) => re.test(t)).map(([, n]) => n)
  if (decor.length) extras.decor = decor

  // Venue fallback from audience: seated guests need more floor than standing ones, aspect 3:4
  const seated = ['Wedding Sangeet', 'Corporate Keynote', 'Fashion Runway', 'Stand-up Comedy'].includes(eventType)
  let [venueW, venueL] = venue ?? [0, 0]
  if (!venue) {
    const area = audience * (seated ? 2.6 : 1.2) // includes stage, FOH, buffet and walkways
    venueW = Math.max(20, Math.ceil(Math.sqrt((area * 3) / 4) / 2) * 2)
    venueL = Math.max(28, Math.ceil(area / venueW / 2) * 2)
    notes.push(`No venue size given; estimated ${venueW} x ${venueL} m from ${audience} guests.`)
  }

  const name = `${eventType === 'Wedding Sangeet' ? 'Sangeet' : eventType} for ${audience}`
  return { input: { name, eventType, audience, venueW, venueL, outdoor }, notes, extras }
}

export function briefToProject(text: string): { project: Project; notes: string[] } {
  const { input, notes, extras } = parseBrief(text)
  const project = generateProject(input)
  if (extras.stageW && extras.stageL && project.decks.length) {
    // Rebuild the stage as a grid of 2 x 1 m decks of the requested size, centred, at the old y and height.
    const old = project.decks
    const h = old[0].h
    const y0 = Math.min(...old.map((d) => d.y))
    const W = Math.max(2, Math.round(Math.min(extras.stageW, project.venue.w - 2) / 2) * 2)
    const L = Math.max(1, Math.round(Math.min(extras.stageL, project.venue.l - y0 - 4)))
    const x0 = Math.round(((project.venue.w - W) / 2) * 2) / 2
    const decks: Deck[] = []
    for (let c = 0; c < W / 2; c++) for (let r = 0; r < L; r++) decks.push({ id: nanoid(8), x: x0 + c * 2, y: y0 + r, w: 2, l: 1, h })
    project.decks = decks
    notes.push(`Stage set to ${W} x ${L} m.`)
  }
  if (extras.decor?.length) notes.push(`Decor requested: ${extras.decor.join(', ')}.`)
  if (extras.tables) notes.push(`Table style requested: ${extras.tables}.`)
  if (extras.screens != null) notes.push(`${extras.screens} screen(s) requested.`)
  return { project, notes }
}
