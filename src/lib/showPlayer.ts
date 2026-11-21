// The show clock. While a show is open, the 3D view reads `showNow()` every frame. With music loaded the
// music is the clock (so lights land exactly on the beat); without music a timer runs.
import { create } from 'zustand'
import type { Show } from '../types'

interface Player {
  open: boolean // timeline panel open: the scene follows the show
  playing: boolean
  loop: boolean
  keys: boolean // the timeline takes the arrow keys
  show?: Show
  set: (p: Partial<Omit<Player, 'set'>>) => void
}
export const usePlayer = create<Player>((set) => ({ open: false, playing: false, loop: false, keys: false, set: (p) => set(p) }))

let audio: HTMLAudioElement | null = null
let startPerf = 0 // timer mode: performance.now() at time 0
let paused = 0 // time while paused

export function getAudio() {
  return audio
}
/** Use this music for the show (null removes it). */
export function setMusic(url: string | null) {
  if (audio) {
    audio.pause()
    if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src)
  }
  audio = null
  if (url) {
    audio = new Audio(url)
    audio.preload = 'auto'
    audio.currentTime = paused
  }
}

export function showTime(): number {
  const p = usePlayer.getState()
  if (audio) return p.playing ? audio.currentTime : paused
  return p.playing ? (performance.now() - startPerf) / 1000 : paused
}

export function seek(t: number) {
  const len = usePlayer.getState().show?.length ?? 180
  const v = Math.max(0, Math.min(len, t))
  paused = v
  startPerf = performance.now() - v * 1000
  if (audio) audio.currentTime = v
}

export function play() {
  const p = usePlayer.getState()
  const len = p.show?.length ?? 180
  if (paused >= len - 0.05) paused = 0
  startPerf = performance.now() - paused * 1000
  if (audio) {
    audio.currentTime = paused
    void audio.play().catch(() => undefined)
  }
  p.set({ playing: true })
}

export function pause() {
  paused = showTime()
  audio?.pause()
  usePlayer.getState().set({ playing: false })
}

/** Called every frame by the timeline: loop or stop at the end. */
export function tick() {
  const p = usePlayer.getState()
  if (!p.playing) return
  const len = p.show?.length ?? 180
  const t = showTime()
  if (t >= len || (audio && audio.ended)) {
    if (p.loop) {
      seek(0)
      if (audio) void audio.play().catch(() => undefined)
    } else {
      pause()
      seek(len)
    }
  }
}

/** The show and its time while the timeline is open; null otherwise (the scene runs as usual). */
export function showNow(): { show: Show; t: number } | null {
  const p = usePlayer.getState()
  if (!p.open || !p.show) return null
  return { show: p.show, t: showTime() }
}

// ---------------------------------------------------------------- music file, kept in this browser

const DB = 'unifest-show-audio'
const STORE = 'files'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function saveMusic(id: string, file: Blob) {
  const d = await db()
  await new Promise<void>((res, rej) => {
    const t = d.transaction(STORE, 'readwrite')
    t.objectStore(STORE).put({ id, file })
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
export async function loadMusic(id: string): Promise<Blob | null> {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      r.onsuccess = () => res((r.result as { file?: Blob } | undefined)?.file ?? null)
      r.onerror = () => rej(r.error)
    })
  } catch {
    return null
  }
}

/** Loudness outline of a track for the timeline (one value per slot, 0..1). */
export async function waveform(file: Blob, slots = 1600): Promise<Float32Array | null> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const buf = await ctx.decodeAudioData(await file.arrayBuffer())
    void ctx.close()
    const ch = buf.getChannelData(0)
    const out = new Float32Array(slots)
    const step = Math.max(1, Math.floor(ch.length / slots))
    let max = 0
    for (let i = 0; i < slots; i++) {
      let peak = 0
      for (let j = i * step, e = Math.min(ch.length, j + step); j < e; j += 8) peak = Math.max(peak, Math.abs(ch[j]))
      out[i] = peak
      max = Math.max(max, peak)
    }
    if (max > 0) for (let i = 0; i < slots; i++) out[i] /= max
    return out
  } catch {
    return null
  }
}
