// Text-to-layout. A brief ("1,500-guest sangeet on a 60×40 lawn, 40×20 ft stage, two LED sides, cold pyro")
// becomes a BriefPlan, a small structured spec, and the plan becomes a full first draft: venue, stage,
// screens, seating, decor and effects, a sound system and a theme.
//
// Two ways to read a brief, same plan shape:
//  - built-in rules (default): English or Hinglish, runs in the browser, nothing is sent anywhere;
//  - an AI service (later): set one up in aiConfig and it is asked for the same JSON (BRIEF_SCHEMA).
//    Its answer is checked and cleaned by normalizePlan, so a bad answer can never break the design.
import { nanoid } from 'nanoid'
import type { Deck, Project } from '../types'
import { parseBrief } from './smartLayout'
import { generateProject, EVENT_TYPES, type EventType } from './templates'
import { decorPreset, newDecor } from './decor'
import { autoLayout, defaultArea, type LayoutStyle } from './seating'
import { autoDesign } from './sound'
import { screenStats } from './calc'
import { applyTheme, THEMES } from './themes'

export interface BriefPlan {
  name: string
  eventType: EventType
  audience: number
  venue: { w: number; l: number; outdoor: boolean }
  stage?: { w: number; l: number; h?: number }
  screens?: { center: boolean; sides: boolean } // which LED screens to keep
  seating?: LayoutStyle | 'standing'
  decor: string[] // mandap, floral, drapes, chandelier, photo booth
  effects: string[] // cold pyro, smoke, co2, confetti, fireworks, flames
  sound: boolean
  theme?: string // a THEMES id
  notes: string[]
}

// The JSON an AI service must return (also the documentation of BriefPlan for a prompt).
export const BRIEF_SCHEMA = {
  type: 'object',
  required: ['eventType', 'audience', 'venue'],
  properties: {
    name: { type: 'string' },
    eventType: { enum: [...EVENT_TYPES] },
    audience: { type: 'integer', minimum: 10, maximum: 200000 },
    venue: { type: 'object', properties: { w: { type: 'number', description: 'metres across' }, l: { type: 'number', description: 'metres deep' }, outdoor: { type: 'boolean' } } },
    stage: { type: 'object', properties: { w: { type: 'number' }, l: { type: 'number' }, h: { type: 'number', description: 'deck height in metres' } } },
    screens: { type: 'object', properties: { center: { type: 'boolean' }, sides: { type: 'boolean' } } },
    seating: { enum: ['banquet', 'theatre', 'classroom', 'cabaret', 'cocktail', 'standing'] },
    decor: { type: 'array', items: { enum: ['mandap', 'floral', 'drapes', 'chandelier', 'photo booth'] } },
    effects: { type: 'array', items: { enum: ['cold pyro', 'smoke', 'co2', 'confetti', 'fireworks', 'flames'] } },
    sound: { type: 'boolean' },
    theme: { enum: THEMES.map((t) => t.id) },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const

const THEME_WORDS: [RegExp, string][] = [
  [/royal|rajasthan|rajput|palace|maharaja|jaipur|udaipur/, 'royal'],
  [/cyber|neon|futur|techno|sci-?fi/, 'cyber'],
  [/retro|bollywood|70s|vintage|disco/, 'retro'],
  [/white\s*(and|&)\s*gold|elegan|ivory|pastel|minimal/, 'white'],
  [/corporate|navy|blue\s*theme|keynote/, 'corporate'],
  [/holi|colou?r\s*(run|burst|fest)|rang/, 'holi'],
]

/** Built-in reading of a brief (no network). */
export function rulePlan(text: string): BriefPlan {
  // "1,500-guest" and "1500-pax": make the hyphen a space so the counts are found.
  const clean = text.replace(/(\d)\s*-\s*(guest|pax|people|person|seat)/gi, '$1 $2')
  const { input, notes, extras } = parseBrief(clean)
  const t = clean.toLowerCase()
  const plan: BriefPlan = {
    name: input.name,
    eventType: input.eventType as EventType,
    audience: input.audience,
    venue: { w: input.venueW, l: input.venueL, outdoor: input.outdoor },
    decor: [],
    effects: [],
    sound: true,
    notes: [...notes],
  }
  if (extras.stageW && extras.stageL) plan.stage = { w: extras.stageW, l: extras.stageL }
  const hm = t.match(/(\d+(?:\.\d+)?)\s*(ft|feet|'|m|metres?|meters?)?\s*(?:high|tall|height)\s*(?:stage|deck)?|stage\s*height\s*(\d+(?:\.\d+)?)\s*(ft|feet|'|m)?/)
  if (hm) {
    const v = parseFloat(hm[1] ?? hm[3])
    const u = hm[2] ?? hm[4]
    const h = u && /f|'/.test(u) ? v * 0.3048 : v > 6 ? v * 0.3048 : v
    if (plan.stage) plan.stage.h = Math.round(h * 10) / 10
    else plan.stage = { w: 0, l: 0, h: Math.round(h * 10) / 10 }
  }
  // Screens: "two LED sides", "side screens", "centre LED", "no LED".
  const sides = /side(s)?\s*(led|screens?)|(led|screens?)\s*(on\s*)?(both\s*)?sides|two\s*(led\s*)?sides|led\s*sides|2\s*side/.test(t)
  const centre = /cent(er|re)\s*(led|screen)|main\s*(led|screen)|backdrop\s*led|big\s*screen/.test(t)
  if (/no\s*(led|screens?)|without\s*(led|screens?)/.test(t)) plan.screens = { center: false, sides: false }
  else if (sides || centre) plan.screens = { center: centre || !sides || (extras.screens ?? 0) >= 3, sides }
  else if (extras.screens != null) plan.screens = { center: extras.screens !== 2, sides: extras.screens >= 2 }
  // Seating
  if (/standing|no\s*chairs|stand-?up\s*crowd/.test(t)) plan.seating = 'standing'
  else if (extras.tables === 'round' || /banquet|dinner|round\s*tables?/.test(t)) plan.seating = 'banquet'
  else if (extras.tables === 'theatre') plan.seating = 'theatre'
  else if (/classroom/.test(t)) plan.seating = 'classroom'
  else if (/cabaret/.test(t)) plan.seating = 'cabaret'
  else if (extras.tables === 'cocktail') plan.seating = 'cocktail'
  for (const d of extras.decor ?? []) (['cold pyro', 'smoke', 'co2', 'confetti', 'fireworks', 'flames'].includes(d) ? plan.effects : plan.decor).push(d)
  if (/no\s*(sound|pa|speakers?)/.test(t)) plan.sound = false
  const th = THEME_WORDS.find(([re]) => re.test(t))
  if (th) plan.theme = th[1]
  return normalizePlan(plan)
}

const clamp = (n: unknown, a: number, b: number, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(b, Math.max(a, n)) : d)
const list = (x: unknown, ok: string[]) => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === 'string' && ok.includes(v)))] : [])

