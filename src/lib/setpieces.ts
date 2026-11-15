import { nanoid } from 'nanoid'
import type { Project, SetKind, SetPiece, Skin } from '../types'

// Catalogue of scenic blocks: default size (w × h × d, metres), skin and a one-line note.
export const SET_KINDS: Record<SetKind, { name: string; size: [number, number, number]; skin: Skin; tip: string; group: 'Structure' | 'Shapes' | 'Props' | 'Site' | 'Drawn' }> = {
  tower: { name: 'Tower', size: [3, 10, 2], skin: 'led', group: 'Structure', tip: 'Tall upright block: facade towers and wings.' },
  block: { name: 'Block', size: [4, 3, 1], skin: 'black', group: 'Structure', tip: 'A box of any size: plinths, walls, header beams.' },
  booth: { name: 'DJ booth', size: [4, 1.2, 1.5], skin: 'led', group: 'Structure', tip: 'DJ or host booth with a front face.' },
  pod: { name: 'Pod / drum', size: [3, 2, 3], skin: 'mirror', group: 'Structure', tip: 'Round riser or drum: DJ pods, dancer podiums.' },
  scaffold: { name: 'Scaffold tower', size: [3, 12, 3], skin: 'black', group: 'Structure', tip: 'Layher-style scaffold: delay towers, side towers, rigging points.' },
  frame: { name: 'Frame', size: [6, 5, 0.6], skin: 'gold', group: 'Shapes', tip: 'Rectangular frame with an opening: picture frames, gates, portals.' },
  arch: { name: 'Arch', size: [10, 8, 0.8], skin: 'led', group: 'Shapes', tip: 'Half-round arch over the stage or an entry.' },
  ring: { name: 'Ring / circle', size: [8, 8, 0.6], skin: 'led', group: 'Shapes', tip: 'Full circle: halo, portal, logo ring.' },
  logo: { name: 'Logo sign', size: [6, 2, 0.2], skin: 'print', group: 'Props', tip: 'Flat sign with your logo or artwork, lit from the front.' },
  cutout: { name: 'Cut-out (PNG)', size: [4, 5, 0.1], skin: 'print', group: 'Props', tip: 'Upload a PNG with a transparent background: characters, mascots, birds.' },
  balloon: { name: 'Balloon', size: [4, 4, 4], skin: 'print', group: 'Props', tip: 'Branded hot-air or helium balloon.' },
  tent: { name: 'Tent / canopy', size: [4, 4, 4], skin: 'white', group: 'Site', tip: 'Pagoda tent: ticketing, VIP, merch.' },
  stall: { name: 'Food stall', size: [3, 3, 3], skin: 'paint', group: 'Site', tip: 'Stall with counter and printed fascia.' },
  shape: { name: 'Drawn shape', size: [3, 3, 0.5], skin: 'paint', group: 'Drawn', tip: 'A shape you drew, pushed out into a solid. Change the push-out to make it thicker.' },
  line: { name: 'Drawn line', size: [4, 0.15, 0.15], skin: 'white', group: 'Drawn', tip: 'A line you drew: pipes, beams, neon strips. Thickness sets how fat it is.' },
}

export const SKINS: { id: Skin; name: string }[] = [
  { id: 'led', name: 'LED screen' },
  { id: 'print', name: 'Printed flex' },
  { id: 'fabric', name: 'Fabric' },
  { id: 'mirror', name: 'Mirror' },
  { id: 'gold', name: 'Gold ornate' },
  { id: 'wood', name: 'Wood' },
  { id: 'black', name: 'Black' },
  { id: 'white', name: 'White' },
  { id: 'paint', name: 'Paint colour' },
]

const OPENING: SetKind[] = ['frame', 'arch', 'ring']
export const hasOpening = (k: SetKind) => OPENING.includes(k)

export function newPiece(kind: SetKind, x: number, y: number, extra: Partial<SetPiece> = {}): SetPiece {
  const k = SET_KINDS[kind]
  const [w, h, d] = k.size
  return {
    id: nanoid(8),
    kind,
    x,
    y,
    z: 0,
    w,
    h,
    d,
    skin: k.skin,
    color: kind === 'stall' ? '#c0392b' : '#ffffff',
    label: k.name,
    ...(hasOpening(kind) ? { border: kind === 'frame' ? 0.6 : 0.8, inner: kind === 'frame' ? 'led' : 'open' } : {}),
    ...extra,
  }
}

