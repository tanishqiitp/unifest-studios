import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { create } from 'zustand'
import { applyDab, applyGrab, encodeSculpt, grabSet, neighbours, updateNormals, type Brush } from '../lib/sculpt'
import { useStore } from '../store'
import type { Part } from '../types'

interface SculptUI {
  on: boolean
  brush: Brush
  radius: number // metres
  strength: number // 0..1
  sym: boolean // mirror across the part's own centre (left/right)
  set: (p: Partial<SculptUI>) => void
}
export const useSculpt = create<SculptUI>((set) => ({ on: false, brush: 'draw', radius: 0.6, strength: 0.5, sym: true, set: (p) => set(p) }))

export const BRUSHES: { id: Brush; name: string; tip: string }[] = [
  { id: 'draw', name: 'Draw', tip: 'Build up or (with Ctrl) carve the surface under the brush' },
  { id: 'inflate', name: 'Inflate', tip: 'Puff the surface outwards (Ctrl: shrink)' },
  { id: 'smooth', name: 'Smooth', tip: 'Even out bumps (or hold Shift with any brush)' },
  { id: 'grab', name: 'Grab', tip: 'Pull a whole area along with the mouse' },
  { id: 'flatten', name: 'Flatten', tip: 'Press the area flat, like a palette knife' },
  { id: 'pinch', name: 'Pinch', tip: 'Draw points together for sharp creases (Ctrl: spread)' },
]

const editPart = (id: string, patch: Partial<Part>) => useStore.getState().mutate((p) => void (p.parts = (p.parts ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x))))

/**
 * Brush strokes on the selected sculpt part. Works straight on the mesh's own points while the mouse is down
 * (only the points under the brush change), then saves the shape once, as one undo step, on release.
 * Clicking off the part still orbits the camera as usual.
 */