/** Make any plan (ours or an AI's) safe: known values only, sizes in sensible ranges. */
export function normalizePlan(input: unknown): BriefPlan {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<BriefPlan> & Record<string, unknown>
  const eventType = (EVENT_TYPES as readonly string[]).includes(raw.eventType as string) ? (raw.eventType as EventType) : 'Wedding Sangeet'
  const audience = Math.round(clamp(raw.audience, 10, 200000, 300))
  const v = (raw.venue ?? {}) as Partial<BriefPlan['venue']>
  const plan: BriefPlan = {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 80) : `${eventType} for ${audience}`,
    eventType,
    audience,
    venue: { w: clamp(v.w, 10, 600, 40), l: clamp(v.l, 10, 800, 50), outdoor: typeof v.outdoor === 'boolean' ? v.outdoor : true },
    decor: list(raw.decor, ['mandap', 'floral', 'drapes', 'chandelier', 'photo booth']),
    effects: list(raw.effects, ['cold pyro', 'smoke', 'co2', 'confetti', 'fireworks', 'flames']),
    sound: raw.sound !== false,
    notes: Array.isArray(raw.notes) ? raw.notes.filter((n): n is string => typeof n === 'string').slice(0, 20) : [],
  }
  const s = raw.stage as BriefPlan['stage'] | undefined
  if (s && (s.w || s.h)) plan.stage = { w: clamp(s.w, 0, 120, 0), l: clamp(s.l, 0, 80, 0), h: s.h === undefined ? undefined : clamp(s.h, 0.2, 4, 1.2) }
  const sc = raw.screens as BriefPlan['screens'] | undefined
  if (sc && typeof sc === 'object') plan.screens = { center: !!sc.center, sides: !!sc.sides }
  if (['banquet', 'theatre', 'classroom', 'cabaret', 'cocktail', 'standing'].includes(raw.seating as string)) plan.seating = raw.seating as BriefPlan['seating']
  if (THEMES.some((t) => t.id === raw.theme)) plan.theme = raw.theme as string
  return plan
}

