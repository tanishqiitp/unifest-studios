import { StudioEnv } from './StudioEnv'
import { Safe3D, useGlCreated } from '../components/Safe3D'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PartsScene } from './Parts3D'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { Move3d, Rotate3d } from 'lucide-react'
import { useStore } from '../store'
import type { Project, SetPiece } from '../types'
import { setLine } from '../lib/setpieces'
import { applyBox, CAD_EDITS, cadItems, type CadItem, type CadKind } from '../lib/cad'
import { useTheme } from '../lib/theme'
import { snapBox } from '../lib/snap'
import { screenStats } from '../lib/calc'
import { SetItems } from './Set3D'

export type Cam = 'iso' | 'front' | 'top' | 'side'

// CAD-style 3D viewport: orbit around, click an item, drag the arrows to move it along X, Y or Z.
// `edit` is the workspace: only its own kind of item can be picked and moved; the rest is reference.
export function SetCad3D(props: { compact?: boolean; edit?: string; onExit?: () => void }) {
  return (
    <Safe3D onExit={props.onExit} exitLabel="Use 2D views">
      <SetCad3DView compact={props.compact} edit={props.edit} />
    </Safe3D>
  )
}

function SetCad3DView({ compact, edit = 'set' }: { compact?: boolean; edit?: string }) {
  const glCreated = useGlCreated()
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { select } = useStore.getState()
  const light = useTheme((t) => t.theme === 'light')
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate')
  const [cam, setCam] = useState<{ v: Cam; n: number }>({ v: 'iso', n: 0 })
  // The item being dragged: its solid is hidden and a preview moves with the arrows instead.
  const [drag, setDrag] = useState<string | null>(null)
  const kinds = CAD_EDITS[edit] ?? []
  const items = useMemo(() => cadItems(project), [project])
  const piece = edit === 'set' && sel?.kind === 'set' ? project.set?.find((p) => p.id === sel.id && !p.mirrorOf) : undefined
  const item = edit !== 'set' && sel ? items.find((i) => i.kind === sel.kind && i.id === sel.id && kinds.includes(i.kind) && !i.locked) : undefined
  const pick = (kind: CadKind, id: string) => kinds.includes(kind) && select({ kind, id })
  const L = setLine(project)
  return (
    <div className="absolute inset-0">
      <Canvas
        onCreated={glCreated}
        dpr={[1, 1.5]}
        camera={{ position: [L.cx + 28, 22, L.y + 34], fov: 40, near: 0.1, far: 2000 }}
        onPointerMissed={(e) => e.button === 0 && select(null)}
        gl={{ antialias: true }}
      >
        <color attach="background" args={[light ? '#f2f2f2' : '#070707']} />
        <hemisphereLight args={['#ffffff', light ? '#9a9a9a' : '#202020', light ? 1.8 : 1.4]} />
        <StudioEnv />
        <directionalLight position={[L.cx + 20, 40, L.y + 30]} intensity={1.6} />
        <Grid position={[L.cx, 0.001, L.y + 10]} args={[200, 200]} cellSize={1} sectionSize={5} cellColor={light ? '#d6d6d6' : '#1d1d1d'} sectionColor={light ? '#b0b0b0' : '#333333'} fadeDistance={160} infiniteGrid />
        <Things project={project} pick={pick} hide={drag} />
        <SetItems project={project} show={false} dropAt={0} onInfo={() => undefined} onPick={(id) => pick('set', id)} />
        <PartsScene project={project} />
        {piece && <SetHandle s={piece} mode={mode} />}
        {item && <BoxHandle item={item} onDrag={setDrag} />}
        <CamRig cam={cam} cx={L.cx} cy={L.y} />
        {import.meta.env.DEV && <DevScene />}
        <GizmoHelper alignment="bottom-right" margin={compact ? [56, 56] : [80, 110]}>
          <GizmoViewport axisColors={['#e5484d', '#46a758', '#3e63dd']} labels={['X', 'Z', 'Y']} labelColor="#000" />
        </GizmoHelper>
      </Canvas>
      <div className="absolute top-3 right-3 glass rounded-lg flex items-center gap-1 p-1 text-[11px]">
        {(['iso', 'front', 'top', 'side'] as Cam[]).map((v) => (
          <button key={v} className="btn h-7 px-2 capitalize" onClick={() => setCam((c) => ({ v, n: c.n + 1 }))}>
            {v === 'iso' ? '3D' : v}
          </button>
        ))}
        {edit === 'set' && (
          <>
            <span className="mx-1 h-4 w-px bg-line" />
            <button className={`btn btn-icon h-7 w-7 ${mode === 'translate' ? 'btn-on' : ''}`} title="Move along X, Y, Z" onClick={() => setMode('translate')}>
              <Move3d size={14} />
            </button>
            <button className={`btn btn-icon h-7 w-7 ${mode === 'rotate' ? 'btn-on' : ''}`} title="Turn around (in 15° steps)" onClick={() => setMode('rotate')}>
              <Rotate3d size={14} />
            </button>
          </>
        )}
      </div>
      {!compact && <div className="absolute left-4 bottom-4 text-[11px] text-mute">Drag to orbit · right-drag to pan · scroll to zoom · click an item, then drag the arrows (red X across, blue Y depth, green Z height)</div>}
    </div>
  )
}