export function SculptSession({ part, objs }: { part?: Part; objs: Record<string, THREE.Object3D> }) {
  const { camera, gl, controls, invalidate } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null; invalidate: () => void }
  const on = useSculpt((s) => s.on)
  const ring = useRef<THREE.Mesh>(null)
  const active = on && part?.kind === 'sculpt' && !part.locked ? part : undefined

  useEffect(() => {
    if (!active) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const meshes = () => {
      const out: THREE.Mesh[] = []
      objs[active.id]?.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh && m.geometry?.index && m.geometry.getAttribute('position')) out.push(m)
      })
      const g = out[0]?.geometry
      return out.filter((m) => m.geometry === g)
    }
    const hit = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      return ray.intersectObjects(meshes(), false)[0]
    }
    const avgScale = (m: THREE.Object3D) => {
      const s = m.getWorldScale(new THREE.Vector3())
      return (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3 || 1
    }
    const local = (m: THREE.Object3D, p: THREE.Vector3): [number, number, number] => m.worldToLocal(p.clone()).toArray() as [number, number, number]

    let stroke: null | {
      mesh: THREE.Mesh
      pos: Float32Array
      nrm: Float32Array
      r: number
      brush: Brush
      invert: boolean
      last: THREE.Vector3
      plane?: THREE.Plane
      startLocal?: [number, number, number]
      grab?: ReturnType<typeof grabSet>[]
    } = null
    let stroked = false

    // Shading is updated at most once per screen frame, and only around the points the brush moved.
    let queued: THREE.Mesh | null = null
    const moved = new Set<number>()
    const flush = () => {
      const m = queued
      queued = null
      if (!m) return
      const g = m.geometry
      const pos = g.getAttribute('position') as THREE.BufferAttribute
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute
      if (moved.size) updateNormals(pos.array as Float32Array, nrm.array as Float32Array, g.index!, moved, neighbours(g.index!, pos.count))
      moved.clear()
      pos.needsUpdate = true
      nrm.needsUpdate = true
      invalidate()
    }
    const refresh = (m: THREE.Mesh, pts?: Iterable<number>) => {
      if (pts) for (const i of pts) moved.add(i)
      if (!queued) requestAnimationFrame(flush)
      queued = m
    }
    const dab = (point: THREE.Vector3) => {
      if (!stroke) return
      const s = useSculpt.getState()
      const c = local(stroke.mesh, point)
      const brush = stroke.brush === 'grab' ? 'draw' : stroke.brush
      const adj = brush === 'smooth' ? neighbours(stroke.mesh.geometry.index!, stroke.pos.length / 3) : null
      const opts = { brush, radius: stroke.r, strength: s.strength, invert: stroke.invert } as const
      const a = applyDab(stroke.pos, stroke.nrm, adj, { ...opts, centre: c })
      // Mirror: the same dab on the other side of the part's centre line.
      const b = s.sym && Math.abs(c[0]) > stroke.r * 0.25 ? applyDab(stroke.pos, stroke.nrm, adj, { ...opts, centre: [-c[0], c[1], c[2]] }) : []
      refresh(stroke.mesh, [...a, ...b])
    }

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      const h = hit(e)
      if (!h) return
      // Ours: keep the camera and the click-to-select still while sculpting.
      e.stopImmediatePropagation()
      e.preventDefault()
      if (controls) controls.enabled = false
      const s = useSculpt.getState()
      const mesh = h.object as THREE.Mesh
      const geo = mesh.geometry
      const brush: Brush = e.shiftKey ? 'smooth' : s.brush
      stroke = {
        mesh,
        pos: geo.getAttribute('position').array as Float32Array,
        nrm: geo.getAttribute('normal').array as Float32Array,
        r: s.radius / avgScale(mesh),
        brush,
        invert: e.ctrlKey || e.metaKey || e.altKey,
        last: h.point.clone(),
      }
      stroked = true
      if (brush === 'grab') {
        stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), h.point)
        stroke.startLocal = local(mesh, h.point)
        const c = stroke.startLocal
        stroke.grab = [grabSet(stroke.pos, c, stroke.r)]
        if (s.sym && Math.abs(c[0]) > stroke.r * 0.25) stroke.grab.push(grabSet(stroke.pos, [-c[0], c[1], c[2]], stroke.r))
      } else dab(h.point)
      el.setPointerCapture?.(e.pointerId)
    }

    const move = (e: PointerEvent) => {
      if (stroke) {
        if (stroke.brush === 'grab' && stroke.plane && stroke.grab && stroke.startLocal) {
          const r = el.getBoundingClientRect()
          ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
          ray.setFromCamera(ndc, camera)
          const p = ray.ray.intersectPlane(stroke.plane, new THREE.Vector3())
          if (!p) return
          const now = local(stroke.mesh, p)
          const d: [number, number, number] = [now[0] - stroke.startLocal[0], now[1] - stroke.startLocal[1], now[2] - stroke.startLocal[2]]
          applyGrab(stroke.pos, stroke.grab[0], d)
          if (stroke.grab[1]) applyGrab(stroke.pos, stroke.grab[1], [-d[0], d[1], d[2]])
          refresh(stroke.mesh, stroke.grab.flatMap((g) => g.idx))
          return
        }
        const h = hit(e)
        // A dab every 20% of the radius along the stroke, filling gaps when the mouse moves fast,
        // so the result does not depend on mouse speed.
        const spacing = useSculpt.getState().radius * 0.2
        if (h) {
          const gap = h.point.distanceTo(stroke.last)
          if (gap > spacing) {
            const steps = Math.min(24, Math.floor(gap / spacing))
            const from = stroke.last.clone()
            for (let k = 1; k <= steps; k++) dab(from.clone().lerp(h.point, k / steps))
            stroke.last.copy(h.point)
          }
        }
      }
      // Brush outline under the cursor.
      const h = stroke ? null : hit(e)
      const o = ring.current
      if (!o) return
      if (h?.face) {
        const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
        o.visible = true
        o.position.copy(h.point).addScaledVector(n, 0.01)
        o.lookAt(h.point.clone().add(n))
        o.scale.setScalar(useSculpt.getState().radius)
      } else if (!stroke) o.visible = false
      invalidate()
    }

    const up = () => {
      if (!stroke) return
      const m = stroke.mesh
      flush()
      // Exact shading for the whole shape once the stroke is done.
      m.geometry.computeVertexNormals()
      m.geometry.computeBoundingSphere()
      stroke = null
      if (controls) controls.enabled = true
      // Save once per stroke: one undo step.
      const p = useStore.getState().project.parts?.find((x) => x.id === active.id)
      if (p) editPart(p.id, { sculpt: encodeSculpt(m.geometry.getAttribute('position').array as Float32Array, [p.w, p.h, p.d]) })
    }
    // A stroke ends with a click event; don't let it change the selection.
    const click = (e: MouseEvent) => {
      if (stroked) {
        e.stopImmediatePropagation()
        stroked = false
      }
    }
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return
      const s = useSculpt.getState()
      if (e.key === '[') s.set({ radius: Math.max(0.05, +(s.radius * 0.85).toFixed(2)) })
      if (e.key === ']') s.set({ radius: Math.min(10, +(s.radius * 1.15).toFixed(2)) })
    }
    // Hover (brush outline) only over the 3D view, at most once per frame; strokes follow the mouse everywhere.
    let hoverQueued: PointerEvent | null = null
    const hover = (e: PointerEvent) => {
      if (stroke) return
      if (!hoverQueued) requestAnimationFrame(() => {
        const ev = hoverQueued
        hoverQueued = null
        if (ev && !stroke) move(ev)
      })
      hoverQueued = e
    }
    const drag = (e: PointerEvent) => stroke && move(e)
    const leave = () => {
      if (stroke || !ring.current?.visible) return
      ring.current.visible = false
      invalidate()
    }
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('click', click, true)
    el.addEventListener('pointermove', hover)
    el.addEventListener('pointerleave', leave)
    window.addEventListener('pointermove', drag)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('click', click, true)
      el.removeEventListener('pointermove', hover)
      el.removeEventListener('pointerleave', leave)
      window.removeEventListener('pointermove', drag)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
      if (controls) controls.enabled = true
      if (ring.current) ring.current.visible = false
    }
  }, [active, objs, camera, gl, controls, invalidate])

  return (
    <mesh ref={ring} visible={false} renderOrder={999} userData={{ helper: true }}>
      <ringGeometry args={[0.94, 1, 64]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  )
}
