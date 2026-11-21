// Show timeline: music, a beat grid and three lanes of cues (lights, screens, effects) under the 3D view.
// Press play and the scene performs the show; drag cues to the beat, scrub anywhere, loop the whole thing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { ChevronDown, ChevronUp, Copy, Flag, Flame, Maximize2, Music, Pause, Play, Plus, Repeat, SkipBack, Sparkles, Trash2, X } from 'lucide-react'
import { newDecor } from '../lib/decor'
import { stageBounds } from '../lib/calc'
import { useStore } from '../store'
import type { Project, Show, ShowCue } from '../types'
import { clock, EMPTY_SHOW, FX_NAMES, LANES, lightsAt, newCue, quickShow, screensAt, snapTime, tapTempo, type FxKind, type Lane } from '../lib/show'
import { getAudio, loadMusic, pause, play, saveMusic, seek, setMusic, showTime, tick, usePlayer, waveform } from '../lib/showPlayer'

const SWATCH: Record<string, string> = { white: '#ffffff', warm: '#ffb36b', ice: '#8fd3ff', duo: 'linear-gradient(90deg,#ff2bd6,#4b5bff)', rainbow: 'linear-gradient(90deg,#f33,#fd3,#3f6,#3cf,#a3f)', red: '#ff3344', green: '#33ff88' }
const LABEL_W = 70

function cueText(c: ShowCue) {
  if (c.lane === 'lights') return `${c.palette ?? 'duo'}${c.move && c.move !== 'slow' ? ` · ${c.move}` : ''}${c.strobe ? ' · strobe' : ''}${(c.level ?? 1) < 1 ? ` · ${Math.round((c.level ?? 1) * 100)}%` : ''}`
  if (c.lane === 'screens') return { content: 'Content', black: 'Black', flash: 'Flash', tint: 'Tint' }[c.screen ?? 'content']
  return FX_NAMES[(c.fx as FxKind) ?? 'cold-pyro']
}
function cueBg(c: ShowCue) {
  if (c.lane === 'lights') return c.color ?? SWATCH[c.palette ?? 'duo'] ?? '#888'
  if (c.lane === 'screens') return c.screen === 'black' ? '#111' : c.screen === 'tint' ? (c.color ?? '#335') : c.screen === 'flash' ? '#fff' : '#4a5568'
  return c.fx === 'smoke' || c.fx === 'bubble' ? '#8a94a6' : c.fx === 'co2-jet' ? '#c9e8ff' : c.fx === 'confetti' ? 'linear-gradient(90deg,#f6c,#fd3,#3cf)' : '#ff8a2a'
}

