import { create } from 'zustand'

// Which layout the editor uses. "auto" picks from the screen size and whether it is a touch screen;
// the user can force one from File → Layout (for example desktop layout on a large iPad).
export type DeviceKind = 'phone' | 'tablet' | 'desktop'
export type DevicePref = 'auto' | DeviceKind

const KEY = 'unifest.device'

export function detectDevice(w = window.innerWidth, h = window.innerHeight, touch = matchMedia('(pointer: coarse)').matches): DeviceKind {
  const short = Math.min(w, h)
  if (short < 600 || w < 640) return 'phone'
  // Touch screens up to iPad Pro landscape size use the tablet layout; so do narrow desktop windows.
  if (w < 1024 || (touch && w <= 1366)) return 'tablet'
  return 'desktop'
}

function readPref(): DevicePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'phone' || v === 'tablet' || v === 'desktop') return v
  } catch {
    /* storage blocked */
  }
  return 'auto'
}

interface DeviceState {
  pref: DevicePref
  detected: DeviceKind
  kind: DeviceKind
  touch: boolean
  setPref: (p: DevicePref) => void
}

const touchNow = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export const useDevice = create<DeviceState>((set, get) => {
  const pref = readPref()
  const detected = detectDevice()
  return {
    pref,
    detected,
    kind: pref === 'auto' ? detected : pref,
    touch: touchNow(),
    setPref: (p) => {
      try {
        if (p === 'auto') localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, p)
      } catch {
        /* storage blocked */
      }
      set({ pref: p, kind: p === 'auto' ? get().detected : p })
    },
  }
})

function apply() {
  const { kind, touch } = useDevice.getState()
  document.documentElement.dataset.device = kind
  document.documentElement.dataset.touch = touch ? '1' : '0'
}

if (typeof document !== 'undefined') {
  const update = () => {
    const detected = detectDevice()
    const s = useDevice.getState()
    useDevice.setState({ detected, touch: touchNow(), kind: s.pref === 'auto' ? detected : s.pref })
  }
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
  useDevice.subscribe(apply)
  apply()
}

export const isCompact = (k: DeviceKind) => k !== 'desktop'