// Development only: exposes the scene for checks in the browser console.
function DevScene() {
  const scene = useThree((s) => s.scene)
  useEffect(() => void ((window as unknown as { __cad: unknown }).__cad = scene), [scene])
  return null
}

function CamRig({ cam, cx, cy }: { cam: { v: Cam; n: number }; cx: number; cy: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null }
  useEffect(() => {
    if (!cam.n) return
    const tgt = new THREE.Vector3(cx, 5, cy)
    const pos = cam.v === 'front' ? [cx, 6, cy + 45] : cam.v === 'top' ? [cx, 60, cy + 0.01] : cam.v === 'side' ? [cx - 50, 6, cy] : [cx + 28, 22, cy + 34]
    camera.position.set(pos[0], pos[1], pos[2])
    if (controls) {
      controls.target.copy(tgt)
      controls.update()
    } else camera.lookAt(tgt)
  }, [cam, cx, cy, camera, controls])
  return <OrbitControls makeDefault target={[cx, 5, cy]} maxPolarAngle={Math.PI / 2 - 0.02} />
}

// Wireframe box around the selected set piece with move / turn handles. Commits on release (one undo step).
function SetHandle({ s, mode }: { s: SetPiece; mode: 'translate' | 'rotate' }) {
  const { mutate } = useStore.getState()
  const ref = useRef<THREE.Group>(null)
  const [nonce, setNonce] = useState(0)
  const commit = () => {
    const o = ref.current
    if (!o) return
    mutate((p) => {
      const t = p.set!.find((x) => x.id === s.id)!
      if (mode === 'translate') {
        t.x = +o.position.x.toFixed(2)
        t.y = +o.position.z.toFixed(2)
        t.z = +Math.max(0, o.position.y - s.h / 2).toFixed(2)
      } else {
        const deg = Math.round(-THREE.MathUtils.radToDeg(o.rotation.y) / 5) * 5
        t.rot = ((deg % 360) + 360) % 360 || undefined
      }
    })
    setNonce((n) => n + 1)
  }
  return (
    <>
      <group key={`box-${s.id}-${nonce}`} ref={ref} position={[s.x, s.z + s.h / 2, s.y]} rotation-y={-THREE.MathUtils.degToRad(s.rot ?? 0)}>
        <SelBox w={s.w} h={s.h} d={s.d} />
      </group>
      <TransformControls
        key={`ctl-${s.id}-${nonce}-${mode}`}
        object={ref as React.RefObject<THREE.Object3D>}
        mode={mode}
        size={0.9}
        translationSnap={0.25}
        rotationSnap={THREE.MathUtils.degToRad(15)}
        showX={mode === 'translate'}
        showZ={mode === 'translate'}
        onMouseUp={commit}
      />
    </>
  )
}

// Move handle for decks, truss, lights, screens and decor.
function BoxHandle({ item, onDrag }: { item: CadItem; onDrag: (id: string | null) => void }) {
  const { mutate } = useStore.getState()
  const ref = useRef<THREE.Group>(null)
  const [nonce, setNonce] = useState(0)
  const b = item.box
  const c = new THREE.Vector3((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.y0 + b.y1) / 2)
  const commit = () => {
    const o = ref.current
    if (!o) return
    const dx = o.position.x - c.x
    const dz = o.position.y - c.y
    const dy = o.position.z - c.z
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 0.001) {
      let nb = { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, z0: b.z0 + dz, z1: b.z1 + dz }
      // Magnet on: line up with nearby items' edges and centres, sit on tops or the floor.
      const { ui, project } = useStore.getState()
      if (ui.magnet) nb = snapBox(nb, cadItems(project).filter((o) => !(o.kind === item.kind && o.id === item.id)).map((o) => o.box), 0.3)
      mutate((p) => applyBox(p, item.kind, item.id, b, nb))
    }
    setNonce((n) => n + 1)
    setMoving(false)
    onDrag(null)
  }
  const [moving, setMoving] = useState(false)
  useEffect(() => () => onDrag(null), [onDrag])
  return (
    <>
      <group key={`box-${item.id}-${nonce}`} ref={ref} position={c}>
        <SelBox w={b.x1 - b.x0} h={b.z1 - b.z0} d={b.y1 - b.y0} fill={moving ? item.color : undefined} />
      </group>
      <TransformControls
        key={`ctl-${item.id}-${nonce}`}
        object={ref as React.RefObject<THREE.Object3D>}
        mode="translate"
        size={0.9}
        translationSnap={0.25}
        showY={item.kind !== 'deck'}
        onMouseDown={() => (setMoving(true), onDrag(item.id))}
        onMouseUp={commit}
      />
    </>
  )
}

