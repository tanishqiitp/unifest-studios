import type { Project, Workspace } from '../types'
import { capacity, pixelLayout, portMap, powerPlan, rigging, screenSize, screenStats, stageBounds } from './calc'
import { findPanel } from './panels'
import type { Selection } from '../store'

export interface Warning {
  level: 'warn' | 'error'
  text: string
  fix?: string
  workspace: Workspace
  target?: Selection
}

export function getWarnings(p: Project): Warning[] {
  const out: Warning[] = []
  const sb = stageBounds(p)

  // Rigging
  const rig = rigging(p)
  for (const s of rig.supports) {
    if (s.capacity === 0 && s.kg > 0)
      out.push({ level: 'error', text: `${s.label}: ${Math.round(s.kg)} kg hangs from a point with no hoist or tower.`, fix: 'Add a hoist on this truss, or turn on ground-support legs.', workspace: 'truss' })
    else if (s.kg > s.capacity)
      out.push({ level: 'error', text: `${s.label} carries ${Math.round(s.kg)} kg; its rating is ${s.capacity} kg.`, fix: 'Use Auto-rig, a bigger motor, or add another hoist to share the load.', workspace: 'truss', target: { kind: 'hoist', id: s.id } })
    else if (s.capacity > 0 && s.kg > s.capacity * 0.85)
      out.push({ level: 'warn', text: `${s.label} is at ${Math.round((s.kg / s.capacity) * 100)}% of its rating.`, fix: 'Keep a safety margin: add a hoist nearby.', workspace: 'truss', target: { kind: 'hoist', id: s.id } })
  }
  for (const t of rig.trusses) {
    if (t.spanLoad > t.allowable)
      out.push({ level: 'error', text: `A ${t.maxSpan.toFixed(1)} m span carries about ${Math.round(t.spanLoad)} kg; this truss is rated for about ${Math.round(t.allowable)} kg at that span.`, fix: 'Use Auto-rig, add a hoist mid-span, or use 40 cm truss.', workspace: 'truss', target: { kind: 'truss', id: t.truss.id } })
  }

  // LED
  const nearest = sb ? 3 : 4
  for (const s of p.screens) {
    const st = screenStats(s, p.customPanels)
    const pm = portMap(s, st.panel, p.processor.portPx)
    if (st.panel.pitch > nearest + 2 && !st.panel.outdoor)
      out.push({ level: 'warn', text: `${s.name}: P${st.panel.pitch} looks pixelated closer than ${st.panel.pitch} m.`, fix: 'Pick a finer pitch for indoor events.', workspace: 'led', target: { kind: 'screen', id: s.id } })
    if (s.mount === 'flown' && !p.truss.length)
      out.push({ level: 'error', text: `${s.name} is flown but there is no truss.`, fix: 'Draw a truss above it, or set the screen to ground-stacked.', workspace: 'truss', target: { kind: 'screen', id: s.id } })
    if (pm.ports.length > 16)
      out.push({ level: 'warn', text: `${s.name} needs ${pm.ports.length} data ports; most processors have 16 or fewer.`, fix: 'Split across two processors.', workspace: 'led', target: { kind: 'screen', id: s.id } })
    if (sb && s.mount === 'ground' && s.z < sb.h - 0.05 && s.y >= sb.y && s.y <= sb.y + sb.l && s.x < sb.x + sb.w && s.x + st.w > sb.x)
      out.push({ level: 'warn', text: `${s.name} starts below the stage floor.`, fix: `Raise it to at least ${sb.h} m.`, workspace: 'led', target: { kind: 'screen', id: s.id } })
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
      out.push({ level: 'error', text: `${s.name} is wider than the truss it hangs from.`, fix: 'Extend the truss.', workspace: 'truss', target: { kind: 'screen', id: s.id } })
  }

  // Ground plan
  if (!p.ground.some((g) => g.kind === 'exit')) out.push({ level: 'error', text: 'No emergency exit is marked on the ground plan.', fix: 'Add at least two exits.', workspace: 'ground' })
  const cap = capacity(p.ground)
  if (cap > 0 && p.audience > cap * 1.05) out.push({ level: 'warn', text: `Expected ${p.audience} people but the plan holds about ${cap}.`, fix: 'Enlarge the crowd or seating areas.', workspace: 'ground' })
  for (const g of p.ground) {
    if (g.x < -0.01 || g.y < -0.01 || g.x + g.w > p.venue.w + 0.01 || g.y + g.h > p.venue.l + 0.01)
      out.push({ level: 'warn', text: `${g.label} is outside the venue boundary.`, workspace: 'ground', target: { kind: 'ground', id: g.id } })
  }
  if (!sb) out.push({ level: 'warn', text: 'There is no stage yet.', fix: 'Pick a stage preset in the Stage workspace.', workspace: 'stage' })
  return out
}
