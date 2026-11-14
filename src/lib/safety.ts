import type { Project } from '../types'
import { capacity } from './calc'

// Crowd and exit maths plus an Indian permit/safety checklist. All figures are indicative, not a substitute for a licensed safety officer.

const FLOW = 82 // persons per metre of exit width per minute (UK Green Guide style flow rate)
const MAX_OPENING = 10 // cap on a single exit opening, metres

export interface CrowdCheck {
  area: number
  capacity: number
  audience: number
  densityPerM2: number
  level: 'ok' | 'warn' | 'error'
  exits: { id: string; label: string; widthM: number }[]
  totalExitWidth: number
  evacMinutes: number
  targetMinutes: number
  requiredExitWidth: number
  exitsNeeded: number
  messages: string[]
}

export const isOutdoor = (eventType: string) => /open-air|fest/i.test(eventType)

export function crowdCheck(p: Project): CrowdCheck {
  const zones = p.ground.filter((g) => ['crowd', 'vip', 'seating'].includes(g.kind))
  const area = zones.reduce((a, g) => a + g.w * g.h, 0)
  const standing = p.ground.filter((g) => g.kind === 'crowd' || g.kind === 'vip').reduce((a, g) => a + g.w * g.h, 0)
  const cap = capacity(p.ground)
  const audience = p.audience
  const densityPerM2 = standing > 0 ? audience / standing : 0
  const level: CrowdCheck['level'] = densityPerM2 > 4 ? 'error' : densityPerM2 > 2 ? 'warn' : 'ok'
  const exits = p.ground.filter((g) => g.kind === 'exit').map((g) => ({ id: g.id, label: g.label || 'Exit', widthM: Math.min(MAX_OPENING, Math.max(g.w, g.h)) }))
  const totalExitWidth = exits.reduce((a, e) => a + e.widthM, 0)
  const evacMinutes = totalExitWidth > 0 ? audience / (totalExitWidth * FLOW) : Infinity
  const targetMinutes = isOutdoor(p.eventType) ? 8 : 2.5
  const requiredExitWidth = audience / (FLOW * targetMinutes)
  const exitsNeeded = 2 + Math.ceil(Math.max(0, audience - 500) / 1000)
  const messages: string[] = []
  if (audience > cap && cap > 0) messages.push(`Audience of ${audience} is above the ${cap} the zones hold; add floor area or reduce the audience.`)
  if (level === 'error') messages.push(`Standing density is ${densityPerM2.toFixed(1)} persons per m², which is unsafe (above 4). Enlarge the crowd area or cut numbers.`)
  else if (level === 'warn') messages.push(`Standing density is ${densityPerM2.toFixed(1)} persons per m²; above 2 gets tight for movement and emergencies.`)
  if (exits.length === 0) messages.push('No exits are marked on the ground plan.')
  else {
    if (exits.length < exitsNeeded) messages.push(`${exits.length} exit(s) marked; about ${exitsNeeded} are typically expected for ${audience} people.`)
    if (totalExitWidth < requiredExitWidth) messages.push(`Exit width is ${totalExitWidth.toFixed(1)} m; about ${requiredExitWidth.toFixed(1)} m is needed to clear the crowd in ${targetMinutes} min.`)
    else messages.push(`Estimated clearance time is ${evacMinutes.toFixed(1)} min (target ${targetMinutes} min).`)
  }
  messages.push('Indicative only: based on 82 persons per metre per minute; confirm with a licensed safety consultant.')
  return { area, capacity: cap, audience, densityPerM2, level, exits, totalExitWidth, evacMinutes, targetMinutes, requiredExitWidth, exitsNeeded, messages }
}

export type CheckGroup = 'Permits' | 'Fire safety' | 'Structure & power' | 'Crowd & medical' | 'Sound & time'
export interface CheckItem {
  id: string
  group: CheckGroup
  text: string
  who: string
  states?: string[] // state codes this item applies to; absent = everywhere
}

