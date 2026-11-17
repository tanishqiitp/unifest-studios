import { describe, expect, it } from 'vitest'
import { generateProject, TEMPLATES } from '../templates'
import { ASSEMBLIES, buildAssembly, childrenOf, copies, duplicate, groupParts, newPart, partArea, removeParts, ungroup } from '../parts'
import { fullEquipment } from '../quote'
import { liteProject } from '../export/files'

const proj = () => generateProject(TEMPLATES[0])

describe('3D parts', () => {
  it('every ready-made piece builds a group with parts inside', () => {
    for (const a of ASSEMBLIES) {
      const ps = buildAssembly(proj(), a.id)
      expect(ps[0].kind).toBe('group')
      expect(childrenOf(ps, ps[0].id).length).toBeGreaterThan(0)
    }
  })

  it('duplicating a group copies its children with new ids', () => {
    const ps = buildAssembly(proj(), 'podium')
    const dup = duplicate(ps, [ps[0].id])
    expect(dup.length).toBe(ps.length)
    expect(new Set(dup.map((d) => d.id)).size).toBe(dup.length)
    expect(dup.every((d) => !ps.some((p) => p.id === d.id))).toBe(true)
    expect(childrenOf(dup, dup[0].id).length).toBe(childrenOf(ps, ps[0].id).length)
  })

  it('group then ungroup keeps world positions', () => {
    const a = newPart('box', [10, 4, 0])
    const b = newPart('box', [14, 4, 2])
    const g = groupParts([a, b], [a.id, b.id])
    expect(g.group).toBeDefined()
    const back = ungroup(g.parts, g.group!.id)
    expect(back.find((p) => p.id === a.id)!.pos).toEqual([10, 4, 0])
    expect(back.find((p) => p.id === b.id)!.pos).toEqual([14, 4, 2])
  })

  it('removing a group removes everything inside', () => {
    const ps = buildAssembly(proj(), 'chandelier')
    expect(removeParts(ps, [ps[0].id])).toEqual([])
  })

  it('arrays and mirrors count in the area and the quote', () => {
    const p = proj()
    const box = newPart('box', [0, 0, 0], { w: 1, d: 1, h: 1, array: { mode: 'linear', count: 3, offset: [2, 0, 0] }, mirror: true })
    expect(copies(box)).toBe(6)
    expect(partArea(box)).toBeCloseTo(36)
    p.parts = [box]
    expect(fullEquipment(p).some((r) => r.item.startsWith('Custom 3D fabrication'))).toBe(true)
  })

  it('client links keep parts but drop textures unless images are allowed', () => {
    const p = proj()
    p.parts = [newPart('box', [0, 0, 0], { mat: { color: '#fff', metal: 0, rough: 1, map: 'data:image/png;base64,AA' } })]
    expect(liteProject(p).parts?.[0].mat.map).toBeUndefined()
    expect(liteProject(p, true).parts?.[0].mat.map).toBeDefined()
  })
})

describe('festival stage builder', () => {
  it('builds an editable tree: stage → centre and wings → panels', async () => {
    const { buildAssembly, childrenOf } = await import('../parts')
    const { generateProject, TEMPLATES } = await import('../templates')
    const parts = buildAssembly(generateProject(TEMPLATES[0]), 'festival')
    const root = parts.find((x) => !x.parent)!
    const names = childrenOf(parts, root.id).map((x) => x.name)
    expect(names).toEqual(expect.arrayContaining(['Platform', 'Centre structure', 'Left wing', 'Right wing', 'Left tower', 'Right tower']))
    const centre = parts.find((x) => x.name === 'Centre structure')!
    expect(childrenOf(parts, centre.id).filter((x) => /Arch/.test(x.name))).toHaveLength(3)
  })
  it('arrays grow, mirror symmetrically and alternate', async () => {
    const { instances } = await import('../partArrays')
    const { newPart } = await import('../parts')
    const p = newPart('box', [0, 0, 0], { array: { mode: 'linear', count: 5, offset: [1, 0, 0], grow: 0.1, symmetric: true, alt: '#fff' } })
    const ins = instances(p)
    expect(ins).toHaveLength(5)
    expect(ins.filter((i) => i.flip)).toHaveLength(2)
    expect(Math.max(...ins.map((i) => i.sy))).toBeCloseTo(1.2)
    expect(ins.some((i) => i.alt)).toBe(true)
  })
})