export function ShowTimeline({ project, editable, onClose }: { project: Project; editable: boolean; onClose: () => void }) {
  const show = project.show ?? EMPTY_SHOW
  const mutate = useStore((s) => s.mutate)
  const notify = useStore((s) => s.notify)
  const playing = usePlayer((s) => s.playing)
  const loop = usePlayer((s) => s.loop)
  const [zoom, setZoom] = useState(18) // pixels per second
  const [mini, setMini] = useState(() => {
    try {
      return localStorage.getItem('unifest:show-mini') === '1'
    } catch {
      return false
    }
  })
  const toggleMini = () => {
    setMini(!mini)
    try {
      localStorage.setItem('unifest:show-mini', mini ? '0' : '1')
    } catch {
      /* private mode */
    }
  }
  const [selIds, setSelIds] = useState<string[]>([])
  const selId = selIds.at(-1) ?? null
  const setSelId = (id: string | null) => setSelIds(id ? [id] : [])
  const [box, setBox] = useState<{ x0: number; x1: number; y0: number; y1: number } | null>(null)
  const hoverLane = useRef<Lane | null>(null)
  const nowText = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState(true)
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [musicNote, setMusicNote] = useState<string | null>(null)
  const taps = useRef<number[]>([])
  const head = useRef<HTMLDivElement>(null)
  const timeText = useRef<HTMLSpanElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const wave = useRef<HTMLCanvasElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const sel = show.cues.find((c) => c.id === selId)

  const edit = (fn: (s: Show) => void) =>
    mutate((p) => {
      const s: Show = p.show ?? { ...EMPTY_SHOW, cues: [] }
      fn(s)
      p.show = s
    })

  // Open: the scene follows the show. Close: everything back to normal.
  useEffect(() => {
    usePlayer.getState().set({ open: true, show })
  }, [show])
  useEffect(
    () => () => {
      pause()
      setMusic(null)
      usePlayer.getState().set({ open: false, playing: false })
    },
    [],
  )

  // Music saved with this project (kept in this browser).
  const audioId = show.audio?.id
  useEffect(() => {
    if (!audioId) return
    let gone = false
    loadMusic(audioId).then(async (b) => {
      if (gone) return
      if (!b) return setMusicNote('Music not in this browser: add the file again')
      setMusic(URL.createObjectURL(b))
      setMusicNote(null)
      const w = await waveform(b)
      if (!gone) setPeaks(w)
    })
    return () => {
      gone = true
    }
  }, [audioId])

  const addMusic = async (f: File) => {
    const id = nanoid(10)
    try {
      await saveMusic(id, f)
    } catch {
      notify('Could not keep the music in this browser; it will play until you reload')
    }
    const url = URL.createObjectURL(f)
    setMusic(url)
    const a = getAudio()
    a?.addEventListener(
      'loadedmetadata',
      () => {
        const len = Math.round(a.duration * 10) / 10
        if (isFinite(len) && len > 0) edit((s) => void (s.length = len))
      },
      { once: true },
    )
    edit((s) => void (s.audio = { id, name: f.name.slice(0, 60) }))
    setMusicNote(null)
    setPeaks(await waveform(f))
  }

  // Playhead and clock, every frame (no re-render).
  useEffect(() => {
    let raf = 0
    const loopFn = () => {
      tick()
      const t = showTime()
      if (head.current) head.current.style.transform = `translateX(${LABEL_W + t * zoom}px)`
      if (timeText.current) timeText.current.textContent = clock(t)
      if (nowText.current) {
        const sh = usePlayer.getState().show
        const l = lightsAt(sh, t)
        const sc = screensAt(sh, t)
        const fx = (sh?.cues ?? []).filter((c) => c.lane === 'fx' && t >= c.t && t < c.t + c.dur).map((c) => FX_NAMES[(c.fx as FxKind) ?? 'cold-pyro'])
        const mk = [...(sh?.markers ?? [])].reverse().find((m) => m.t <= t)
        nowText.current.textContent = [
          mk ? `▸ ${mk.name}` : '',
          l ? `Lights: ${l.color ? 'one colour' : l.palette}${l.speed === 0 ? ' still' : l.speed > 1 ? ' fast' : ''}${l.strobe ? ' strobe' : ''}` : 'Lights: as set',
          `Screens: ${sc ? sc.mode : 'content'}`,
          fx.length ? `FX: ${[...new Set(fx)].join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('  ·  ')
      }
      // Keep the playhead in view while playing.
      const sc = scroller.current
      if (sc && usePlayer.getState().playing) {
        const x = LABEL_W + t * zoom
        if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + LABEL_W) sc.scrollLeft = x - LABEL_W - 40
      }
      raf = requestAnimationFrame(loopFn)
    }
    raf = requestAnimationFrame(loopFn)
    return () => cancelAnimationFrame(raf)
  }, [zoom])

  // The whole show fits the panel when it opens or the length changes.
  useEffect(() => {
    const w = scroller.current?.clientWidth
    if (w) setZoom(Math.max(6, Math.min(80, (w - LABEL_W - 24) / Math.max(10, show.length))))
  }, [show.length, mini, show.cues.length > 0])

  // Waveform behind the ruler.
  const width = Math.max(200, show.length * zoom)
  useEffect(() => {
    const c = wave.current
    if (!c) return
    c.width = Math.min(8000, Math.round(width))
    c.height = 40
    const g = c.getContext('2d')!
    g.clearRect(0, 0, c.width, c.height)
    if (!peaks) return
    g.fillStyle = 'rgba(160,170,190,0.45)'
    for (let x = 0; x < c.width; x++) {
      const v = peaks[Math.floor((x / c.width) * peaks.length)] ?? 0
      const h = v * 36
      g.fillRect(x, 20 - h / 2, 1, Math.max(1, h))
    }
  }, [peaks, width])

  const bpm = show.bpm ?? 120
  const beat = 60 / bpm
  const ticks = useMemo(() => {
    const out: { x: number; bar: number | null }[] = []
    const n = Math.floor(show.length / beat)
    const every = zoom * beat < 6 ? 4 : 1 // too close: bars only
    for (let i = 0; i <= n; i += every) out.push({ x: i * beat * zoom, bar: i % 4 === 0 ? i / 4 + 1 : null })
    return out
  }, [show.length, beat, zoom])

  const toTime = (clientX: number) => {
    const sc = scroller.current!
    const r = sc.getBoundingClientRect()
    return (clientX - r.left + sc.scrollLeft - LABEL_W) / zoom
  }
  // Snap like Blender: to markers and other cues' edges when close, otherwise to half beats.
  const snapT = (t: number, skip: string[] = []) => {
    if (!snap) return Math.max(0, Math.round(t * 20) / 20)
    const reach = 8 / zoom
    let best = Infinity
    let at = t
    const near = (v: number) => {
      const d = Math.abs(v - t)
      if (d < reach && d < best) (best = d), (at = v)
    }
    for (const m of show.markers ?? []) near(m.t)
    for (const c of show.cues) if (!skip.includes(c.id)) (near(c.t), near(c.t + c.dur))
    return best < Infinity ? at : snapTime(t, bpm, 2)
  }

  // Drag a cue (move) or its right edge (length). The whole drag is one undo step.
  const drag = (c: ShowCue, mode: 'move' | 'len') => (e: React.PointerEvent) => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelIds((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
      return
    }
    const group = mode === 'move' && selIds.includes(c.id) ? selIds : [c.id]
    if (!selIds.includes(c.id)) setSelId(c.id)
    const starts = new Map(show.cues.filter((x) => group.includes(x.id)).map((x) => [x.id, x.t]))
    const x0 = e.clientX
    const t0 = c.t
    const d0 = c.dur
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / zoom
      if (Math.abs(ev.clientX - x0) < 3) return
      edit((s) => {
        if (mode === 'move') {
          const delta = Math.max(-Math.min(...starts.values()), snapT(t0 + dt, group) - t0)
          for (const k of s.cues) if (starts.has(k.id)) k.t = Math.min(s.length, +(starts.get(k.id)! + delta).toFixed(3))
        } else {
          const k = s.cues.find((x) => x.id === c.id)
          if (k) k.dur = Math.max(0.1, +(snapT(t0 + d0 + dt, [c.id]) - t0).toFixed(3))
        }
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const add = (lane: Lane, t: number) => {
    const c = newCue(lane, snapT(t))
    edit((s) => void s.cues.push(c))
    setSelId(c.id)
  }
  const upd = (patch: Partial<ShowCue>) => sel && edit((s) => void Object.assign(s.cues.find((x) => x.id === sel.id) ?? {}, patch))
  const del = () => {
    if (!sel) return
    edit((s) => void (s.cues = s.cues.filter((x) => x.id !== sel.id)))
    setSelId(null)
  }
  const duplicate = () => {
    const picked = show.cues.filter((c) => selIds.includes(c.id))
    if (!picked.length) return
    const start = Math.min(...picked.map((c) => c.t))
    const span = Math.max(...picked.map((c) => c.t + c.dur)) - start
    const copies = picked.map((c) => ({ ...c, id: nanoid(6), t: +(c.t + span).toFixed(3) })).filter((c) => c.t < show.length)
    edit((s) => void s.cues.push(...copies))
    setSelIds(copies.map((c) => c.id))
  }
  const addMarker = () => {
    const t = +showTime().toFixed(3)
    const n = (show.markers?.length ?? 0) + 1
    edit((s) => void (s.markers = [...(s.markers ?? []), { id: nanoid(6), t, name: `Marker ${n}` }].sort((a, b) => a.t - b.t)))
  }
  // Keys, as in Blender's timeline: ← → one beat, Shift+← → start/end, ↑ ↓ previous/next cue or marker,
  // M marker, I insert a cue on the lane under the mouse, Ctrl+D duplicate, Delete, Esc deselect.
  useEffect(() => {
    usePlayer.getState().set({ keys: !mini })
    return () => usePlayer.getState().set({ keys: false })
  }, [mini])
  useEffect(() => {
    if (mini) return
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
      const now = showTime()
      const take = () => (e.preventDefault(), e.stopImmediatePropagation())
      const key = e.key.toLowerCase()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        take()
        const dir = e.key === 'ArrowRight' ? 1 : -1
        if (e.shiftKey) return seek(dir > 0 ? show.length : 0)
        return seek(snapTime(now, bpm) + dir * beat)
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        take()
        const stops = [...show.cues.map((c) => c.t), ...(show.markers ?? []).map((m) => m.t)].sort((a, b) => a - b)
        const next = e.key === 'ArrowUp' ? stops.find((v) => v > now + 0.01) : [...stops].reverse().find((v) => v < now - 0.01)
        if (next !== undefined) seek(next)
        return
      }
      if (!editable) return
      if ((e.ctrlKey || e.metaKey) && key === 'd') return (take(), duplicate())
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (key === 'm') return (take(), addMarker())
      if (key === 'i' && hoverLane.current) return (take(), add(hoverLane.current, now))
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length) {
        take()
        edit((s) => void (s.cues = s.cues.filter((x) => !selIds.includes(x.id))))
        setSelIds([])
      }
      if (e.key === 'Escape' && selIds.length) (take(), setSelIds([]))
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })

  // Wheel zooms around the pointer (Blender); Shift+wheel scrolls along.
  useEffect(() => {
    const sc = scroller.current
    if (!sc) return
    const wheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      const r = sc.getBoundingClientRect()
      const px = e.clientX - r.left
      const t = (px + sc.scrollLeft - LABEL_W) / zoom
      const z = Math.max(4, Math.min(160, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      setZoom(z)
      requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, LABEL_W + t * z - px)))
    }
    sc.addEventListener('wheel', wheel, { passive: false })
    return () => sc.removeEventListener('wheel', wheel)
  }, [zoom])
  const fit = () => {
    const w = scroller.current?.clientWidth
    if (w) setZoom(Math.max(4, Math.min(160, (w - LABEL_W - 24) / Math.max(10, show.length))))
    if (scroller.current) scroller.current.scrollLeft = 0
  }

  const tap = () => {
    taps.current = [...taps.current.filter((x) => performance.now() / 1000 - x < 4), performance.now() / 1000]
    const b = tapTempo(taps.current)
    if (b) edit((s) => void (s.bpm = b))
  }

  return (
    <div className="absolute left-2 right-2 bottom-16 z-20 glass rounded-xl p-2 text-[11px] fade-in select-none" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <button className="btn h-8 w-10 justify-center btn-on" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play the show'} onClick={() => (playing ? pause() : play())}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button className="btn h-8 w-8 justify-center" aria-label="Back to the start" title="Back to the start (Home)" onClick={() => seek(0)}>
          <SkipBack size={13} />
        </button>
        <span className="tabular-nums w-24">
          <span ref={timeText}>0:00.0</span> / {clock(show.length)}
        </span>
        {editable && (
          <button className="btn h-8 w-8 justify-center" title="Add a marker at the playhead (M): name moments like Drop or Chorus" aria-label="Add marker" onClick={addMarker}>
            <Flag size={13} />
          </button>
        )}
        <button className={`btn h-8 w-8 justify-center ${loop ? 'btn-on' : ''}`} title="Loop the show" aria-pressed={loop} onClick={() => usePlayer.getState().set({ loop: !loop })}>
          <Repeat size={13} />
        </button>
        {editable && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
            <input
              ref={file}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void addMusic(f)
              }}
            />
            <button className="btn h-8 max-w-[180px]" title="Add a music track (MP3, WAV, M4A). It stays in this browser." onClick={() => file.current?.click()}>
              <Music size={13} /> <span className="truncate">{show.audio?.name ?? 'Add music'}</span>
            </button>
            {musicNote && <span className="text-warn">{musicNote}</span>}
            <label className="flex items-center gap-1" title="Beats per minute: cues snap to this beat grid">
              BPM
              <input className="field h-8 w-16 text-[11px]" type="number" min={40} max={240} step={1} value={bpm} onChange={(e) => edit((s) => void (s.bpm = Math.max(40, Math.min(240, +e.target.value || 120))))} />
            </label>
            <button className="btn h-8" title="Tap along with the music (4+ taps) to set the BPM" onClick={tap}>
              Tap
            </button>
            <button className={`btn h-8 ${snap ? 'btn-on' : ''}`} title="Snap cues to half beats" onClick={() => setSnap(!snap)}>
              Snap
            </button>
            <label className="flex items-center gap-1" title="Show length">
              Length
              <input className="field h-8 w-16 text-[11px]" type="number" min={10} max={3600} value={show.length} onChange={(e) => edit((s) => void (s.length = Math.max(10, Math.min(3600, +e.target.value || 180))))} />s
            </label>
            <button
              className="btn h-8"
              title="Fill the timeline with a ready-made show (intro, build, drop with pyro and CO₂, breakdown, finale) that follows the BPM"
              onClick={() => {
                if (show.cues.length && !confirm('Replace the current cues with a ready-made show? (Ctrl+Z brings them back)')) return
                edit((s) => void (s.cues = quickShow(s.length, s.bpm ?? 120)))
                seek(0)
                notify('Show ready: press Play (or Space) to watch it')
              }}
            >
              <Sparkles size={13} /> Quick show
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {!mini && (
            <button className="btn btn-icon h-8 w-8" title="Fit the whole show in view" aria-label="Fit the whole show" onClick={fit}>
              <Maximize2 size={13} />
            </button>
          )}
          {!mini && <input type="range" min={4} max={160} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Timeline zoom" title="Zoom the timeline" className="w-20" />}
          <button className="btn btn-icon h-8 w-8" aria-label={mini ? 'Show the timeline' : 'Minimise the timeline'} title={mini ? 'Show the lanes' : 'Minimise: keep just the play controls'} onClick={toggleMini}>
            {mini ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button className="btn btn-icon h-8 w-8" aria-label="Close the show timeline" onClick={onClose}>
            <X size={13} />
          </button>
        </span>
      </div>

      {!mini && !show.cues.length && editable && (
        <div className="rounded-lg bg-black/30 p-4 mb-1.5 text-center">
          <div className="text-sm font-medium">Program a show to your music</div>
          <p className="text-mute mt-1 mb-3">Lights, screens and effects follow a timeline. Start from a ready-made show and adjust it, or add cues yourself.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary h-9" onClick={() => (edit((s) => void (s.cues = quickShow(s.length, s.bpm ?? 120))), seek(0), notify('Show ready: press Play (or Space) to watch it'))}>
              <Sparkles size={14} /> Quick show
            </button>
            <button className="btn h-9" onClick={() => file.current?.click()}>
              <Music size={14} /> {show.audio ? 'Change music' : 'Add music first'}
            </button>
          </div>
          <p className="text-[10px] text-mute mt-2">Tip: add music first, so Quick show fits the song length.</p>
        </div>
      )}
      <div ref={scroller} className={`relative overflow-x-auto overflow-y-hidden rounded-lg bg-black/30 ${mini || (!show.cues.length && editable) ? 'hidden' : ''}`} style={{ maxWidth: '100%' }}>
        <div ref={inner} className="relative" style={{ width: width + LABEL_W + 20 }}>
          {box && <div className="absolute z-20 border border-white/70 bg-white/10 pointer-events-none" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
          {/* Ruler + waveform: click to jump */}
          <div
            className="relative h-10 cursor-ew-resize"
            title="Click or drag to move through the show"
            onPointerDown={(e) => {
              seek(toTime(e.clientX))
              const mv = (ev: PointerEvent) => seek(toTime(ev.clientX))
              const up = () => (window.removeEventListener('pointermove', mv), window.removeEventListener('pointerup', up))
              window.addEventListener('pointermove', mv)
              window.addEventListener('pointerup', up)
            }}
          >
            <canvas ref={wave} className="absolute top-0 h-10 pointer-events-none" style={{ left: LABEL_W, width }} />
            {(show.markers ?? []).map((m) => (
              <button
                key={m.id}
                className="absolute top-0 z-10 h-4 px-1 rounded-sm bg-amber-400 text-black text-[9px] font-semibold leading-4 whitespace-nowrap -translate-x-0.5"
                style={{ left: LABEL_W + m.t * zoom }}
                title={`${m.name} at ${clock(m.t)}: click to jump, double-click to rename, right-click to remove`}
                onPointerDown={(e) => (e.stopPropagation(), seek(m.t))}
                onDoubleClick={() => {
                  if (!editable) return
                  const name = prompt('Marker name', m.name)?.trim()
                  if (name) edit((s) => void Object.assign(s.markers?.find((x) => x.id === m.id) ?? {}, { name: name.slice(0, 30) }))
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (editable) edit((s) => void (s.markers = (s.markers ?? []).filter((x) => x.id !== m.id)))
                }}
              >
                {m.name}
              </button>
            ))}
            {ticks.map((k, i) => (
              <div key={i} className="absolute top-0 pointer-events-none" style={{ left: LABEL_W + k.x, height: k.bar ? 40 : 8, borderLeft: `1px solid ${k.bar ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}` }}>
                {k.bar && (k.bar - 1) % (zoom * beat * 4 < 40 ? 4 : 1) === 0 && <span className="absolute left-1 top-0 text-[9px] text-mute">{k.bar}</span>}
              </div>
            ))}
          </div>
          {LANES.map((l) => (
            <div
              key={l.id}
              className="relative h-8 border-t border-line/50"
              onPointerEnter={() => (hoverLane.current = l.id)}
              onPointerLeave={() => (hoverLane.current = null)}
              onDoubleClick={(e) => editable && e.target === e.currentTarget && add(l.id, toTime(e.clientX))}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget || e.button !== 0) return
                // Drag on empty lane space to box-select cues (Shift adds to the selection).
                const r = inner.current!.getBoundingClientRect()
                const x0 = e.clientX - r.left
                const y0 = e.clientY - r.top
                const keep = e.shiftKey ? selIds : []
                if (!e.shiftKey) setSelIds([])
                const mv = (ev: PointerEvent) => setBox({ x0, y0, x1: ev.clientX - r.left, y1: ev.clientY - r.top })
                const up = (ev: PointerEvent) => {
                  window.removeEventListener('pointermove', mv)
                  window.removeEventListener('pointerup', up)
                  setBox(null)
                  const x1 = ev.clientX - r.left
                  const y1 = ev.clientY - r.top
                  if (Math.abs(x1 - x0) < 4) return
                  const [ta, tb] = [Math.min(x0, x1), Math.max(x0, x1)].map((x) => (x - LABEL_W) / zoom)
                  const [la, lb] = [Math.min(y0, y1), Math.max(y0, y1)].map((y) => Math.floor((y - 40) / 32))
                  const lanes = LANES.filter((_, i) => i >= la && i <= lb).map((x) => x.id as string)
                  const hit = show.cues.filter((c) => lanes.includes(c.lane) && c.t < tb && c.t + c.dur > ta).map((c) => c.id)
                  setSelIds([...new Set([...keep, ...hit])])
                }
                window.addEventListener('pointermove', mv)
                window.addEventListener('pointerup', up)
              }}
            >
              <div className="sticky left-0 z-10 h-full flex items-center px-2 text-mute bg-panel/80" style={{ width: LABEL_W }}>
                {l.name}
                {editable && (
                  <button className="ml-auto opacity-60 hover:opacity-100" title={`Add a ${l.name.toLowerCase()} cue at the playhead`} aria-label={`Add ${l.name} cue`} onClick={() => add(l.id, showTime())}>
                    <Plus size={11} />
                  </button>
                )}
              </div>
              {show.cues
                .filter((c) => c.lane === l.id)
                .map((c) => (
                  <div
                    key={c.id}
                    className={`absolute top-1 h-6 rounded-md overflow-hidden flex items-center text-[10px] font-medium ${selIds.includes(c.id) ? 'ring-2 ring-white z-[1]' : 'ring-1 ring-black/40'} ${editable ? 'cursor-grab' : ''}`}
                    style={{ left: LABEL_W + c.t * zoom, width: Math.max(10, c.dur * zoom), background: cueBg(c) }}
                    title={`${cueText(c)} at ${clock(c.t)} for ${c.dur.toFixed(1)} s${editable ? ' (drag to move, drag the right edge to lengthen, Delete removes)' : ''}`}
                    onPointerDown={drag(c, 'move')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="px-1.5 truncate text-black mix-blend-luminosity" style={{ color: '#000', textShadow: '0 0 2px rgba(255,255,255,0.8)' }}>
                      {cueText(c)}
                    </span>
                    {editable && <span className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-black/25" onPointerDown={drag(c, 'len')} />}
                  </div>
                ))}
            </div>
          ))}
          <div ref={head} className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: 0 }}>
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-x-[5px] border-x-transparent border-t-[7px] border-t-red-500" />
          </div>
        </div>
      </div>

      {!mini && show.cues.length > 0 && <span ref={nowText} className="block mt-1 text-[10px] text-dim truncate" aria-live="off" />}
      {editable && !mini && show.cues.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 min-h-8">
          {selIds.length > 1 ? (
            <>
              <b>{selIds.length} cues selected</b>
              <span className="text-mute">Drag any of them to move all together.</span>
              <button className="btn h-8" onClick={duplicate} title="Copy them right after the selection (Ctrl+D)">
                <Copy size={13} /> Duplicate
              </button>
              <button
                className="btn h-8 hover:text-err"
                onClick={() => (edit((s) => void (s.cues = s.cues.filter((x) => !selIds.includes(x.id)))), setSelIds([]))}
              >
                <Trash2 size={13} /> Delete
              </button>
            </>
          ) : !sel ? (
            <span className="text-mute">Click a cue to edit · Shift-click or drag a box for several · double-click a lane or press I to add · M marker · ← → beats · ↑ ↓ cues · Space plays</span>
          ) : (
            <>
              <b className="mr-1">{LANES.find((l) => l.id === sel.lane)?.name}</b>
              {sel.lane === 'lights' && (
                <>
                  <select className="field h-8 w-auto text-[11px]" value={sel.palette ?? 'duo'} onChange={(e) => upd({ palette: e.target.value, color: undefined })} aria-label="Light colours">
                    {['duo', 'white', 'warm', 'ice', 'rainbow', 'red', 'green'].map((p) => (
                      <option key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                  <input type="color" className="h-8 w-9 rounded border border-line bg-transparent" value={sel.color ?? '#ffffff'} onChange={(e) => upd({ color: e.target.value })} title="One colour for every light" aria-label="Single light colour" />
                  <select className="field h-8 w-auto text-[11px]" value={sel.move ?? 'slow'} onChange={(e) => upd({ move: e.target.value as ShowCue['move'] })} aria-label="Movement">
                    <option value="still">Still</option>
                    <option value="slow">Slow sweep</option>
                    <option value="fast">Fast sweep</option>
                  </select>
                  <label className="flex items-center gap-1">
                    Level
                    <input type="range" min={0} max={1} step={0.05} value={sel.level ?? 1} onChange={(e) => upd({ level: +e.target.value })} className="w-20" aria-label="Light level" />
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!sel.strobe} onChange={(e) => upd({ strobe: e.target.checked })} /> Strobe
                  </label>
                </>
              )}
              {sel.lane === 'screens' && (
                <>
                  <select className="field h-8 w-auto text-[11px]" value={sel.screen ?? 'content'} onChange={(e) => upd({ screen: e.target.value as ShowCue['screen'] })} aria-label="Screens">
                    <option value="content">Content</option>
                    <option value="black">Black</option>
                    <option value="flash">White flash</option>
                    <option value="tint">Colour tint</option>
                  </select>
                  {sel.screen === 'tint' && <input type="color" className="h-8 w-9 rounded border border-line bg-transparent" value={sel.color ?? '#3355ff'} onChange={(e) => upd({ color: e.target.value })} aria-label="Tint colour" />}
                </>
              )}
              {sel.lane === 'fx' && (
                <select className="field h-8 w-auto text-[11px]" value={sel.fx ?? 'cold-pyro'} onChange={(e) => upd({ fx: e.target.value })} aria-label="Effect">
                  {(Object.keys(FX_NAMES) as FxKind[]).map((k) => (
                    <option key={k} value={k}>
                      {FX_NAMES[k]}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1">
                At
                <input className="field h-8 w-16 text-[11px]" type="number" step={0.1} min={0} value={+sel.t.toFixed(2)} onChange={(e) => upd({ t: Math.max(0, +e.target.value || 0) })} />s
              </label>
              <label className="flex items-center gap-1">
                For
                <input className="field h-8 w-14 text-[11px]" type="number" step={0.1} min={0.1} value={+sel.dur.toFixed(2)} onChange={(e) => upd({ dur: Math.max(0.1, +e.target.value || 1) })} />s
              </label>
              <button className="btn h-8 hover:text-err" onClick={del} aria-label="Delete cue">
                <Trash2 size={13} /> Delete
              </button>
            </>
          )}
        </div>
      )}
      {!editable && !show.cues.length && <p className="text-mute mt-1">This design has no show programmed yet.</p>}
      {editable && show.cues.some((c) => c.lane === 'fx') && !(project.decor ?? []).some((d) => ['cold-pyro', 'co2-jet', 'flame', 'confetti', 'firework', 'smoke', 'bubble'].includes(d.kind)) && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-warn">
          The effects cues have nothing to fire: this design has no pyro, CO₂ or confetti yet.
          <button
            className="btn h-7 text-[11px]"
            title="Place 2 cold pyro and 2 CO₂ jets along the stage front and a confetti cannon in the middle (move them later in Decor & FX)"
            onClick={() =>
              mutate((p) => {
                const sb = stageBounds(p)
                const cx = sb ? sb.x + sb.w / 2 : p.venue.w / 2
                const front = sb ? sb.y + sb.l + 0.6 : p.venue.l / 3
                const half = sb ? sb.w / 2 : 6
                p.decor ??= []
                for (const [k, dx] of [['cold-pyro', -half * 0.6], ['cold-pyro', half * 0.6], ['co2-jet', -half * 0.9], ['co2-jet', half * 0.9], ['confetti', 0]] as const) p.decor.push(newDecor(k, +(cx + dx).toFixed(2), +front.toFixed(2)))
              })
            }
          >
            <Flame size={12} /> Add them for me
          </button>
        </div>
      )}
    </div>
  )
}
