// Show playback: a timeline of cues (lights, screens, effects) laid against a music track. The 3D view asks
// "what is happening at time t?" every frame, so scrubbing and looping need no extra state. Pure functions,
// so the same show plays identically in the editor, the client link and tests.
import { nanoid } from 'nanoid'
import type { Show, ShowCue } from '../types'

export type LightPalette = 'white' | 'warm' | 'ice' | 'duo' | 'rainbow' | 'red' | 'green'
export type FxKind = 'cold-pyro' | 'co2-jet' | 'flame' | 'confetti' | 'firework' | 'smoke' | 'bubble' | 'blinder' | 'all'

export const LANES = [
  { id: 'lights', name: 'Lights' },
  { id: 'screens', name: 'Screens' },
  { id: 'fx', name: 'Effects' },
] as const
export type Lane = (typeof LANES)[number]['id']

export const FX_NAMES: Record<FxKind, string> = {
  'cold-pyro': 'Cold pyro',
  'co2-jet': 'CO₂ jets',
  flame: 'Flames',
  confetti: 'Confetti',
  firework: 'Fireworks',
  smoke: 'Smoke',
  bubble: 'Bubbles',
  blinder: 'Blinder hit',
  all: 'Everything',
}

export const EMPTY_SHOW: Show = { cues: [], length: 180, bpm: 120 }

/** A new cue on a lane, with sensible defaults. */
export function newCue(lane: Lane, t: number, extra: Partial<ShowCue> = {}): ShowCue {
  const base: ShowCue = { id: nanoid(6), lane, t: Math.max(0, +t.toFixed(3)), dur: lane === 'fx' ? 2 : 8 }
  if (lane === 'lights') Object.assign(base, { palette: 'duo', move: 'slow', level: 1 })
  if (lane === 'screens') Object.assign(base, { screen: 'content' })
  if (lane === 'fx') Object.assign(base, { fx: 'cold-pyro', dur: 2 })
  return { ...base, ...extra }
}

/** Snap a time to the beat grid (quarter beats by default). */
export function snapTime(t: number, bpm: number | undefined, div = 1) {
  if (!bpm || bpm <= 0) return Math.round(t * 10) / 10
  const step = 60 / bpm / div
  return Math.max(0, Math.round(t / step) * step)
}

/** Beats per minute from a series of tap times (seconds); the last few taps, averaged. */
export function tapTempo(taps: number[]): number | null {
  const ts = taps.slice(-8)
  if (ts.length < 3) return null
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).filter((g) => g > 0.2 && g < 2)
  if (gaps.length < 2) return null
  const bpm = 60 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)
  return Math.round(bpm * 10) / 10
}

const byTime = (a: ShowCue, b: ShowCue) => a.t - b.t

export interface LightState {
  palette: LightPalette
  speed: number // 0 = still, 1 = slow, 2.2 = fast
  level: number // 0..1
  strobe: boolean
  color?: string
}
/** The light look at time t: the last lights cue that has started holds until the next one. */
export function lightsAt(show: Show | undefined, t: number): LightState | null {
  if (!show) return null
  let cur: ShowCue | null = null
  for (const c of show.cues) if (c.lane === 'lights' && c.t <= t && (!cur || c.t >= cur.t)) cur = c
  if (!cur) return null
  return {
    palette: (cur.palette as LightPalette) ?? 'duo',
    speed: cur.move === 'still' ? 0 : cur.move === 'fast' ? 2.2 : 1,
    level: cur.level ?? 1,
    // Strobe only lasts for the cue's own length.
    strobe: !!cur.strobe && t < cur.t + cur.dur,
    color: cur.color,
  }
}

export interface ScreenState {
  mode: 'content' | 'black' | 'flash' | 'tint'
  color?: string
  flash: number // 0..1, a white hit that fades
}
/** What the screens show at time t (holds like lights; a flash fades over its cue). */
export function screensAt(show: Show | undefined, t: number): ScreenState | null {
  if (!show) return null
  let cur: ShowCue | null = null
  for (const c of show.cues) if (c.lane === 'screens' && c.t <= t && (!cur || c.t >= cur.t)) cur = c
  if (!cur) return null
  const mode = cur.screen ?? 'content'
  if (mode === 'flash') {
    const k = (t - cur.t) / Math.max(0.1, cur.dur)
    return { mode, flash: k < 1 ? 1 - k : 0 }
  }
  return { mode, color: cur.color, flash: 0 }
}

