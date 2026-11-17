import { nanoid } from 'nanoid'
import type { Part, PartKind, PartMat, Project, Vec3 } from '../types'
import { setLine } from './setpieces'

// Catalogue of 3D primitives for the Model workspace. size: [across, depth, up] in metres.
export const PART_KINDS: Record<Exclude<PartKind, 'group'>, { name: string; size: Vec3; group: 'Basic' | 'Stage' | 'Advanced'; tip: string }> = {
  box: { name: 'Box', size: [2, 2, 2], group: 'Basic', tip: 'Cube or slab of any size. Round the edges with Bevel.' },
  cylinder: { name: 'Cylinder', size: [2, 2, 2], group: 'Basic', tip: 'Columns, drums, round podiums.' },
  sphere: { name: 'Sphere', size: [2, 2, 2], group: 'Basic', tip: 'Balls, globes, mirror balls.' },
  dome: { name: 'Dome', size: [4, 4, 2], group: 'Basic', tip: 'Half sphere: domes, canopies, pods.' },
  cone: { name: 'Cone', size: [2, 2, 3], group: 'Basic', tip: 'Spires, pyramids (set smoothness to 4).' },
  torus: { name: 'Ring', size: [4, 4, 4], group: 'Basic', tip: 'Donut or partial ring: halos, hoops, arches (set the sweep).' },
  plane: { name: 'Plane', size: [4, 4, 0.02], group: 'Basic', tip: 'Flat sheet: floors, banners, backdrops.' },
  stairs: { name: 'Stairs', size: [3, 2.4, 1.2], group: 'Stage', tip: 'Straight flight of steps up to a deck.' },
  ramp: { name: 'Ramp', size: [2, 4, 1], group: 'Stage', tip: 'Wedge: ramps, slopes, raked floors.' },
  text: { name: 'Text sign', size: [6, 0.1, 1.5], group: 'Stage', tip: 'Glowing or painted lettering: event names, sponsor words.' },
  lathe: { name: 'Spin (lathe)', size: [2, 2, 4], group: 'Advanced', tip: 'Draw a side profile and spin it: columns, vases, chandeliers, goblets.' },
  extrude: { name: 'Extrude shape', size: [4, 0.4, 4], group: 'Advanced', tip: 'Draw any outline and push it into a solid: stars, arches, logos, cut panels.' },
}

// Profiles: [u, v] with u = radius (lathe) or across (extrude) and v = up, both 0..1.
export const LATHE_PRESETS: Record<string, [number, number][]> = {
  Column: [[0, 0], [1, 0], [1, 0.06], [0.75, 0.1], [0.7, 0.9], [0.95, 0.94], [1, 1], [0, 1]],
  Vase: [[0, 0], [0.55, 0], [0.9, 0.3], [0.7, 0.75], [0.45, 0.85], [0.6, 1], [0, 1]],
  Goblet: [[0, 0], [0.7, 0], [0.12, 0.08], [0.12, 0.5], [0.9, 0.7], [1, 1], [0, 1]],
  Chandelier: [[0, 0], [0.2, 0.05], [0.9, 0.35], [1, 0.45], [0.5, 0.6], [0.25, 0.85], [0.1, 1], [0, 1]],
  Bell: [[0, 0], [1, 0], [0.85, 0.15], [0.55, 0.6], [0.35, 0.95], [0, 1]],
}
export const EXTRUDE_PRESETS: Record<string, [number, number][]> = {
  Star: Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.2 : 0.5
    const a = Math.PI / 2 + (i * Math.PI) / 5
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as [number, number]
  }),
  Arch: [[0, 0], [0.2, 0], [0.2, 0.6], ...Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI - (i * Math.PI) / 8
    return [0.5 + Math.cos(a) * 0.3, 0.6 + Math.sin(a) * 0.3] as [number, number]
  }), [0.8, 0.6], [0.8, 0], [1, 0], [1, 0.6], ...Array.from({ length: 9 }, (_, i) => {
    const a = (i * Math.PI) / 8
    return [0.5 + Math.cos(a) * 0.5, 0.6 + Math.sin(a) * 0.4] as [number, number]
  }), [0, 0.6]],
  Hexagon: Array.from({ length: 6 }, (_, i) => [0.5 + Math.cos((i * Math.PI) / 3) / 2, 0.5 + Math.sin((i * Math.PI) / 3) / 2] as [number, number]),
  Heart: Array.from({ length: 32 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2
    return [0.5 + (16 * Math.sin(t) ** 3) / 34, 0.55 + (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34] as [number, number]
  }),
  Arrow: [[0, 0.35], [0.6, 0.35], [0.6, 0.1], [1, 0.5], [0.6, 0.9], [0.6, 0.65], [0, 0.65]],
  'L shape': [[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]],
}

