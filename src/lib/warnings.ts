import type { Project, Workspace } from '../types'
import { pixelLayout, portMap, powerPlan, rigging, screenSize, screenStats, stageBounds } from './calc'
import { findPanel } from './panels'
import { audienceEstimate } from './capacity'
import { seatCount } from './seating'
import type { Selection } from '../store'
import { fixAddExits, fixAddFoh, fixAddGenerators, fixAutoRig, fixExtendTruss, fixGroundInside, fixGrowCrowd, fixScreenGroundStack, fixScreenToStageFloor, fixSoundDelays, fixSoundDesign, fixTableInside, type Fix } from './fixes'
import { coverage, soundWarnings } from './sound'
import { generatorPlan } from './resources'

export interface Warning {
  level: 'warn' | 'error'
  text: string
  fix?: string
  workspace: Workspace
  target?: Selection
  action?: Fix // one-click fix, applied as a single undoable change
}

export function getWarnings(p: Project): Warning[] {
  const out: Warning[] = []
  const sb = stageBounds(p)

  // Rigging
  const rig = rigging(p)
  for (const s of rig.supports) {
    if (s.capacity === 0 && s.kg > 0)
      out.push({ level: 'error', text: `${s.label}: ${Math.round(s.kg)} kg hangs from a point with no hoist or tower.`, fix: 'Add a hoist on this truss, or turn on ground-support legs.', workspace: 'truss', action: fixAutoRig })
    else if (s.kg > s.capacity)
      out.push({ level: 'error', text: `${s.label} carries ${Math.round(s.kg)} kg; its rating is ${s.capacity} kg.`, fix: 'Use Auto-rig, a bigger motor, or add another hoist to share the load.', workspace: 'truss', target: { kind: 'hoist', id: s.id }, action: fixAutoRig })
    else if (s.capacity > 0 && s.kg > s.capacity * 0.85)
      out.push({ level: 'warn', text: `${s.label} is at ${Math.round((s.kg / s.capacity) * 100)}% of its rating.`, fix: 'Keep a safety margin: add a hoist nearby.', workspace: 'truss', target: { kind: 'hoist', id: s.id } })
  }
  for (const t of rig.trusses) {
    if (t.spanLoad > t.allowable)
      out.push({ level: 'error', text: `A ${t.maxSpan.toFixed(1)} m span carries about ${Math.round(t.spanLoad)} kg; this truss is rated for about ${Math.round(t.allowable)} kg at that span.`, fix: 'Use Auto-rig, add a hoist mid-span, or use 40 cm truss.', workspace: 'truss', target: { kind: 'truss', id: t.truss.id }, action: fixAutoRig })
  }

  // LED
  const nearest = sb ? 3 : 4
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    const pm = portMap(s, st.panel, p.processor.portPx)
    if (st.panel.pitch > nearest + 2 && !st.panel.outdoor)
      out.push({ level: 'warn', text: `${s.name}: P${st.panel.pitch} looks pixelated closer than ${st.panel.pitch} m.`, fix: 'Pick a finer pitch for indoor events.', workspace: 'led', target: { kind: 'screen', id: s.id } })
    if (s.mount === 'flown' && !p.truss.length)
      out.push({ level: 'error', text: `${s.name} is flown but there is no truss.`, fix: 'Draw a truss above it, or set the screen to ground-stacked.', workspace: 'truss', target: { kind: 'screen', id: s.id }, action: fixScreenGroundStack(s.id) })
    if (pm.ports.length > 16)
      out.push({ level: 'warn', text: `${s.name} needs ${pm.ports.length} data ports; most processors have 16 or fewer.`, fix: 'Split across two processors.', workspace: 'led', target: { kind: 'screen', id: s.id } })
    if (sb && s.mount === 'ground' && s.z < sb.h - 0.05 && s.y >= sb.y && s.y <= sb.y + sb.l && s.x < sb.x + sb.w && s.x + st.w > sb.x)
      out.push({ level: 'warn', text: `${s.name} starts below the stage floor.`, fix: `Raise it to at least ${sb.h} m.`, workspace: 'led', target: { kind: 'screen', id: s.id }, action: fixScreenToStageFloor(s.id) })
  }
  if (p.screens.length) {
    const pl = pixelLayout(p)
    if (pl.width > 7680 || pl.height > 4320) out.push({ level: 'warn', text: `Pixel map is ${pl.width} × ${pl.height}; that needs more than one 8K output.`, fix: 'Plan multiple media-server outputs.', workspace: 'deliver' })
  }
  const pp = powerPlan(p)
  if (pp.imbalance > 0.25 && Math.max(...Object.values(pp.amps)) > 10)
    out.push({ level: 'warn', text: `Power phases are ${Math.round(pp.imbalance * 100)}% unbalanced.`, fix: 'Move circuits between L1/L2/L3.', workspace: 'led' })

  // Screens vs truss width
  for (const s of p.screens.filter((s) => s.mount === 'flown')) {
    const W = screenSize(s, findPanel(s.panelId, p.customPanels)).w
    const t = p.truss.find((t) => Math.abs(t.y1 - s.y) < 0.75 && Math.abs(t.y2 - s.y) < 0.75)
    if (t && (Math.min(t.x1, t.x2) > s.x + 0.01 || Math.max(t.x1, t.x2) < s.x + W - 0.01))
      out.push({ level: 'error', text: `${s.name} is wider than the truss it hangs from.`, fix: 'Extend the truss.', workspace: 'truss', target: { kind: 'screen', id: s.id }, action: fixExtendTruss(s.id, t.id) })
  }

  // Ground plan
  if (!p.ground.some((g) => g.kind === 'exit')) out.push({ level: 'error', text: 'No emergency exit is marked on the ground plan.', fix: 'Add at least two exits.', workspace: 'ground', action: fixAddExits })
  const est = audienceEstimate(p)
  for (const i of est.issues) out.push({ level: i.level, text: i.text, fix: i.invalid ? 'Move or resize it inside the venue, or enlarge the venue.' : undefined, workspace: 'ground', target: i.id ? { kind: 'ground', id: i.id } : undefined, action: i.id && i.invalid ? fixGroundInside(i.id) : undefined })
  if (est.status === 'check') out.push({ level: 'warn', text: 'Audience space estimate is unverified until the zone problems above are fixed.', workspace: 'ground' })
  else if (est.status === 'ok' && p.audience > est.estimate) out.push({ level: 'warn', text: `Expected ${p.audience.toLocaleString('en-IN')} people but the space estimate is about ${est.estimate.toLocaleString('en-IN')}.`, fix: 'Enlarge the crowd or seating areas, or lower the expected attendance.', workspace: 'ground', action: est.zonePeople > 0 && !est.tableSeats ? fixGrowCrowd(Math.min(2, p.audience / Math.max(1, est.estimate))) : undefined })
  const zoneIds = new Set(est.zones.map((z) => z.id))
  for (const g of p.ground) {
    if (zoneIds.has(g.id)) continue // audience zones are reported by the estimate above
    if (g.x < -0.01 || g.y < -0.01 || g.x + g.w > p.venue.w + 0.01 || g.y + g.h > p.venue.l + 0.01)
      out.push({ level: 'warn', text: `${g.label} is outside the venue boundary.`, workspace: 'ground', target: { kind: 'ground', id: g.id }, action: fixGroundInside(g.id) })
  }
  if (!sb) out.push({ level: 'warn', text: 'There is no stage yet.', fix: 'Pick a stage preset in the Stage workspace.', workspace: 'stage' })

  // Seating
  const seats = seatCount(p)
  const guests = p.guests ?? []
  if (guests.length > seats && seats > 0) out.push({ level: 'warn', text: `${guests.length} guests but only ${seats} seats.`, fix: 'Add tables, or generate a layout for your guest count.', workspace: 'seating' })
  const unseated = guests.filter((g) => !g.tableId).length
  if (unseated && seats > 0) out.push({ level: 'warn', text: `${unseated} guest${unseated === 1 ? ' has' : 's have'} no table.`, fix: 'Use Auto-seat in the Seating workspace.', workspace: 'seating' })
  for (const t of p.tables ?? []) {
    const over = guests.filter((g) => g.tableId === t.id).length - t.seats
    if (over > 0) out.push({ level: 'warn', text: `Table ${t.label} has ${over} more guest${over === 1 ? '' : 's'} than seats.`, workspace: 'seating', target: { kind: 'table', id: t.id } })
    const r = Math.max(t.w, t.l) / 2
    if (t.x - r < -0.01 || t.y - r < -0.01 || t.x + r > p.venue.w + 0.01 || t.y + r > p.venue.l + 0.01)
      out.push({ level: 'warn', text: `${t.kind === 'row' ? t.label : `Table ${t.label}`} is outside the venue.`, workspace: 'seating', target: { kind: 'table', id: t.id }, action: fixTableInside(t.id) })
  }

  // Crowd safety: exit width for the crowd, and a mixing position.
  const exits = p.ground.filter((g) => g.kind === 'exit')
  const exitWidth = exits.reduce((a, g) => a + Math.max(g.w, g.h), 0)
  const needWidth = Math.ceil(((p.audience || 0) * 1.2) / 250)
  if (exits.length && p.audience > 0 && exitWidth < needWidth)
    out.push({ level: 'warn', text: `Exits add up to ${Math.round(exitWidth)} m wide; ${p.audience.toLocaleString('en-IN')} people need about ${needWidth} m (planning guide: 1.2 m per 250 people).`, fix: 'Add or widen exits.', workspace: 'ground', action: fixAddExits })
  const hasSound = !!p.sound?.sources.length || p.fixtures.some((f) => f.kind === 'line-array' || f.kind === 'sub')
  if (hasSound && !p.ground.some((g) => g.kind === 'foh') && p.audience >= 300)
    out.push({ level: 'warn', text: 'There is no FOH (mixing desk) position on the ground plan.', fix: 'Add one on the centre line, about 60% of the way back.', workspace: 'ground', action: fixAddFoh })

  // Sound
  if (!hasSound && p.audience >= 50 && p.decks.length) out.push({ level: 'warn', text: 'No sound system is planned yet.', fix: 'Auto-design one in the Sound tab.', workspace: 'sound', action: fixSoundDesign })
  if (p.sound?.sources.length) {
    for (const w of soundWarnings(p, coverage(p, p.sound)))
      out.push({
        level: /can't reach|safety/.test(w) ? 'error' : 'warn',
        text: w,
        workspace: 'sound',
        action: /delay is/.test(w) ? fixSoundDelays : /too quiet|No main|can't reach|headroom/.test(w) ? fixSoundDesign : undefined,
      })
  }

  // Power: generators for the planned load.
  const gen = generatorPlan(p)
  const onPlan = p.ground.filter((g) => g.kind === 'generator').length
  if (gen.suggestedKva > 15 && onPlan < gen.sets.length)
    out.push({ level: 'warn', text: `The load needs about ${gen.suggestedKva} kVA of generators (${gen.sets.join(' + ')} kVA); ${onPlan ? `only ${onPlan}` : 'none'} on the plan.`, fix: 'Place them away from the crowd, with a clear path for fuel and cables.', workspace: 'ground', action: fixAddGenerators(gen.sets.slice(onPlan)) })

  // Permits (India): reminders that point to the permit checklist in the Plan tab.
  // Each reminder goes away once its item is ticked in the checklist.
  const ticked = new Set(p.checklist?.done ?? [])
  const pyro = (p.decor ?? []).some((d) => ['cold-pyro', 'flame', 'firework'].includes(d.kind))
  if (pyro && !ticked.has('fire-noc')) out.push({ level: 'warn', text: 'Pyro, flames or fireworks need a fire NOC and a licensed operator with approved products.', fix: 'Tick it in the permit checklist (Plan tab); keep 5 m clear of crowd and fabric.', workspace: 'plan' })
  if (hasSound && !ticked.has('loudspeaker')) out.push({ level: 'warn', text: 'Loudspeakers need police permission and must stop by 10 pm outdoors (Noise Pollution Rules, 2000).', fix: 'Apply early, and plan the show to end on time.', workspace: 'plan' })
  if (p.audience >= 1000 && !(ticked.has('police') && ticked.has('ambulance'))) out.push({ level: 'warn', text: `A crowd of ${p.audience.toLocaleString('en-IN')} usually needs police and traffic permission, and an ambulance on site.`, fix: 'See the permit checklist in the Plan tab.', workspace: 'plan' })
  if (gen.suggestedKva > 125 && !ticked.has('ceig')) out.push({ level: 'warn', text: `Generators of ${gen.suggestedKva} kVA usually need the electrical inspector's approval and a licensed electrician.`, fix: 'Add it to the permit checklist.', workspace: 'plan' })
  return out
}