/** Is this effect firing at time t? (An "Everything" cue fires every effect.) */
export function fxActive(show: Show | undefined, t: number, kind: FxKind): boolean {
  if (!show) return false
  for (const c of show.cues) if (c.lane === 'fx' && (c.fx === kind || c.fx === 'all') && t >= c.t && t < c.t + c.dur) return true
  return false
}

/** Brightness of a blinder / strobe hit at time t (0 when none). */
export function hitAt(show: Show | undefined, t: number): number {
  if (!show) return 0
  let best = 0
  for (const c of show.cues) {
    if (c.lane !== 'fx' || (c.fx !== 'blinder' && c.fx !== 'all') || t < c.t || t >= c.t + c.dur) continue
    const k = (t - c.t) / c.dur
    best = Math.max(best, Math.sin(t * 50) > 0 ? 1 - k : 0)
  }
  return best
}

/**
 * A ready-made show for a track: a calm intro, a build, a big drop with pyro, CO₂ and confetti, a breakdown
 * and a finale with fireworks. Times follow the beat so it lines up with most dance and pop tracks.
 */
export function quickShow(length: number, bpm = 120): ShowCue[] {
  const bar = (60 / bpm) * 4
  const at = (bars: number) => +(bars * bar).toFixed(3)
  const L = Math.max(10, length)
  const drop = Math.min(at(16), L * 0.35)
  const breakdown = Math.min(drop + at(16), L * 0.6)
  const finale = Math.min(breakdown + at(8), L * 0.8)
  const cue = (lane: Lane, t: number, e: Partial<ShowCue>) => newCue(lane, t, e)
  return [
    cue('lights', 0, { palette: 'ice', move: 'still', level: 0.45, dur: at(4) }),
    cue('screens', 0, { screen: 'tint', color: '#0b1b3a', dur: at(4) }),
    cue('fx', 0, { fx: 'smoke', dur: at(8) }),
    cue('lights', at(4), { palette: 'warm', move: 'slow', level: 0.7, dur: at(4) }),
    cue('screens', at(4), { screen: 'content', dur: at(4) }),
    cue('lights', drop - at(4), { palette: 'white', move: 'fast', level: 0.9, strobe: true, dur: at(4) }),
    cue('lights', drop, { palette: 'duo', move: 'fast', level: 1, dur: at(8) }),
    cue('screens', drop, { screen: 'flash', dur: 1 }),
    cue('screens', drop + 1, { screen: 'content', dur: at(8) }),
    cue('fx', drop, { fx: 'cold-pyro', dur: 3 }),
    cue('fx', drop, { fx: 'co2-jet', dur: 2 }),
    cue('fx', drop, { fx: 'blinder', dur: 1 }),
    cue('fx', drop + at(1), { fx: 'confetti', dur: 6 }),
    cue('fx', drop + at(4), { fx: 'flame', dur: 2 }),
    cue('lights', breakdown, { palette: 'ice', move: 'slow', level: 0.5, dur: at(4) }),
    cue('screens', breakdown, { screen: 'tint', color: '#1a0b3a', dur: at(4) }),
    cue('lights', finale, { palette: 'rainbow', move: 'fast', level: 1, dur: at(8) }),
    cue('screens', finale, { screen: 'flash', dur: 1 }),
    cue('screens', finale + 1, { screen: 'content', dur: at(8) }),
    cue('fx', finale, { fx: 'all', dur: 3 }),
    cue('fx', finale + at(2), { fx: 'firework', dur: 6 }),
    cue('lights', Math.max(finale + at(8), L - at(2)), { palette: 'warm', move: 'still', level: 0.3, dur: at(2) }),
  ]
    // Everything starts inside the track, and nothing runs past its end.
    .filter((c) => c.t < L - 0.25)
    .map((c) => ({ ...c, dur: Math.max(0.2, Math.min(c.dur, L - c.t)) }))
    .sort(byTime)
}

/** Format seconds as m:ss.s */
export const clock = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}