export const MAT_PRESETS: Record<string, PartMat> = {
  'Matte black': { color: '#151515', metal: 0, rough: 0.9 },
  'Gloss white': { color: '#f2f2f2', metal: 0, rough: 0.15 },
  Gold: { color: '#d4a64a', metal: 1, rough: 0.25 },
  Chrome: { color: '#e8e8e8', metal: 1, rough: 0.05 },
  'Brushed steel': { color: '#a8a8a8', metal: 1, rough: 0.45 },
  Wood: { color: '#7a5230', metal: 0, rough: 0.7 },
  Velvet: { color: '#6b1030', metal: 0, rough: 1 },
  Glass: { color: '#cfe8ff', metal: 0, rough: 0.05, opacity: 0.3 },
  'Neon glow': { color: '#ff2d95', metal: 0, rough: 0.5, glow: 2.5 },
  'LED content': { color: '#ffffff', metal: 0, rough: 0.6, led: true },
}

export function newPart(kind: PartKind, pos: Vec3, extra: Partial<Part> = {}): Part {
  const k = kind === 'group' ? null : PART_KINDS[kind]
  const [w, d, h] = k?.size ?? [1, 1, 1]
  return {
    id: nanoid(8),
    name: k?.name ?? 'Group',
    kind,
    pos,
    rot: [0, 0, 0],
    scl: [1, 1, 1],
    w,
    d,
    h,
    seg: kind === 'cone' || kind === 'cylinder' || kind === 'lathe' ? 32 : undefined,
    steps: kind === 'stairs' ? 6 : undefined,
    arc: kind === 'torus' ? 360 : kind === 'dome' ? 180 : undefined,
    thick: kind === 'torus' ? 0.25 : undefined,
    bevel: kind === 'extrude' ? 0.03 : undefined,
    profile: kind === 'lathe' ? LATHE_PRESETS.Column : kind === 'extrude' ? EXTRUDE_PRESETS.Star : undefined,
    text: kind === 'text' ? 'UNIFEST' : undefined,
    mat: kind === 'text' ? { color: '#ffffff', metal: 0, rough: 0.5, glow: 1.5 } : { color: '#d9d9d9', metal: 0, rough: 0.6 },
    ...extra,
  }
}

// ---------- tree helpers ----------

export const childrenOf = (parts: Part[], id?: string) => parts.filter((p) => p.parent === id)

export function descendants(parts: Part[], id: string): Part[] {
  const out: Part[] = []
  const walk = (pid: string) => childrenOf(parts, pid).forEach((c) => (out.push(c), walk(c.id)))
  walk(id)
  return out
}

// Copy parts (and everything inside groups) with new ids, nudged so the copy is visible.
export function duplicate(parts: Part[], ids: string[], nudge: Vec3 = [1, 0, 0]): Part[] {
  const roots = ids.filter((id) => !ids.some((o) => o !== id && descendants(parts, o).some((d) => d.id === id)))
  const map = new Map<string, string>()
  const out: Part[] = []
  for (const id of roots) {
    const src = parts.find((p) => p.id === id)
    if (!src) continue
    for (const p of [src, ...descendants(parts, id)]) map.set(p.id, nanoid(8))
    for (const p of [src, ...descendants(parts, id)]) {
      const c: Part = { ...structuredClone(p), id: map.get(p.id)!, parent: p.parent && map.has(p.parent) ? map.get(p.parent) : p.parent }
      if (p.id === id) c.pos = [p.pos[0] + nudge[0], p.pos[1] + nudge[1], p.pos[2] + nudge[2]]
      out.push(c)
    }
  }
  return out
}

// Put the selected parts in a new group at their average position (keeps their world placement).
export function groupParts(parts: Part[], ids: string[]): { parts: Part[]; group?: Part } {
  const sel = parts.filter((p) => ids.includes(p.id))
  if (!sel.length) return { parts }
  const parent = sel[0].parent
  const same = sel.filter((p) => p.parent === parent)
  const c: Vec3 = [0, 1, 2].map((i) => same.reduce((a, p) => a + p.pos[i], 0) / same.length) as Vec3
  c[2] = Math.min(...same.map((p) => p.pos[2]))
  const g = newPart('group', c, { name: `Group ${parts.filter((p) => p.kind === 'group').length + 1}`, parent })
  const next = parts.map((p) => (same.includes(p) ? { ...p, parent: g.id, pos: [p.pos[0] - c[0], p.pos[1] - c[1], p.pos[2] - c[2]] as Vec3 } : p))
  return { parts: [...next, g], group: g }
}

// Dissolve a group: children move up a level (a plain offset; group rotation and scale are dropped if any).
export function ungroup(parts: Part[], id: string): Part[] {
  const g = parts.find((p) => p.id === id && p.kind === 'group')
  if (!g) return parts
  return parts
    .filter((p) => p.id !== id)
    .map((p) => (p.parent === id ? { ...p, parent: g.parent, pos: [p.pos[0] + g.pos[0], p.pos[1] + g.pos[1], p.pos[2] + g.pos[2]] as Vec3 } : p))
}

export function removeParts(parts: Part[], ids: string[]): Part[] {
  const gone = new Set(ids.flatMap((id) => [id, ...descendants(parts, id).map((d) => d.id)]))
  return parts.filter((p) => !gone.has(p.id))
}

// How many copies a part makes (array modifier and mirror).
export const copies = (p: Part) => Math.max(1, p.array?.count ?? 1) * (p.mirror ? 2 : 1)

