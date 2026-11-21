// Show timeline: music, a beat grid and three lanes of cues (lights, screens, effects) under the 3D view.
// Press play and the scene performs the show; drag cues to the beat, scrub anywhere, loop the whole thing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Music, Pause, Play, Plus, Repeat, Sparkles, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import type { Project, Show, ShowCue } from '../types'
import { clock, EMPTY_SHOW, FX_NAMES, LANES, newCue, quickShow, snapTime, tapTempo, type FxKind, type Lane } from '../lib/show'
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
  const [selId, setSelId] = useState<string | null>(null)
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
  const snapT = (t: number) => (snap ? snapTime(t, bpm, 2) : Math.round(t * 20) / 20)

  // Drag a cue (move) or its right edge (length). The whole drag is one undo step.
  const drag = (c: ShowCue, mode: 'move' | 'len') => (e: React.PointerEvent) => {
    if (!editable) return
    e.stopPropagation()
    setSelId(c.id)
    const x0 = e.clientX
    const t0 = c.t
    const d0 = c.dur
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / zoom
      edit((s) => {
        const k = s.cues.find((x) => x.id === c.id)
        if (!k) return
        if (mode === 'move') k.t = Math.max(0, Math.min(s.length, snapT(t0 + dt)))
        else k.dur = Math.max(0.1, snapT(t0 + d0 + dt) - t0)
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
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && editable) {
        e.preventDefault()
        edit((s) => void (s.cues = s.cues.filter((x) => x.id !== selId)))
        setSelId(null)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

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
        <span className="tabular-nums w-24">
          <span ref={timeText}>0:00.0</span> / {clock(show.length)}
        </span>
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
              }}
            >
              <Sparkles size={13} /> Quick show
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          <input type="range" min={6} max={80} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Timeline zoom" className="w-20" />
          <button className="btn btn-icon h-8 w-8" aria-label="Close the show timeline" onClick={onClose}>
            <X size={13} />
          </button>
        </span>
      </div>

      <div ref={scroller} className="relative overflow-x-auto overflow-y-hidden rounded-lg bg-black/30" style={{ maxWidth: '100%' }}>
        <div className="relative" style={{ width: width + LABEL_W + 20 }}>
          {/* Ruler + waveform: click to jump */}
          <div className="relative h-10 cursor-pointer" onPointerDown={(e) => seek(toTime(e.clientX))}>
            <canvas ref={wave} className="absolute top-0 h-10 pointer-events-none" style={{ left: LABEL_W, width }} />
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
              onDoubleClick={(e) => editable && add(l.id, toTime(e.clientX))}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelId(null)
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
                    className={`absolute top-1 h-6 rounded-md overflow-hidden flex items-center text-[10px] font-medium ${selId === c.id ? 'ring-2 ring-white' : 'ring-1 ring-black/40'} ${editable ? 'cursor-grab' : ''}`}
                    style={{ left: LABEL_W + c.t * zoom, width: Math.max(10, c.dur * zoom), background: cueBg(c) }}
                    title={`${cueText(c)} at ${clock(c.t)} for ${c.dur.toFixed(1)} s${editable ? ' (drag to move, drag the right edge to lengthen, Delete removes)' : ''}`}
                    onPointerDown={drag(c, 'move')}
                    onClick={(e) => (e.stopPropagation(), setSelId(c.id))}
                  >
                    <span className="px-1.5 truncate text-black mix-blend-luminosity" style={{ color: '#000', textShadow: '0 0 2px rgba(255,255,255,0.8)' }}>
                      {cueText(c)}
                    </span>
                    {editable && <span className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-black/25" onPointerDown={drag(c, 'len')} />}
                  </div>
                ))}
            </div>
          ))}
          <div ref={head} className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: 0 }} />
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 min-h-8">
          {!sel ? (
            <span className="text-mute">
              {show.cues.length ? 'Click a cue to change it. Double-click a lane (or press +) to add one at that time.' : 'Start with Quick show, or double-click a lane to add cues. Add music to line them up with the beat.'}
            </span>
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
        <p className="text-warn mt-1">Effects cues need effects placed in the design: add cold pyro, CO₂ jets, flames or confetti in Decor &amp; FX.</p>
      )}
    </div>
  )
}
