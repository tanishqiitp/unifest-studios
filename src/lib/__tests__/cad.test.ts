import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { applyBox, cadItems, fromRect, toRect } from '../cad'
import { themeColor, useTheme } from '../theme'

const proj = () => generateProject(TEMPLATES[0])

describe('CAD views', () => {
  it('lists decks, truss, lights and screens as boxes', () => {
    const p = proj()
    const items = cadItems(p)
    expect(items.filter((i) => i.kind === 'deck').length).toBe(p.decks.length)
    expect(items.filter((i) => i.kind === 'screen').length).toBe(p.screens.length)
    for (const i of items) expect(i.box.x1 >= i.box.x0 && i.box.z1 >= i.box.z0).toBe(true)
  })

  it('rects round-trip in every view', () => {
    const b = { x0: 1, x1: 3, y0: 4, y1: 7, z0: 2, z1: 5 }
    for (const v of ['front', 'top', 'side'] as const) expect(fromRect(b, v, toRect(b, v))).toEqual(b)
  })

  it('raising a truss in the side view changes its trim height only', () => {
    const p = proj()
    const t = p.truss[0]
    const item = cadItems(p).find((i) => i.id === t.id)!
    const r = toRect(item.box, 'side')
    const before = { x1: t.x1, h: t.height }
    applyBox(p, 'truss', t.id, item.box, fromRect(item.box, 'side', { ...r, y: r.y - 1 }))
    expect(t.height).toBeCloseTo(before.h + 1)
    expect(t.x1).toBe(before.x1)
  })

  it('a deck made taller in the front view keeps standing on the ground', () => {
    const p = proj()
    const d = p.decks[0]
    const item = cadItems(p).find((i) => i.id === d.id)!
    applyBox(p, 'deck', d.id, item.box, { ...item.box, z1: 1.8 })
    expect(d.h).toBe(1.8)
  })

  it('light mode flips greys but keeps real colours', () => {
    useTheme.getState().setTheme('light')
    expect(themeColor('#000000')).toBe('rgba(255,255,255,1)')
    expect(themeColor('#ffffff40')).toMatch(/^rgba\(0,0,0,0\.25/)
    expect(themeColor('#e5484d')).toBe('#e5484d')
    useTheme.getState().setTheme('dark')
    expect(themeColor('#000000')).toBe('#000000')
  })
})

describe('real colours', () => {
  it('are never flipped in light mode', async () => {
    const { real } = await import('../theme')
    useTheme.getState().setTheme('light')
    expect(themeColor(real('#ffffff'))).toBe('#ffffff')
    useTheme.getState().setTheme('dark')
  })
})