// Rough surface area for the quote (box around the part, all copies).
export function partArea(p: Part) {
  if (p.kind === 'group') return 0
  const [sx, sy, sz] = p.scl.map(Math.abs)
  const w = p.w * sx
  const d = p.d * sy
  const h = p.h * sz
  const a = p.kind === 'plane' || p.kind === 'text' ? w * h : 2 * (w * h + w * d + h * d)
  return a * copies(p)
}

// ---------- ready-made assemblies ----------

export type AssemblyId = 'staircase' | 'colonnade' | 'podium' | 'chandelier' | 'portal' | 'dome-pavilion'
export const ASSEMBLIES: { id: AssemblyId; name: string; blurb: string }[] = [
  { id: 'staircase', name: 'Grand staircase', blurb: 'Wide steps with side walls, up to the stage' },
  { id: 'colonnade', name: 'Colonnade', blurb: 'Row of turned columns made with Array' },
  { id: 'podium', name: 'Tiered podium', blurb: 'Three round tiers with glowing edges' },
  { id: 'chandelier', name: 'Chandelier', blurb: 'Spun body with a ring of bulbs (radial array)' },
  { id: 'portal', name: 'Gold portal', blurb: 'Extruded arch with bevel, in gold' },
  { id: 'dome-pavilion', name: 'Dome pavilion', blurb: 'Dome on six columns: mandap or VIP' },
]

export function buildAssembly(p: Project, id: AssemblyId): Part[] {
  const L = setLine(p)
  const at: Vec3 = [L.cx, L.front + 3, 0]
  const g = newPart('group', at, { name: ASSEMBLIES.find((a) => a.id === id)!.name })
  const kid = (kind: PartKind, pos: Vec3, extra: Partial<Part> = {}) => newPart(kind, pos, { parent: g.id, ...extra })
  const gold = MAT_PRESETS.Gold
  let kids: Part[] = []
  if (id === 'staircase') {
    const h = Math.max(0.6, L.deckH || 1.2)
    g.pos = [L.cx, L.front, 0]
    kids = [
      kid('stairs', [0, 1.5, 0], { w: 6, d: 3, h, steps: Math.max(3, Math.round(h / 0.18)), mat: MAT_PRESETS['Matte black'] }),
      kid('box', [-3.15, 1.5, 0], { w: 0.3, d: 3, h: h + 0.9, mat: MAT_PRESETS['Gloss white'], bevel: 0.03 }),
      kid('box', [3.15, 1.5, 0], { w: 0.3, d: 3, h: h + 0.9, mat: MAT_PRESETS['Gloss white'], bevel: 0.03 }),
    ]
  } else if (id === 'colonnade') {
    kids = [kid('lathe', [-7.5, 0, 0], { name: 'Column', w: 0.8, d: 0.8, h: 6, profile: LATHE_PRESETS.Column, mat: MAT_PRESETS['Gloss white'], array: { mode: 'linear', count: 6, offset: [3, 0, 0] } })]
  } else if (id === 'podium') {
    kids = [0, 1, 2].map((i) =>
      kid('cylinder', [0, 0, i * 0.4], { name: `Tier ${i + 1}`, w: 6 - i * 1.6, d: 6 - i * 1.6, h: 0.4, seg: 48, mat: i === 2 ? MAT_PRESETS['Neon glow'] : MAT_PRESETS['Gloss white'] }),
    )
  } else if (id === 'chandelier') {
    g.pos = [L.cx, L.front + 3, 6]
    kids = [
      kid('lathe', [0, 0, 0], { name: 'Body', w: 1.6, d: 1.6, h: 2, profile: LATHE_PRESETS.Chandelier, mat: gold }),
      kid('torus', [0, 0, 0.7], { name: 'Ring', w: 2.6, d: 2.6, h: 2.6, thick: 0.05, rot: [90, 0, 0], mat: gold }),
      kid('sphere', [0, 0, 0.75], { name: 'Bulbs', w: 0.18, d: 0.18, h: 0.18, mat: { color: '#ffd27a', metal: 0, rough: 0.3, glow: 3 }, array: { mode: 'radial', count: 12, offset: [0, 0, 0], radius: 1.3, angle: 360 } }),
    ]
  } else if (id === 'portal') {
    kids = [kid('extrude', [0, 0, 0], { name: 'Portal', w: 10, d: 0.6, h: 9, profile: EXTRUDE_PRESETS.Arch, bevel: 0.08, mat: gold })]
  } else if (id === 'dome-pavilion') {
    kids = [
      kid('cylinder', [0, 0, 0], { name: 'Floor', w: 6, d: 6, h: 0.3, seg: 6, mat: MAT_PRESETS['Gloss white'] }),
      kid('cylinder', [0, 0, 0.3], { name: 'Column', w: 0.35, d: 0.35, h: 3.5, mat: gold, array: { mode: 'radial', count: 6, offset: [0, 0, 0], radius: 2.6, angle: 360 } }),
      kid('dome', [0, 0, 3.8], { name: 'Dome', w: 6, d: 6, h: 2.6, mat: MAT_PRESETS['Gloss white'] }),
    ]
  }
  return [g, ...kids]
}
