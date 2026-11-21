import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { create } from 'zustand'
import { applyDab, applyGrab, applySnake, encodePaint, encodeSculpt, grabSet, neighbours, smoothAll, updateNormals, type Brush } from '../lib/sculpt'
import { useStore } from '../store'
import type { Part } from '../types'

interface SculptUI {
  on: boolean
  brush: Brush
  radius: number // metres
  strength: number // 0..1
  sym: boolean // mirror across the part's own centre (left/right)
  color: string // paint brush colour
  maskVer: number // bumps when a mask changes, to redraw its overlay
  set: (p: Partial<SculptUI>) => void
}
export const useSculpt = create<SculptUI>((set) => ({ on: false, brush: 'draw', radius: 0.6, strength: 0.5, sym: true, color: '#d94f70', maskVer: 0, set: (p) => set(p) }))

// Brush set inspired by SculptGL (Stéphane Ginier, MIT licence): crease, twist, local scale, snake hook,
// masking and vertex paint join the original six.
export const BRUSHES: { id: Brush; name: string; tip: string }[] = [
  { id: 'draw', name: 'Draw', tip: 'Build up or (with Ctrl) carve the surface under the brush' },
  { id: 'inflate', name: 'Inflate', tip: 'Puff the surface outwards (Ctrl: shrink)' },
  { id: 'smooth', name: 'Smooth', tip: 'Even out bumps (or hold Shift with any brush)' },
  { id: 'grab', name: 'Grab', tip: 'Pull a whole area along with the mouse' },
  { id: 'snake', name: 'Snake hook', tip: 'Pull the surface out along your stroke: horns, tentacles, drips, flames' },
  { id: 'flatten', name: 'Flatten', tip: 'Press the area flat, like a palette knife' },
  { id: 'pinch', name: 'Pinch', tip: 'Draw points together for sharp edges (Ctrl: spread)' },
  { id: 'crease', name: 'Crease', tip: 'Cut a sharp groove along the stroke: folds, wrinkles, panel lines (Ctrl: a sharp ridge)' },
  { id: 'twist', name: 'Twist', tip: 'Swirl the surface around the brush (Ctrl: the other way)' },
  { id: 'scale', name: 'Scale', tip: 'Grow the area under the brush (Ctrl: shrink): bigger eyes, smaller noses' },
  { id: 'mask', name: 'Mask', tip: 'Protect an area: masked parts (dark) are not changed by other brushes. Ctrl erases the mask' },
  { id: 'paint', name: 'Paint', tip: 'Paint colour straight onto the clay (pick the colour below)' },
]

const editPart = (id: string, patch: Partial<Part>) => useStore.getState().mutate((p) => void (p.parts = (p.parts ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x))))

// Masks live while the page is open (like a selection), one per sculpt part.
const masks = new Map<string, Float32Array>()
function maskOf(id: string, count: number) {
  let m = masks.get(id)
  if (!m || m.length !== count) masks.set(id, (m = new Float32Array(count)))
  return m
}
export const hasMask = (id: string) => !!masks.get(id)?.some((v) => v > 0.01)

/** The sculpt mesh of a part (the first copy), from the 3D view's registered objects. */
function sculptMesh(obj?: THREE.Object3D) {
  let found: THREE.Mesh | undefined
  obj?.traverse((c) => {
    const m = c as THREE.Mesh
    if (!found && m.isMesh && m.geometry?.index && m.geometry.getAttribute('position') && !m.userData.helper) found = m
  })
  return found
}

/** One-click actions from the Sculpt panel. */
export function sculptAction(part: Part, obj: THREE.Object3D | undefined, what: 'invert' | 'clear' | 'relax' | 'unpaint') {
  const mesh = sculptMesh(obj)
  if (!mesh) return
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const s = useSculpt.getState()
  if (what === 'invert' || what === 'clear') {
    const m = maskOf(part.id, pos.count)
    for (let i = 0; i < m.length; i++) m[i] = what === 'clear' ? 0 : 1 - m[i]
    return s.set({ maskVer: s.maskVer + 1 })
  }
  if (what === 'unpaint') return editPart(part.id, { paint: undefined })
  // Relax: a few gentle smoothing passes over the whole shape, masked areas kept.
  const arr = pos.array as Float32Array
  const adj = neighbours(mesh.geometry.index!, pos.count)
  for (let k = 0; k < 3; k++) smoothAll(arr, adj, 0.5, masks.get(part.id))
  editPart(part.id, { sculpt: encodeSculpt(arr, [part.w, part.h, part.d]) })
}

/**
 * Brush strokes on the selected sculpt part. Works straight on the mesh's own points while the mouse is down
 * (only the points under the brush change), then saves the shape once, as one undo step, on release.
 * Clicking off the part still orbits the camera as usual. A pen's pressure scales the strength.
 */