export const CHECKLIST_DISCLAIMER = 'Rules vary by city and state and change often. This list is a general guide, not legal advice; verify every requirement with the local police, fire service, municipal body and licensing authorities.'

export const CHECKLIST: CheckItem[] = [
  // Permits
  { id: 'police', group: 'Permits', text: 'Police permission for the event from the local police station or Commissioner of Police', who: 'Organiser' },
  { id: 'municipal', group: 'Permits', text: 'Municipal permission for temporary structures, pandal or stage on the site', who: 'Organiser' },
  { id: 'ppl', group: 'Permits', text: 'PPL licence for recorded music (Phonographic Performance Ltd)', who: 'Organiser' },
  { id: 'iprs', group: 'Permits', text: 'IPRS licence for performing musical works and lyrics', who: 'Organiser' },
  { id: 'novex', group: 'Permits', text: 'Novex licence for music rights where applicable', who: 'Organiser' },
  { id: 'excise', group: 'Permits', text: 'Excise / liquor licence if alcohol is served', who: 'Organiser / caterer' },
  { id: 'fssai', group: 'Permits', text: 'FSSAI registration or licence for food stalls and caterers', who: 'Caterer' },
  { id: 'traffic', group: 'Permits', text: 'Traffic police permission and parking plan', who: 'Organiser' },
  { id: 'insurance', group: 'Permits', text: 'Event insurance: public liability and property cover', who: 'Organiser' },
  { id: 'rj-police', group: 'Permits', text: 'Jaipur Police Commissionerate permission for the event', who: 'Organiser', states: ['RJ'] },
  { id: 'mh-police', group: 'Permits', text: 'Mumbai Police permission and PRS clearance through the licensing process', who: 'Organiser', states: ['MH'] },
  { id: 'dl-police', group: 'Permits', text: 'Delhi Police licensing unit permission for the event', who: 'Organiser', states: ['DL'] },
  // Fire safety
  { id: 'fire-noc', group: 'Fire safety', text: 'Fire NOC from the state fire service', who: 'Organiser' },
  { id: 'extinguishers', group: 'Fire safety', text: 'ABC fire extinguishers placed (typically 1 per 100 m²) and staff trained', who: 'Safety officer' },
  { id: 'sand', group: 'Fire safety', text: 'Sand buckets and fire blankets at stage, generator and kitchen areas', who: 'Safety officer' },
  { id: 'emergency-light', group: 'Fire safety', text: 'Emergency lighting and illuminated exit signage on all routes', who: 'Production' },
  { id: 'flame-retardant', group: 'Fire safety', text: 'Fire-retardant certificates for drapes, tents and decor', who: 'Decor vendor' },
  { id: 'rj-fire', group: 'Fire safety', text: 'Rajasthan State Fire NOC applied through Raj Nivesh / Single Window portal', who: 'Organiser', states: ['RJ'] },
  { id: 'dl-fire', group: 'Fire safety', text: 'Delhi Fire Service NOC for the temporary structure', who: 'Organiser', states: ['DL'] },
  { id: 'ga-fire', group: 'Fire safety', text: 'Goa fire and life safety guidelines (Dec 2025) reviewed and complied with', who: 'Organiser', states: ['GA'] },
  { id: 'pyro-peso', group: 'Fire safety', text: 'Explosives licence from PESO for fireworks, and licensed pyro operator', who: 'Pyro vendor' },
  { id: 'cold-pyro', group: 'Fire safety', text: 'Cold pyro operator certificate and spark-machine safety distances', who: 'Pyro vendor' },
  // Structure & power
  { id: 'structure', group: 'Structure & power', text: 'Structural stability certificate for stage and truss by a qualified engineer', who: 'Stage vendor' },
  { id: 'rigging', group: 'Structure & power', text: 'Rigging inspection: hoists, motors, shackles and safety steels checked and signed off', who: 'Rigger' },
  { id: 'electrical', group: 'Structure & power', text: 'Electrical inspector approval and DG set permission', who: 'Electrical contractor' },
  { id: 'ceig', group: 'Structure & power', text: 'CEIG / electrical inspectorate approval for large temporary installations', who: 'Electrical contractor' },
  { id: 'earthing', group: 'Structure & power', text: 'Generator earthing with ELCB / RCCB protection on all circuits', who: 'Electrical contractor' },
  { id: 'drone', group: 'Structure & power', text: 'Drone permission via DGCA Digital Sky if drones are flown', who: 'Drone operator' },
  // Crowd & medical
  { id: 'ambulance', group: 'Crowd & medical', text: 'Ambulance on standby and a first-aid post with trained staff', who: 'Organiser' },
  { id: 'barricades', group: 'Crowd & medical', text: 'Barricades, crowd lanes and controlled entry and exit flow', who: 'Security' },
  { id: 'women-safety', group: 'Crowd & medical', text: "Women's safety measures: help desk, lighting and CCTV coverage", who: 'Security' },
  { id: 'ka-crowd', group: 'Crowd & medical', text: 'Karnataka crowd-control requirements (post-2025) checked with local police', who: 'Organiser', states: ['KA'] },
  // Sound & time
  { id: 'loudspeaker', group: 'Sound & time', text: 'Loudspeaker / public address permission from the authority', who: 'Organiser' },
  { id: 'noise', group: 'Sound & time', text: 'Noise within CPCB limits and amplified sound stopped by the 10 pm cut-off', who: 'Sound engineer' },
]

