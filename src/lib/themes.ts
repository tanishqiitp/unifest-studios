// Theme packs: one click restyles the whole design: set and decor colours, stage deck, truss finish, the
// light colours and haze in 3D, and the LED screen content (a generated still in the theme's look).
import type { Project } from '../types'

export interface Theme {
  id: string
  name: string
  blurb: string
  swatch: string[] // shown on the picker
  palette: 'white' | 'warm' | 'ice' | 'duo' | 'rainbow' | 'red' | 'green'
  haze: number
  truss: 'silver' | 'black' | 'white'
  deck: string
  set: string[] // colours for set pieces, used in turn
  outline?: { style: 'bulb' | 'neon'; color: string }
  decor: string[] // colours for decor (not effects or images)
  screen: string // glow colour of screens
  content: { bg: [string, string]; ink: string; motif: 'mandala' | 'grid' | 'sunburst' | 'waves' | 'stripes' | 'dots' }
}

export const THEMES: Theme[] = [
  {
    id: 'royal',
    name: 'Royal Rajasthani',
    blurb: 'Maroon and gold, marigold, warm lamps and jharokha patterns.',
    swatch: ['#6b0f1a', '#d4a017', '#f28c28'],
    palette: 'warm',
    haze: 0.25,
    truss: 'black',
    deck: '#3a0a10',
    set: ['#6b0f1a', '#8a1c24', '#d4a017'],
    outline: { style: 'bulb', color: '#ffcc66' },
    decor: ['#d4a017', '#f28c28', '#b5121b', '#ffd27a'],
    screen: '#ffb347',
    content: { bg: ['#4a0710', '#9c1c22'], ink: '#f5c542', motif: 'mandala' },
  },
  {
    id: 'cyber',
    name: 'Neon Cyberpunk',
    blurb: 'Black stage, magenta and cyan neon, heavy haze, fast sweeps.',
    swatch: ['#0b0b12', '#ff2bd6', '#00e5ff'],
    palette: 'duo',
    haze: 0.7,
    truss: 'black',
    deck: '#0b0b12',
    set: ['#0b0b12', '#16162a', '#1a0b2e'],
    outline: { style: 'neon', color: '#ff2bd6' },
    decor: ['#ff2bd6', '#00e5ff', '#7c3aed'],
    screen: '#00e5ff',
    content: { bg: ['#05010f', '#2a0145'], ink: '#00e5ff', motif: 'grid' },
  },
  {
    id: 'retro',
    name: 'Bollywood Retro',
    blurb: 'Red and gold marquee bulbs, teal accents, 70s sunburst.',
    swatch: ['#c1121f', '#ffb703', '#0e7c7b'],
    palette: 'rainbow',
    haze: 0.35,
    truss: 'silver',
    deck: '#2b1d14',
    set: ['#c1121f', '#0e7c7b', '#ffb703'],
    outline: { style: 'bulb', color: '#ffe8a3' },
    decor: ['#ffb703', '#c1121f', '#0e7c7b', '#fb8500'],
    screen: '#ffb703',
    content: { bg: ['#7a0a12', '#e63946'], ink: '#ffd166', motif: 'sunburst' },
  },
  {
    id: 'white',
    name: 'White & Gold Elegance',
    blurb: 'Ivory, champagne gold and soft white light for weddings and galas.',
    swatch: ['#f7f3ea', '#d8b46a', '#ffffff'],
    palette: 'white',
    haze: 0.15,
    truss: 'white',
    deck: '#efe9dc',
    set: ['#f7f3ea', '#ffffff', '#e8dcc2'],
    outline: { style: 'bulb', color: '#fff3d6' },
    decor: ['#ffffff', '#d8b46a', '#f1e4c8'],
    screen: '#fff1d6',
    content: { bg: ['#f4ecdc', '#d8c39a'], ink: '#9c7a3c', motif: 'waves' },
  },
  {
    id: 'corporate',
    name: 'Corporate Blue',
    blurb: 'Navy and white, crisp cool light, clean lines for keynotes.',
    swatch: ['#0b1f3a', '#ffffff', '#3b82f6'],
    palette: 'ice',
    haze: 0.1,
    truss: 'silver',
    deck: '#0b1f3a',
    set: ['#0b1f3a', '#13294b', '#ffffff'],
    decor: ['#3b82f6', '#ffffff', '#0b1f3a'],
    screen: '#8fd3ff',
    content: { bg: ['#06142b', '#123d7a'], ink: '#8fd3ff', motif: 'stripes' },
  },
  {
    id: 'holi',
    name: 'Holi Colour Burst',
    blurb: 'Bright pinks, yellows, greens and blues for festivals and colour runs.',
    swatch: ['#ff4d9d', '#ffd60a', '#2ec4b6'],
    palette: 'rainbow',
    haze: 0.3,
    truss: 'white',
    deck: '#ffffff',
    set: ['#ff4d9d', '#ffd60a', '#2ec4b6', '#3a86ff'],
    decor: ['#ff4d9d', '#ffd60a', '#2ec4b6', '#3a86ff', '#ff7b00'],
    screen: '#ff4d9d',
    content: { bg: ['#ff4d9d', '#3a86ff'], ink: '#ffffff', motif: 'dots' },
  },
]