export function SculptSession({ part, objs }: { part?: Part; objs: Record<string, THREE.Object3D> }) {
  const { camera, gl, controls, invalidate } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null; invalidate: () => void }
  const on = useSculpt((s) => s.on)
  const maskVer = useSculpt((s) => s.maskVer)
  const ring = useRef<THREE.Mesh>(null)
  const overlay = useRef<{ mesh: THREE.Mesh; col: THREE.BufferAttribute } | null>(null)
  const active = on && part?.kind === 'sculpt' && !part.locked ? part : undefined

  // Mask overlay: a dark see-through skin over the masked points, sharing the sculpt's own positions.
  useEffect(() => {
    if (!active) return
    const mesh = sculptMesh(objs[active.id])
    if (!mesh) return
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const mask = maskOf(active.id, pos.count)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', pos)
    g.setIndex(mesh.geometry.index)
    const col = new THREE.BufferAttribute(new Float32Array(pos.count * 4), 4)
    for (let i = 0; i < pos.count; i++) col.setXYZW(i, 0.05, 0.06, 0.12, mask[i] * 0.75)
    g.setAttribute('color', col)
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    const o = new THREE.Mesh(g, mat)
    o.userData.helper = true
    o.renderOrder = 2
    o.raycast = () => {}
    mesh.add(o)
    overlay.current = { mesh: o, col }
    invalidate()
    return () => {
      mesh.remove(o)
      g.dispose()
      mat.dispose()
      overlay.current = null
      invalidate()
    }
  }, [active, objs, maskVer, invalidate])

  useEffect(() => {
    if (!active) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const meshes = () => {
      const out: THREE.Mesh[] = []
      objs[active.id]?.traverse((c) => {
        const m = c as THREE.Mesh
        if (m.isMesh && m.geometry?.index && m.geometry.getAttribute('position') && !m.userData.helper) out.push(m)
      })
      const g = out[0]?.geometry
      return out.filter((m) => m.geometry === g)
    }
    const setRay = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
    }
    const hit = (e: PointerEvent) => {
      setRay(e)
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
      press: number
      last: THREE.Vector3
      mask: Float32Array
      colors?: Float32Array
      color?: [number, number, number]
      plane?: THREE.Plane
      startLocal?: [number, number, number]
      prevLocal?: [number, number, number]
      grab?: ReturnType<typeof grabSet>[]
    } = null
    let stroked = false

    // Shading is updated at most once per screen frame, and only around the points the brush moved.
    let queued: THREE.Mesh | null = null
    const moved = new Set<number>()
    const recolour = new Set<number>()
    let paintDirty = false
    const flush = () => {
      const m = queued
      queued = null
      if (!m) return
      const g = m.geometry
      const pos = g.getAttribute('position') as THREE.BufferAttribute
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute
      if (moved.size) {
        updateNormals(pos.array as Float32Array, nrm.array as Float32Array, g.index!, moved, neighbours(g.index!, pos.count))
        pos.needsUpdate = true
        nrm.needsUpdate = true
      }
      moved.clear()
      if (recolour.size && overlay.current) {
        const mask = maskOf(active.id, pos.count)
        for (const i of recolour) overlay.current.col.setW(i, mask[i] * 0.75)
        overlay.current.col.needsUpdate = true
      }
      recolour.clear()
      if (paintDirty) {
        const c = g.getAttribute('color') as THREE.BufferAttribute | undefined
        if (c) c.needsUpdate = true
        paintDirty = false
      }
      invalidate()
    }
    const refresh = (m: THREE.Mesh, pts: Iterable<number>, kind: Brush) => {
      if (kind === 'mask') for (const i of pts) recolour.add(i)
      else if (kind === 'paint') paintDirty = true
      else for (const i of pts) moved.add(i)
      if (!queued) requestAnimationFrame(flush)
      queued = m
    }
    const dab = (point: THREE.Vector3) => {
      if (!stroke) return
      const s = useSculpt.getState()
      const c = local(stroke.mesh, point)
      const brush = stroke.brush === 'grab' || stroke.brush === 'snake' ? 'draw' : stroke.brush
      const adj = brush === 'smooth' ? neighbours(stroke.mesh.geometry.index!, stroke.pos.length / 3) : null
      const opts = { brush, radius: stroke.r, strength: s.strength * stroke.press, invert: stroke.invert, mask: stroke.mask, colors: stroke.colors, color: stroke.color } as const
      const a = applyDab(stroke.pos, stroke.nrm, adj, { ...opts, centre: c })
      // Mirror: the same dab on the other side of the part's centre line (twist turns the other way).
      const b = s.sym && Math.abs(c[0]) > stroke.r * 0.25 ? applyDab(stroke.pos, stroke.nrm, adj, { ...opts, invert: brush === 'twist' ? !opts.invert : opts.invert, centre: [-c[0], c[1], c[2]] }) : []
      refresh(stroke.mesh, [...a, ...b], brush)
    }

    // Paint needs a colour per point: start from the part's colour the first time.
    const paintBuffer = (mesh: THREE.Mesh, p: Part) => {
      const g = mesh.geometry
      let c = g.getAttribute('color') as THREE.BufferAttribute | undefined
      if (!c) {
        const n = g.getAttribute('position').count
        const base = new THREE.Color(p.mat.color)
        const arr = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) arr.set([base.r, base.g, base.b], i * 3)
        c = new THREE.BufferAttribute(arr, 3)
        g.setAttribute('color', c)
        const mat = mesh.material as THREE.MeshStandardMaterial
        mat.vertexColors = true
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }
      return c.array as Float32Array
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
      const p = useStore.getState().project.parts?.find((x) => x.id === active.id) ?? active
      const posArr = geo.getAttribute('position').array as Float32Array
      stroke = {
        mesh,
        pos: posArr,
        nrm: geo.getAttribute('normal').array as Float32Array,
        r: s.radius / avgScale(mesh),
        brush,
        invert: e.ctrlKey || e.metaKey || e.altKey,
        press: e.pointerType === 'pen' ? Math.max(0.15, e.pressure || 0.5) : 1,
        last: h.point.clone(),
        mask: maskOf(active.id, posArr.length / 3),
      }
      if (brush === 'paint') {
        stroke.colors = paintBuffer(mesh, p)
        const c = new THREE.Color(s.color)
        stroke.color = [c.r, c.g, c.b]
      }
      stroked = true
      if (brush === 'grab' || brush === 'snake') {
        stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), h.point)
        stroke.startLocal = local(mesh, h.point)
        stroke.prevLocal = stroke.startLocal
        const c = stroke.startLocal
        if (brush === 'grab') {
          stroke.grab = [grabSet(stroke.pos, c, stroke.r, stroke.mask)]
          if (s.sym && Math.abs(c[0]) > stroke.r * 0.25) stroke.grab.push(grabSet(stroke.pos, [-c[0], c[1], c[2]], stroke.r, stroke.mask))
        }
      } else dab(h.point)
      el.setPointerCapture?.(e.pointerId)
    }

    const move = (e: PointerEvent) => {
      if (stroke) {
        if (e.pointerType === 'pen') stroke.press = Math.max(0.15, e.pressure || 0.5)
        if ((stroke.brush === 'grab' || stroke.brush === 'snake') && stroke.plane && stroke.startLocal) {
          setRay(e)
          const p = ray.ray.intersectPlane(stroke.plane, new THREE.Vector3())
          if (!p) return
          const now = local(stroke.mesh, p)
          if (stroke.brush === 'grab' && stroke.grab) {
            const d: [number, number, number] = [now[0] - stroke.startLocal[0], now[1] - stroke.startLocal[1], now[2] - stroke.startLocal[2]]
            applyGrab(stroke.pos, stroke.grab[0], d)
            if (stroke.grab[1]) applyGrab(stroke.pos, stroke.grab[1], [-d[0], d[1], d[2]])
            refresh(stroke.mesh, stroke.grab.flatMap((g) => g.idx), 'grab')
            return
          }
          // Snake hook: move what is under the brush now by this step, in small steps so it stays smooth.
          const prev = stroke.prevLocal!
          const total: [number, number, number] = [now[0] - prev[0], now[1] - prev[1], now[2] - prev[2]]
          const len = Math.hypot(...total)
          const steps = Math.max(1, Math.min(20, Math.ceil(len / (stroke.r * 0.15))))
          const st: [number, number, number] = [total[0] / steps, total[1] / steps, total[2] / steps]
          const sym = useSculpt.getState().sym
          let c: [number, number, number] = [...prev]
          const pts: number[] = []
          for (let k = 0; k < steps; k++) {
            pts.push(...applySnake(stroke.pos, c, stroke.r, st, stroke.mask))
            if (sym && Math.abs(c[0]) > stroke.r * 0.25) pts.push(...applySnake(stroke.pos, [-c[0], c[1], c[2]], stroke.r, [-st[0], st[1], st[2]], stroke.mask))
            c = [c[0] + st[0], c[1] + st[1], c[2] + st[2]]
          }
          stroke.prevLocal = now
          refresh(stroke.mesh, pts, 'snake')
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
      const brush = stroke.brush
      flush()
      stroke = null
      if (controls) controls.enabled = true
      // The mask is not part of the saved design; nothing to save.
      if (brush === 'mask') return
      const p = useStore.getState().project.parts?.find((x) => x.id === active.id)
      if (!p) return
      if (brush === 'paint') {
        const c = m.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
        if (c) editPart(p.id, { paint: encodePaint(c.array as Float32Array) })
        return
      }
      // Exact shading for the whole shape once the stroke is done. Save once per stroke: one undo step.
      m.geometry.computeVertexNormals()
      m.geometry.computeBoundingSphere()
      editPart(p.id, { sculpt: encodeSculpt(m.geometry.getAttribute('position').array as Float32Array, [p.w, p.h, p.d]) })
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
      if (!hoverQueued)
        requestAnimationFrame(() => {
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
