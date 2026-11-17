import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { fitRectInside, fixGroundInside, stageFit } from '../fixes'
import { getWarnings } from '../warnings'
import { stageBounds } from '../calc'
import type { Project } from '../../types'
const sb0 = (p: Project) => { const b = stageBounds(p)!; return b.x + b.w }

describe('one-click fixes', () => {
  it('moves and shrinks a rectangle inside the venue', () => {
    const r = { x: -5, y: 70, w: 80, h: 20 }
    fitRectInside(r, 50, 80)
    expect(r).toEqual({ x: 0, y: 60, w: 50, h: 20 })
  })

  it('fixes a ground item outside the venue and the warning goes away', () => {
    const p = generateProject(TEMPLATES[0])
    const g = p.ground.find((x) => x.kind === 'foh')!
    g.x = p.venue.w + 5
    expect(getWarnings(p).some((w) => w.target?.id === g.id && w.action)).toBe(true)
    fixGroundInside(g.id).apply(p)
    expect(getWarnings(p).some((w) => w.target?.id === g.id && /outside/.test(w.text))).toBe(false)
  })
})

describe('keeping screens and truss in step with the stage', () => {
  it('suggests nothing for the ready-made templates', () => {
    for (const t of TEMPLATES) expect(stageFit(generateProject(t)), t.name).toBeNull()
  })

  it('centres the main screen, extends truss and never shrinks it after the stage widens', () => {
    const p = generateProject(TEMPLATES[0])
    const before = stageBounds(p)!
    // Widen the stage by 6 m on the right.
    const d = p.decks.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b))
    p.decks.push({ ...d, id: 'wide', x: d.x + d.w, w: 6 })
    const fit = stageFit(p)
    expect(fit).not.toBeNull()
    const trussBefore = p.truss.map((t) => Math.abs(t.x2 - t.x1))
    // A short truss piece next to the stage (like a DJ bar) must not be stretched.
    p.truss.push({ ...p.truss[0], id: 'short', x1: sb0(p) - 1, x2: sb0(p), y1: p.truss[0].y1, y2: p.truss[0].y1, legs: false })
    trussBefore.push(1)
    fit!.apply(p)
    const sb = stageBounds(p)!
    expect(sb.w).toBeGreaterThan(before.w)
    p.truss.forEach((t, i) => expect(Math.abs(t.x2 - t.x1)).toBeGreaterThanOrEqual(trussBefore[i] - 1e-9))
    // Applying again changes nothing more.
    expect(stageFit(p)).toBeNull()
    // Short truss pieces are never stretched.
    p.truss.forEach((t, i) => trussBefore[i] < 3 && expect(Math.abs(t.x2 - t.x1)).toBeCloseTo(trussBefore[i], 6))
  })
})