function SelBox({ w, h, d, fill }: { w: number; h: number; d: number; fill?: string }) {
  const light = useTheme((t) => t.theme === 'light')
  return (
    <>
      <mesh>
        <boxGeometry args={[w + 0.1, h + 0.1, d + 0.1]} />
        <meshBasicMaterial color={light ? '#000000' : '#ffffff'} wireframe transparent opacity={0.6} />
      </mesh>
      {fill && (
        <mesh>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={fill} roughness={0.7} transparent opacity={0.85} />
        </mesh>
      )}
    </>
  )
}

// Decks, truss, lights, screens and decor as simple solids (the 3D Visualizer shows the full look).
export function Things({ project, pick, hide }: { project: Project; pick: (k: CadKind, id: string) => void; hide?: string | null }) {
  const on = (k: CadKind, id: string) => (e: ThreeEvent<MouseEvent>) => (e.stopPropagation(), pick(k, id))
  return (
    <group>
      {project.decks.filter((x) => x.id !== hide).map((d) => (
        <mesh key={d.id} position={[d.x + d.w / 2, d.h / 2, d.y + d.l / 2]} onClick={on('deck', d.id)}>
          <boxGeometry args={[d.w, d.h, d.l]} />
          <meshStandardMaterial color={d.color ?? '#2a2a2a'} roughness={0.8} />
        </mesh>
      ))}
      {project.truss.filter((x) => x.id !== hide).map((t) => {
        const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
        const size = t.type === 'box40' ? 0.4 : 0.3
        const col = t.finish === 'black' ? '#2a2a2a' : t.finish === 'white' ? '#eeeeee' : '#9a9a9a'
        return (
          <group key={t.id} onClick={on('truss', t.id)}>
            <mesh position={[(t.x1 + t.x2) / 2, t.height, (t.y1 + t.y2) / 2]} rotation-y={-Math.atan2(t.y2 - t.y1, t.x2 - t.x1)}>
              <boxGeometry args={[len, size, size]} />
              <meshStandardMaterial color={col} wireframe />
            </mesh>
            {t.legs &&
              [
                [t.x1, t.y1],
                [t.x2, t.y2],
              ].map(([x, y], i) => (
                <mesh key={i} position={[x, t.height / 2, y]}>
                  <boxGeometry args={[size, t.height, size]} />
                  <meshStandardMaterial color={col} wireframe />
                </mesh>
              ))}
          </group>
        )
      })}
      {project.fixtures.filter((x) => x.id !== hide).map((f) => (
        <mesh key={f.id} position={[f.x, f.z - 0.22, f.y]} onClick={on('fixture', f.id)}>
          <boxGeometry args={[0.3, 0.4, 0.3]} />
          <meshStandardMaterial color={f.color ?? '#151515'} emissive={f.color ?? '#000'} emissiveIntensity={f.color ? 0.6 : 0} />
        </mesh>
      ))}
      {project.screens.filter((x) => x.id !== hide).map((s) => {
        const st = screenStats(s, project.customPanels)
        return (
          <group key={s.id} position={[s.x, s.z, s.y]} rotation-y={-THREE.MathUtils.degToRad(s.rotation)} onClick={on('screen', s.id)}>
            <mesh position={[st.w / 2, st.h / 2, 0]}>
              <boxGeometry args={[st.w, st.h, 0.12]} />
              <meshStandardMaterial color="#0d1424" emissive="#3a5aa8" emissiveIntensity={0.5} />
            </mesh>
          </group>
        )
      })}
      {(project.decor ?? []).filter((x) => x.id !== hide).map((d) => (
        <mesh key={d.id} position={[d.x, d.z + d.h / 2, d.y]} rotation-y={-THREE.MathUtils.degToRad(d.rotation)} onClick={on('decor', d.id)}>
          <boxGeometry args={[d.w, d.h, d.d]} />
          <meshStandardMaterial color={d.color} roughness={0.7} transparent opacity={0.85} />
        </mesh>
      ))}
    </group>
  )
}