export const themeById = (id?: string) => THEMES.find((t) => t.id === id)

/** A still image for the LED screens in the theme's look, with the event name (JPEG data URL; browser only). */
export function themeContent(t: Theme, title: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const W = 960
  const H = 540
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return undefined
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, t.content.bg[0])
  bg.addColorStop(1, t.content.bg[1])
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.strokeStyle = t.content.ink
  g.fillStyle = t.content.ink
  g.globalAlpha = 0.35
  const cx = W / 2
  const cy = H / 2
  switch (t.content.motif) {
    case 'mandala':
      for (let r = 40; r < 420; r += 38) {
        g.lineWidth = 2
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2
          g.beginPath()
          g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r / 9, 0, Math.PI * 2)
          g.stroke()
        }
      }
      break
    case 'grid':
      g.lineWidth = 1.5
      for (let i = -20; i <= 20; i++) {
        g.beginPath()
        g.moveTo(cx + i * 60, H)
        g.lineTo(cx + i * 8, cy)
        g.stroke()
      }
      for (let y = cy; y < H; y += (y - cy) * 0.25 + 8) {
        g.beginPath()
        g.moveTo(0, y)
        g.lineTo(W, y)
        g.stroke()
      }
      break
    case 'sunburst':
      for (let k = 0; k < 36; k += 2) {
        const a0 = (k / 36) * Math.PI * 2
        const a1 = ((k + 1) / 36) * Math.PI * 2
        g.beginPath()
        g.moveTo(cx, cy)
        g.arc(cx, cy, W, a0, a1)
        g.fill()
      }
      break
    case 'waves':
      g.lineWidth = 2
      for (let y = 0; y < H + 40; y += 28) {
        g.beginPath()
        for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin(x / 70 + y / 50) * 14)
        g.stroke()
      }
      break
    case 'stripes':
      for (let x = -H; x < W; x += 70) {
        g.beginPath()
        g.moveTo(x, H)
        g.lineTo(x + H, 0)
        g.lineTo(x + H + 22, 0)
        g.lineTo(x + 22, H)
        g.fill()
      }
      break
    case 'dots':
      for (let i = 0; i < 140; i++) {
        const x = (i * 137.5) % W
        const y = (i * 97.3) % H
        g.beginPath()
        g.arc(x, y, 8 + ((i * 13) % 40), 0, Math.PI * 2)
        g.fill()
      }
      break
  }
  g.globalAlpha = 1
  g.font = `700 ${Math.min(84, Math.floor(1500 / Math.max(8, title.length)))}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(0,0,0,0.45)'
  g.shadowBlur = 18
  g.fillStyle = t.content.ink
  g.fillText(title.toUpperCase(), cx, cy)
  return c.toDataURL('image/jpeg', 0.72)
}

/**
 * Restyle the design in a theme. Effects (pyro, smoke…), artwork decor (banners with images), the guest list
 * and every size and position are left alone; only colours, finishes, light look and screen content change.
 */
export function applyTheme(p: Project, id: string, opts: { screens?: boolean } = {}) {
  const t = themeById(id)
  if (!t) return
  p.look = { ...(p.look ?? {}), haze: t.haze, palette: t.palette, theme: t.id }
  for (const tr of p.truss) tr.finish = t.truss
  for (const d of p.decks) d.color = t.deck
  ;(p.set ?? []).forEach((s, i) => {
    s.color = t.set[i % t.set.length]
    if (t.outline && s.outline) s.outline = { ...s.outline, style: t.outline.style, color: t.outline.color }
  })
  let k = 0
  for (const d of p.decor ?? []) {
    if (['cold-pyro', 'smoke', 'co2-jet', 'confetti', 'flame', 'firework', 'bubble', 'model', 'banner', 'standee', 'backdrop'].includes(d.kind)) continue
    d.color = t.decor[k++ % t.decor.length]
  }
  const img = opts.screens === false ? undefined : themeContent(t, p.name || t.name)
  for (const s of p.screens) {
    s.color = t.screen
    if (img) s.image = img
  }
}
