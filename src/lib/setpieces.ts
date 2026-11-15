import { nanoid } from 'nanoid'
import type { Project, SetKind, SetPiece, Skin } from '../types'

// Catalogue of scenic blocks: default size (w × h × d, metres), skin and a one-line note.
export const SET_KINDS: Record<SetKind, { name: string; size: [number, number, number]; skin: Skin; tip: string; group: 'Structure' | 'Shapes' | 'Props' | 'Site' }> = {
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
    return { ...src, id: s.id, mirrorOf: src.id, label: s.label, x: 2 * axis - src.x }
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