export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: 'AP', name: 'Andhra Pradesh' }, { code: 'AR', name: 'Arunachal Pradesh' }, { code: 'AS', name: 'Assam' }, { code: 'BR', name: 'Bihar' },
  { code: 'CG', name: 'Chhattisgarh' }, { code: 'GA', name: 'Goa' }, { code: 'GJ', name: 'Gujarat' }, { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' }, { code: 'JH', name: 'Jharkhand' }, { code: 'KA', name: 'Karnataka' }, { code: 'KL', name: 'Kerala' },
  { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MH', name: 'Maharashtra' }, { code: 'MN', name: 'Manipur' }, { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' }, { code: 'NL', name: 'Nagaland' }, { code: 'OD', name: 'Odisha' }, { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' }, { code: 'SK', name: 'Sikkim' }, { code: 'TN', name: 'Tamil Nadu' }, { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' }, { code: 'UP', name: 'Uttar Pradesh' }, { code: 'UK', name: 'Uttarakhand' }, { code: 'WB', name: 'West Bengal' },
  { code: 'AN', name: 'Andaman and Nicobar Islands' }, { code: 'CH', name: 'Chandigarh' }, { code: 'DN', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', name: 'Delhi' }, { code: 'JK', name: 'Jammu and Kashmir' }, { code: 'LA', name: 'Ladakh' }, { code: 'LD', name: 'Lakshadweep' }, { code: 'PY', name: 'Puducherry' },
]

// Items for a state: general items plus that state's own. No state given = everything.
export function checklistFor(state?: string): CheckItem[] {
  if (!state) return CHECKLIST
  return CHECKLIST.filter((c) => !c.states || c.states.includes(state))
}

// Short sound guidance by event type.
export function noiseNote(eventType: string): string {
  if (/concert|dj|fest/i.test(eventType)) return 'Amplified music is usually barred after 10 pm and needs loudspeaker permission; keep levels within CPCB limits and aim sound at the audience, away from neighbours.'
  if (/sangeet|wedding/i.test(eventType)) return 'Bands and DJs must usually stop by 10 pm; get loudspeaker permission and face speakers away from homes and hospitals.'
  return 'Indoor events still need loudspeaker permission for amplified sound; keep to CPCB limits and the 10 pm cut-off outdoors.'
}