// Mirrored pieces copy their source and flip across the venue centre line.
export function syncSetMirrors(p: Project) {
  if (!p.set?.length) return
  const axis = p.venue.w / 2
  p.set = p.set.map((s) => {
    if (!s.mirrorOf) return s
    const src = p.set!.find((x) => x.id === s.mirrorOf)
    if (!src) return { ...s, mirrorOf: undefined }
    const pts = src.pts && src.plane !== 'side' ? src.pts.map(([u, v]) => [1 - u, v] as [number, number]) : src.pts
    return { ...src, id: s.id, mirrorOf: src.id, label: s.label, x: 2 * axis - src.x, rot: src.rot ? -src.rot : src.rot, pts }
  })
}

// Where the set sits by default: on the upstage line of the stage, or at the back of the venue.
export function setLine(p: Project) {
  const xs = p.decks.flatMap((d) => [d.x, d.x + d.w])
  const ys = p.decks.flatMap((d) => [d.y, d.y + d.l])
  if (!xs.length) return { cx: p.venue.w / 2, y: 1, w: Math.min(30, p.venue.w * 0.6), deckH: 0, front: 6 }
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) + 0.4, w: Math.max(...xs) - Math.min(...xs), deckH: Math.max(...p.decks.map((d) => d.h)), front: Math.max(...ys) }
}

// ---------- kits: ready-made sets the user edits ----------

export type KitId = 'festival' | 'carnival' | 'arch-stage' | 'dj-pod' | 'royal' | 'techno-grid'

export const KITS: { id: KitId; name: string; blurb: string }[] = [
  { id: 'festival', name: 'Festival main stage', blurb: 'LED towers, header, side wings and scaffold PA towers.' },
  { id: 'carnival', name: 'Carnival facade', blurb: 'Gold frames with LED inside, bulb borders, a mascot cut-out.' },
  { id: 'arch-stage', name: 'Arch stage', blurb: 'Big LED arch with a halo ring and side towers.' },
  { id: 'techno-grid', name: 'Techno grid', blurb: 'Rows of LED columns with neon outlines.' },
  { id: 'dj-pod', name: 'DJ pod', blurb: 'Mirror pod, LED booth and a back ring.' },
  { id: 'royal', name: 'Royal / wedding', blurb: 'White and gold frames with a central arch.' },
]

export function buildKit(p: Project, kit: KitId): SetPiece[] {
  const L = setLine(p)
  const cx = L.cx
  const W = Math.max(14, L.w)
  const y = L.y
  const z0 = L.deckH
  const out: SetPiece[] = []
  // Adds a piece and, when `pair` is set, its live mirror on the other side.
  const add = (kind: SetKind, x: number, extra: Partial<SetPiece> = {}, pair = false) => {
    const a = newPiece(kind, x, y, extra)
    out.push(a)
    if (pair) out.push({ ...a, id: nanoid(8), x: 2 * (p.venue.w / 2) - x, mirrorOf: a.id })
    return a
  }
  const bulbs = { style: 'bulb' as const, color: '#ffd27a', chase: true }
  const neon = (color: string) => ({ style: 'neon' as const, color, chase: false })

  if (kit === 'festival') {
    add('tower', cx - W / 2 + 1.5, { w: 3, h: 11, z: 0 }, true)
    add('tower', cx - W / 2 + 4.5, { w: 3, h: 8.5, z: 0 }, true)
    add('block', cx, { w: W - 6, h: 2, z: 9, skin: 'led', label: 'Header' })
    add('scaffold', cx - W / 2 - 3, { w: 3, h: 13, label: 'PA tower' }, true)
    add('block', cx - W / 2 - 7, { w: 6, h: 6, z: 0, skin: 'led', label: 'Side wing' }, true)
    add('booth', cx, { z: z0, y: L.front - 3, label: 'DJ booth' })
    add('logo', cx, { w: 7, h: 1.6, z: 11.3, label: 'Logo' })
  }
  if (kit === 'carnival') {
    add('frame', cx, { w: 9, h: 9, z: 0, skin: 'gold', inner: 'led', outline: bulbs })
    add('frame', cx - 9, { w: 7, h: 7, z: 0, skin: 'gold', inner: 'led', outline: bulbs }, true)
    add('frame', cx - 16, { w: 6, h: 6, z: 0, skin: 'gold', inner: 'led', outline: bulbs }, true)
    add('logo', cx, { w: 6, h: 1.4, z: 9.3, skin: 'print', color: '#b3122b', label: 'Logo' })
    add('cutout', cx + 6, { w: 4, h: 5, z: 7, label: 'Mascot cut-out' })
    add('frame', cx, { w: 12, h: 7, y: L.front + 25, z: 0, skin: 'paint', color: '#d6262c', inner: 'open', border: 0.9, label: 'Sponsor gate' })
    add('tent', cx - 14, { y: L.front + 30, color: '#d6262c', skin: 'paint' }, true)
  }
  if (kit === 'arch-stage') {
    add('arch', cx, { w: Math.min(16, W), h: 10, z: 0, border: 1.2, inner: 'open' })
    add('ring', cx, { w: 6, h: 6, z: z0 + 2.5, y: y - 0.6, inner: 'led', border: 0.5, outline: neon('#ff2d55') })
    add('tower', cx - Math.min(16, W) / 2 - 2.5, { w: 3, h: 9 }, true)
    add('booth', cx, { z: z0, y: L.front - 3 })
  }
  if (kit === 'techno-grid') {
    const n = 6
    for (let i = 0; i < n / 2; i++) add('tower', cx - 1.5 - i * 3, { w: 1.6, h: 6 + (n / 2 - i) * 1.5, outline: neon('#22d3ee') }, true)
    add('block', cx, { w: W, h: 1.2, z: 11, skin: 'led', label: 'Header', outline: neon('#22d3ee') })
    add('booth', cx, { z: z0, y: L.front - 3, outline: neon('#22d3ee') })
  }
  if (kit === 'dj-pod') {
    add('pod', cx, { z: z0, y: L.front - 4, w: 4, d: 4, h: 1.2, skin: 'mirror' })
    add('booth', cx, { z: z0 + 1.2, y: L.front - 4, w: 3, h: 1.1, d: 1.2 })
    add('ring', cx, { w: 9, h: 9, z: z0, inner: 'open', border: 0.7, outline: neon('#a855f7') })
    add('tower', cx - 7, { w: 2, h: 7 }, true)
  }
  if (kit === 'royal') {
    add('arch', cx, { w: 10, h: 8, z: z0, skin: 'white', inner: 'fabric', border: 1, outline: bulbs })
    add('frame', cx - 8, { w: 5, h: 6, z: z0, skin: 'gold', inner: 'fabric', color: '#f5f0e6' }, true)
    add('block', cx, { w: W, h: 0.8, z: z0 + 8.5, skin: 'gold', label: 'Header' })
  }
  return out
}

