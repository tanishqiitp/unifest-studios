import { create } from 'zustand'
import Konva from 'konva'
import { SceneContext } from 'konva/lib/Context'

// Dark (default) and light mode. CSS tokens switch on html[data-theme]; the 2D canvases switch by
// remapping greys as they are drawn, so every plan view follows the theme without its own colours.
export type Theme = 'dark' | 'light'
const KEY = 'unifest:theme'

function initial(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* private mode */
  }
  return 'dark'
}

export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>((set, get) => ({
  theme: initial(),
  setTheme: (theme) => {
    set({ theme })
    apply(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* private mode */
    }
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

let light = false
function apply(t: Theme) {
  light = t === 'light'
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#000000')
  Konva.stages.forEach((s) => s.batchDraw())
}

// ---- canvas colour remap: greys flip lightness, real colours stay as they are ----
const cache = new Map<string, string>()
function parse(c: string): [number, number, number, number] | null {
  const s = c.trim().toLowerCase()
  if (s === 'white') return [255, 255, 255, 1]
  if (s === 'black') return [0, 0, 0, 1]
  if (s[0] === '#') {
    const h = s.slice(1)
    const x = h.length <= 4 ? h.split('').map((ch) => ch + ch).join('') : h
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(x)) return null
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1]
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    if (p.length >= 3 && p.slice(0, 3).every((n) => !isNaN(n))) return [p[0], p[1], p[2], p.length > 3 && !isNaN(p[3]) ? p[3] : 1]
  }
  return null
}

// Real colours (paint, fabric, a white drape) keep their look in both themes: wrap them with real().
// The marker is stripped by the canvas hook below before the colour reaches the canvas.
const REAL = '|real'
export function real(c: string): string {
  return typeof c === 'string' && c.startsWith('#') ? c + REAL : c
}

export function themeColor(c: string): string {
  if (typeof c !== 'string') return c
  if (c.endsWith(REAL)) return c.slice(0, -REAL.length)
  if (!light) return c
  const hit = cache.get(c)
  if (hit) return hit
  const v = parse(c)
  let out = c
  if (v) {
    const [r, g, b, a] = v
    // Only near-neutral colours flip: the black-and-white UI chrome, grids, labels and outlines.
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) out = `rgba(${255 - r},${255 - g},${255 - b},${a})`
  }
  cache.set(c, out)
  return out
}

const COLOR_ATTRS = new Set(['fillStyle', 'strokeStyle', 'shadowColor'])
const proto = SceneContext.prototype as unknown as { setAttr: (a: string, v: unknown) => void }
const orig = proto.setAttr
proto.setAttr = function (a: string, v: unknown) {
  orig.call(this, a, COLOR_ATTRS.has(a) && typeof v === 'string' ? themeColor(v) : v)
}

apply(useTheme.getState().theme)