/** Build the whole first draft from a plan. */
export function planToProject(plan: BriefPlan): { project: Project; notes: string[] } {
  const notes = [...plan.notes]
  const project = generateProject({ name: plan.name, eventType: plan.eventType, audience: plan.audience, venueW: plan.venue.w, venueL: plan.venue.l, outdoor: plan.venue.outdoor })

  // Stage: a grid of 2 × 1 m decks at the requested size, centred where the template put the stage.
  if (plan.stage && project.decks.length) {
    const old = project.decks
    const h = plan.stage.h ?? old[0].h
    const y0 = Math.min(...old.map((d) => d.y))
    const W = plan.stage.w ? Math.max(2, Math.round(Math.min(plan.stage.w, project.venue.w - 2) / 2) * 2) : null
    const L = plan.stage.l ? Math.max(1, Math.round(Math.min(plan.stage.l, project.venue.l - y0 - 4))) : null
    if (W && L) {
      const x0 = Math.round(((project.venue.w - W) / 2) * 2) / 2
      const decks: Deck[] = []
      for (let c = 0; c < W / 2; c++) for (let r = 0; r < L; r++) decks.push({ id: nanoid(8), x: x0 + c * 2, y: y0 + r, w: 2, l: 1, h })
      project.decks = decks
      notes.push(`Stage ${W} × ${L} m, ${h} m high.`)
    } else for (const d of project.decks) d.h = h
  }

  // Screens: keep the centre wall and/or the side screens, as asked.
  if (plan.screens && project.screens.length) {
    const cx = project.venue.w / 2
    const isCentre = (s: Project['screens'][number]) => Math.abs(s.x + screenStats(s, project.customPanels).w / 2 - cx) < Math.max(4, project.venue.w * 0.08) || /cent/i.test(s.name)
    project.screens = project.screens.filter((s) => (isCentre(s) ? plan.screens!.center : plan.screens!.sides))
    notes.push(plan.screens.center || plan.screens.sides ? `LED: ${[plan.screens.center && 'centre wall', plan.screens.sides && 'side screens'].filter(Boolean).join(' and ')}.` : 'No LED screens.')
  }

  // Seating: lay out tables or rows for the guests in the audience area.
  if (plan.seating && plan.seating !== 'standing') {
    const r = autoLayout({ style: plan.seating, guests: plan.audience, area: defaultArea(project), aisle: 2 })
    project.tables = r.tables
    notes.push(`${plan.seating[0].toUpperCase() + plan.seating.slice(1)} seating for ${r.seats.toLocaleString('en-IN')}${r.fits ? '' : ' (not everyone fits: enlarge the venue or change the style)'}.`)
  }

  // Decor and effects.
  const d = project.decor ?? []
  const stageEnd = project.decks.length ? Math.max(...project.decks.map((x) => x.y + x.l)) : 8
  const want = new Set([...plan.decor, ...plan.effects])
  if (want.has('mandap')) d.push(newDecor('mandap', project.venue.w / 2, Math.min(project.venue.l - 4, stageEnd + 6)))
  if (want.has('floral') || want.has('drapes')) d.push(...decorPreset(project, 'wedding-stage'))
  if (want.has('cold pyro')) d.push(...decorPreset(project, 'pyro-front'))
  if (want.has('smoke')) d.push(...decorPreset(project, 'smoke-wings'))
  if (want.has('co2')) d.push(...decorPreset(project, 'co2-row'))
  if (want.has('fireworks')) d.push(...decorPreset(project, 'fireworks-finale'))
  if (want.has('confetti')) d.push(newDecor('confetti', project.venue.w / 2 - 4, 4), newDecor('confetti', project.venue.w / 2 + 4, 4))
  if (want.has('flames')) d.push(newDecor('flame', project.venue.w / 2 - 8, 3), newDecor('flame', project.venue.w / 2 + 8, 3))
  if (want.has('chandelier')) for (let i = 0; i < 4; i++) d.push(newDecor('chandelier', project.venue.w * (0.2 + i * 0.2), project.venue.l * 0.6))
  if (want.has('photo booth')) d.push(newDecor('photo-booth', project.venue.w - 4, project.venue.l - 4))
  project.decor = d
  if (want.size) notes.push(`Added: ${[...want].join(', ')}.`)

  // Sound system, sized for this venue and crowd (replaces the template's basic speaker boxes).
  if (plan.sound) {
    project.sound = autoDesign(project)
    project.fixtures = project.fixtures.filter((f) => f.kind !== 'line-array' && f.kind !== 'sub')
    notes.push('Sound system designed (see the Sound tab).')
  }
  if (plan.theme) {
    applyTheme(project, plan.theme)
    notes.push(`Theme: ${THEMES.find((t) => t.id === plan.theme)?.name}.`)
  }
  return { project, notes }
}

// ---------------------------------------------------------------- AI service (optional, for later)

/** Where a future AI service lives. Empty = built-in rules only. No keys are kept in the browser. */
export interface AiConfig {
  endpoint: string // your own server route that calls the AI provider with its key, e.g. /api/brief
}
const AI_KEY = 'unifest:ai'
export function aiConfig(): AiConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(AI_KEY) || 'null') as AiConfig | null
    return c?.endpoint ? c : null
  } catch {
    return null
  }
}

/** The instructions an AI service is given with the brief (kept here so the format never drifts). */
export const aiPrompt = (text: string) =>
  `You turn an event brief from an Indian event planner into JSON for a stage and venue layout tool. ` +
  `Return only JSON matching this schema: ${JSON.stringify(BRIEF_SCHEMA)}. ` +
  `Sizes in metres (convert feet). Put anything you assumed in notes. Brief: ${text}`

/**
 * Read a brief: the AI service when one is set up (falling back to the rules if it fails), else the rules.
 * The service receives { text, prompt, schema } and must answer with a BriefPlan JSON object.
 */
export async function readBrief(text: string): Promise<{ plan: BriefPlan; engine: 'rules' | 'ai' }> {
  const cfg = aiConfig()
  if (cfg) {
    try {
      const r = await fetch(cfg.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, prompt: aiPrompt(text), schema: BRIEF_SCHEMA }) })
      if (r.ok) return { plan: normalizePlan(await r.json()), engine: 'ai' }
    } catch {
      /* fall back to the rules */
    }
  }
  return { plan: rulePlan(text), engine: 'rules' }
}