// ---------- themes: restyle every piece in one click ----------

export type ThemeId = 'carnival' | 'cyber' | 'royal' | 'tropical' | 'minimal'
export const THEMES: { id: ThemeId; name: string; swatch: string[] }[] = [
  { id: 'carnival', name: 'Carnival', swatch: ['#c9a14a', '#d6262c', '#ffd27a'] },
  { id: 'cyber', name: 'Cyber / techno', swatch: ['#0b0b0b', '#22d3ee', '#a855f7'] },
  { id: 'royal', name: 'Royal / wedding', swatch: ['#ffffff', '#c9a14a', '#f5f0e6'] },
  { id: 'tropical', name: 'Tropical', swatch: ['#a0522d', '#2ecc71', '#ff8c42'] },
  { id: 'minimal', name: 'Minimal', swatch: ['#000000', '#ffffff', '#555555'] },
]

export function applyTheme(set: SetPiece[], theme: ThemeId): SetPiece[] {
  return set.map((s) => {
    if (s.kind === 'cutout' || s.kind === 'logo') return s
    const led = s.skin === 'led'
    const t = { ...s }
    if (theme === 'carnival') {
      if (!led) t.skin = hasOpening(s.kind) ? 'gold' : 'paint'
      t.color = '#d6262c'
      t.outline = { style: 'bulb', color: '#ffd27a', chase: true }
    }
    if (theme === 'cyber') {
      if (!led) t.skin = 'black'
      t.outline = { style: 'neon', color: '#22d3ee', chase: false }
    }
    if (theme === 'royal') {
      if (!led) t.skin = hasOpening(s.kind) ? 'gold' : 'white'
      t.color = '#f5f0e6'
      t.outline = hasOpening(s.kind) ? { style: 'bulb', color: '#fff3d6', chase: false } : undefined
    }
    if (theme === 'tropical') {
      if (!led) t.skin = 'wood'
      t.color = '#2ecc71'
      t.outline = { style: 'bulb', color: '#ff8c42', chase: true }
    }
    if (theme === 'minimal') {
      if (!led) t.skin = 'black'
      t.outline = undefined
    }
    return t
  })
}

