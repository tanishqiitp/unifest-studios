import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import type Konva from 'konva'
import { useStore } from '../store'
import { fmtLen } from '../lib/calc'

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export interface CanvasApi {
  fit: () => void
  zoom: (f: number) => void
  stage: () => Konva.Stage | null
}

interface View {
  scale: number // px per metre
  ox: number
  oy: number
}

const ViewCtx = createContext<View>({ scale: 20, ox: 0, oy: 0 })
export const useView = () => useContext(ViewCtx)

interface Props {
  bounds: Bounds
  grid?: Bounds
  children: ReactNode
  apiRef?: Ref<CanvasApi>
  onBackground?: () => void
  onWorldDown?: (p: { x: number; y: number }, e: Konva.KonvaEventObject<MouseEvent>) => void
  onWorldMove?: (p: { x: number; y: number }) => void
  onWorldUp?: (p: { x: number; y: number }) => void
  cursor?: string
  overlay?: ReactNode
}

export function PlanCanvas({ bounds, grid, children, apiRef, onBackground, onWorldDown, onWorldMove, onWorldUp, cursor, overlay }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [view, setView] = useState<View>({ scale: 20, ox: 40, oy: 40 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [measure, setMeasure] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null)
  const tool = useStore((s) => s.ui.tool)
  const units = useStore((s) => s.project.units)
  const fitted = useRef(false)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const pad = 60
    const scale = Math.max(1, Math.min((size.w - pad * 2) / Math.max(bounds.w, 1), (size.h - pad * 2) / Math.max(bounds.h, 1)))
    setView({ scale, ox: (size.w - bounds.w * scale) / 2 - bounds.x * scale, oy: (size.h - bounds.h * scale) / 2 - bounds.y * scale })
  }, [bounds.x, bounds.y, bounds.w, bounds.h, size.w, size.h])

  useEffect(() => {
    if (!fitted.current && size.w > 100) {
      fit()
      fitted.current = true
    }
  }, [fit, size.w])

  const zoomAt = (f: number, cx = size.w / 2, cy = size.h / 2) =>
    setView((v) => {
      const scale = Math.min(400, Math.max(1, v.scale * f))
      const k = scale / v.scale
      return { scale, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k }
    })

  useImperativeHandle(apiRef, () => ({ fit, zoom: (f) => zoomAt(f), stage: () => stageRef.current }))

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const panning = tool === 'pan' || spaceDown
  const toWorld = () => {
    const p = stageRef.current?.getPointerPosition()
    if (!p) return { x: 0, y: 0 }
    return { x: (p.x - view.ox) / view.scale, y: (p.y - view.oy) / view.scale }
  }

  const g = grid ?? bounds
  const gridLines = useMemo(() => {
    const lines: { pts: number[]; major: boolean }[] = []
    const step = view.scale < 4 ? 5 : 1
    const x0 = Math.floor(g.x)
    const y0 = Math.floor(g.y)
    for (let x = x0; x <= g.x + g.w + 0.001; x += step) lines.push({ pts: [x, g.y, x, g.y + g.h], major: x % 5 === 0 })
    for (let y = y0; y <= g.y + g.h + 0.001; y += step) lines.push({ pts: [g.x, y, g.x + g.w, y], major: y % 5 === 0 })
    return lines
  }, [g.x, g.y, g.w, g.h, view.scale])

  return (
    <ViewCtx.Provider value={view}>
      <div ref={wrap} className="absolute inset-0" style={{ cursor: panning ? 'grab' : tool === 'measure' ? 'crosshair' : cursor }}>
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          draggable={panning}
          x={view.ox}
          y={view.oy}
          scaleX={view.scale}
          scaleY={view.scale}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setView((v) => ({ ...v, ox: e.target.x(), oy: e.target.y() }))
          }}
          onWheel={(e) => {
            e.evt.preventDefault()
            const p = stageRef.current?.getPointerPosition()
            zoomAt(e.evt.deltaY < 0 ? 1.12 : 1 / 1.12, p?.x, p?.y)
          }}
          onMouseDown={(e) => {
            if (panning) return
            const w = toWorld()
            if (tool === 'measure') {
              setMeasure({ a: w, b: w })
              return
            }
            if (e.target === stageRef.current || e.target.name() === 'bg') onBackground?.()
            onWorldDown?.(w, e)
          }}
          onMouseMove={() => {
            const w = toWorld()
            if (tool === 'measure' && measure) setMeasure({ ...measure, b: w })
            onWorldMove?.(w)
          }}
          onMouseUp={() => {
            const w = toWorld()
            onWorldUp?.(w)
          }}
        >
          <Layer listening={false}>
            {gridLines.map((l, i) => (
              <Line key={i} points={l.pts} stroke={l.major ? '#1f1f1f' : '#141414'} strokeWidth={1} strokeScaleEnabled={false} />
            ))}
          </Layer>
          <Layer>
            <Rect name="bg" x={g.x - 1000} y={g.y - 1000} width={g.w + 2000} height={g.h + 2000} fill="transparent" />
            {children}
          </Layer>
          {measure && (
            <Layer listening={false}>
              <Group>
                <Line points={[measure.a.x, measure.a.y, measure.b.x, measure.b.y]} stroke="#fff" strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} />
                <Text
                  x={(measure.a.x + measure.b.x) / 2}
                  y={(measure.a.y + measure.b.y) / 2}
                  text={fmtLen(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y), units)}
                  fontSize={14 / view.scale}
                  fontFamily="JetBrains Mono"
                  fill="#fff"
                  offsetY={18 / view.scale}
                />
              </Group>
            </Layer>
          )}
        </Stage>
        {overlay}
        <ZoomBar scale={view.scale} onIn={() => zoomAt(1.25)} onOut={() => zoomAt(0.8)} onFit={fit} onClearMeasure={measure ? () => setMeasure(null) : undefined} />
      </div>
    </ViewCtx.Provider>
  )
}

function ZoomBar({ scale, onIn, onOut, onFit, onClearMeasure }: { scale: number; onIn: () => void; onOut: () => void; onFit: () => void; onClearMeasure?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'f' || e.key === 'F') onFit()
      if (e.key === '=' || e.key === '+') onIn()
      if (e.key === '-') onOut()
      if (e.key === 'Escape') onClearMeasure?.()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onFit, onIn, onOut, onClearMeasure])
  return (
    <div className="absolute bottom-4 right-4 glass rounded-lg flex items-center gap-1 p-1 text-xs">
      {onClearMeasure && (
        <button className="btn h-7" onClick={onClearMeasure}>
          Clear measure
        </button>
      )}
      <button className="btn btn-icon h-7 w-7" onClick={onOut} aria-label="Zoom out">
        −
      </button>
      <span className="mono text-dim w-14 text-center">{Math.round(scale)} px/m</span>
      <button className="btn btn-icon h-7 w-7" onClick={onIn} aria-label="Zoom in">
        +
      </button>
      <button className="btn h-7" onClick={onFit}>
        Fit
      </button>
    </div>
  )
}

// Snap helper: half-metre grid when magnet is on.
export function useSnap() {
  const magnet = useStore((s) => s.ui.magnet)
  return useCallback((v: number, step = 0.5) => (magnet ? Math.round(v / step) * step : Math.round(v * 100) / 100), [magnet])
}