// Bounding box of all LED-skinned faces, so one picture can be spread across them.
export function ledBounds(set: SetPiece[]) {
  const led = set.filter((s) => s.skin === 'led' || s.inner === 'led')
  if (!led.length) return null
  const x0 = Math.min(...led.map((s) => s.x - s.w / 2))
  const x1 = Math.max(...led.map((s) => s.x + s.w / 2))
  const z0 = Math.min(...led.map((s) => s.z))
  const z1 = Math.max(...led.map((s) => s.z + s.h))
  return { x0, x1, z0, z1 }
}

// LED area for the quote and HUD: whole face, or the opening of a frame/arch/ring filled with LED.
export function setLedArea(s: SetPiece) {
  if (s.kind === 'line') return s.skin === 'led' ? lineLength(s) * (s.border ?? 0.15) : 0
  if (s.kind === 'shape') return s.skin === 'led' ? ((s.plane ?? 'front') === 'front' ? polyArea(s.pts ?? []) * s.w * s.h : s.w * s.h) : 0
  const b = s.border ?? 0
  const face = s.kind === 'ring' ? Math.PI * (s.w / 2) ** 2 : s.kind === 'arch' ? s.w * (s.h - s.w / 2) + (Math.PI * (s.w / 2) ** 2) / 2 : s.w * s.h
  const open = hasOpening(s.kind) ? (s.kind === 'ring' ? Math.PI * Math.max(0, s.w / 2 - b) ** 2 : Math.max(0, s.w - 2 * b) * Math.max(0, s.h - 2 * b)) : 0
  let a = 0
  if (s.skin === 'led') a += hasOpening(s.kind) ? face - open : face
  if (s.inner === 'led') a += open
  return a
}

// Points along a piece's outline in its local front-view frame (y down from its top).
export function outlinePoints(s: SetPiece, step: number): [number, number][] {
  const W = s.w
  const H = s.h
  const pts: [number, number][] = []
  if ((s.kind === 'shape' || s.kind === 'line') && s.pts && (s.plane ?? 'front') === 'front') {
    const loop = s.pts.map(([u, v]) => [u * W, (1 - v) * H] as [number, number])
    const n = s.kind === 'shape' ? loop.length : loop.length - 1
    for (let i = 0; i < n; i++) {
      const [x0, y0] = loop[i]
      const [x1, y1] = loop[(i + 1) % loop.length]
      const k = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
      for (let j = 0; j < k; j++) pts.push([x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k])
    }
    if (s.kind === 'line') pts.push(loop[loop.length - 1])
    return pts
  }
  if (s.kind === 'ring' || s.kind === 'balloon') {
    const r = Math.min(W, H) / 2
    const n = Math.max(12, Math.round((2 * Math.PI * r) / step))
    for (let i = 0; i < n; i++) pts.push([W / 2 + Math.cos((i / n) * Math.PI * 2) * r, (s.kind === 'balloon' ? r : H / 2) + Math.sin((i / n) * Math.PI * 2) * r])
    return pts
  }
  if (s.kind === 'arch') {
    const r = W / 2
    const legs = Math.max(0, H - r)
    for (let y = H; y > r; y -= step) pts.push([0, y])
    const n = Math.max(8, Math.round((Math.PI * r) / step))
    for (let i = 0; i <= n; i++) pts.push([r - Math.cos((i / n) * Math.PI) * r, r - Math.sin((i / n) * Math.PI) * r])
    for (let y = r; y <= H; y += step) pts.push([W, y])
    void legs
    return pts
  }
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  }
  edge(0, 0, W, 0)
  edge(W, 0, W, H)
  edge(W, H, 0, H)
  edge(0, H, 0, 0)
  return pts
}


// ---------- drawing (CAD-style sketches) ----------

export type DrawTool = 'rect' | 'circle' | 'triangle' | 'poly' | 'line'

// Shoelace area of a closed polygon.
export function polyArea(pts: [number, number][]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return Math.abs(a) / 2
}

// Size of the sketch plane (u, v) and the push-out, in metres.
export function planeSize(s: SetPiece): [number, number, number] {
  const pl = s.plane ?? 'front'
  return pl === 'front' ? [s.w, s.h, s.d] : pl === 'top' ? [s.w, s.d, s.h] : [s.d, s.h, s.w]
}

// Length of a drawn line in metres.
export function lineLength(s: SetPiece) {
  const [aw, ah] = planeSize(s)
  const p = s.pts ?? []
  let l = 0
  for (let i = 1; i < p.length; i++) l += Math.hypot((p[i][0] - p[i - 1][0]) * aw, (p[i][1] - p[i - 1][1]) * ah)
  return l
}

export const ellipsePts = (n = 40): [number, number][] => Array.from({ length: n }, (_, i) => [0.5 + Math.cos((i / n) * Math.PI * 2) / 2, 0.5 + Math.sin((i / n) * Math.PI * 2) / 2])

// The three flat views. Canvas coordinates: front (x, -z), top (x, y), side (y, -z).
export type CadView = 'front' | 'top' | 'side'

// Turn points drawn in a view (canvas metres) into a new set piece.
// ctx gives the missing coordinate: depth for front sketches, height for top sketches, across for side sketches.
export function pieceFromSketch(view: CadView, tool: DrawTool, pts: { x: number; y: number }[], ctx: { x: number; y: number; z: number }): SetPiece | null {
  if (pts.length < 2) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  if (tool !== 'line' && (x1 - x0 < 0.2 || y1 - y0 < 0.2)) return null
  if (tool === 'line' && Math.hypot(x1 - x0, y1 - y0) < 0.2) return null
  const a = Math.max(x1 - x0, 0.15)
  const b = Math.max(y1 - y0, 0.15)
  // Front and side canvases run y downwards (y = -height), so v is flipped to run up.
  const up = view !== 'top'
  const cx = x1 - x0 < 0.15 ? (x0 + x1) / 2 - a / 2 : x0
  const cy = y1 - y0 < 0.15 ? (y0 + y1) / 2 - b / 2 : y0
  const norm = (p: { x: number; y: number }): [number, number] => [+((p.x - cx) / a).toFixed(4), +(up ? (cy + b - p.y) / b : (p.y - cy) / b).toFixed(4)]
  const push = tool === 'line' ? 0.15 : view === 'top' ? 1 : 0.5
  const size = view === 'front' ? { w: a, h: b, d: push } : view === 'top' ? { w: a, d: b, h: push } : { d: a, h: b, w: push }
  const mid = { a: cx + a / 2, b: cy + b / 2 }
  const pos =
    view === 'front'
      ? { x: mid.a, z: Math.max(0, -(cy + b)), y: ctx.y }
      : view === 'top'
        ? { x: mid.a, y: mid.b, z: ctx.z }
        : { y: mid.a, z: Math.max(0, -(cy + b)), x: ctx.x }
  const r = (n: number) => +n.toFixed(2)
  const base = { z: r(pos.z), w: r(size.w), h: r(size.h), d: r(size.d), color: '#d9d9d9' }
  if (tool === 'rect') return newPiece('block', r(pos.x), r(pos.y), { ...base, skin: 'paint', label: 'Box' })
  const shape = tool === 'circle' ? ellipsePts() : tool === 'triangle' ? ([[0, 0], [1, 0], [0.5, 1]] as [number, number][]) : pts.map(norm)
  return newPiece(tool === 'line' ? 'line' : 'shape', r(pos.x), r(pos.y), {
    ...base,
    plane: view,
    pts: shape,
    border: tool === 'line' ? 0.15 : undefined,
    label: tool === 'circle' ? 'Circle' : tool === 'triangle' ? 'Triangle' : tool === 'line' ? 'Line' : 'Shape',
  })
}

// Where a piece sits in each flat view: a box in canvas coordinates.
export function footprint(s: SetPiece, view: CadView) {
  if (view === 'front') return { x: s.x - s.w / 2, y: -(s.z + s.h), w: s.w, h: s.h }
  if (view === 'top') return { x: s.x - s.w / 2, y: s.y - s.d / 2, w: s.w, h: s.d }
  return { x: s.y - s.d / 2, y: -(s.z + s.h), w: s.d, h: s.h }
}

// Apply a moved / resized box from a view back onto the piece.
export function fromFootprint(view: CadView, f: { x: number; y: number; w: number; h: number }): Partial<SetPiece> {
  const r = (n: number) => +n.toFixed(2)
  if (view === 'front') return { x: r(f.x + f.w / 2), z: r(Math.max(0, -f.y - f.h)), w: r(f.w), h: r(f.h) }
  if (view === 'top') return { x: r(f.x + f.w / 2), y: r(f.y + f.h / 2), w: r(f.w), d: r(f.h) }
  return { y: r(f.x + f.w / 2), z: r(Math.max(0, -f.y - f.h)), d: r(f.w), h: r(f.h) }
}

// The sketch outline of a drawn piece in a view's local box (0..w, 0..h, y down), or null when that view sees it edge-on.
export function sketchIn(s: SetPiece, view: CadView, w: number, h: number): [number, number][] | null {
  if (!s.pts || (s.plane ?? 'front') !== view) return null
  return s.pts.map(([u, v]) => [u * w, view === 'top' ? v * h : (1 - v) * h])
}
