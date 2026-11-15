import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { Move3d, Rotate3d } from 'lucide-react'
import { useStore } from '../store'
import type { Project, SetPiece } from '../types'
import { setLine } from '../lib/setpieces'
import { SetItems } from './Set3D'

export type Cam = 'iso' | 'front' | 'top' | 'side'

// CAD-style 3D viewport for the Set workspace: orbit around, click a piece, drag the arrows to move it along X, Y or Z.
export function SetCad3D({ compact }: { compact?: boolean }) {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.ui.selection)
  const { select } = useStore.getState()
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate')
  const [cam, setCam] = useState<{ v: Cam; n: number }>({ v: 'iso', n: 0 })
  const piece = sel?.kind === 'set' ? project.set?.find((p) => p.id === sel.id && !p.mirrorOf) : undefined
  const L = setLine(project)
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [L.cx + 28, 22, L.y + 34], fov: 40, near: 0.1, far: 2000 }}
        onPointerMissed={(e) => e.button === 0 && select(null)}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#070707']} />
        <hemisphereLight args={['#ffffff', '#202020', 1.4]} />
        <directionalLight position={[L.cx + 20, 40, L.y + 30]} intensity={1.6} />
        <Grid position={[L.cx, 0.001, L.y + 10]} args={[200, 200]} cellSize={1} sectionSize={5} cellColor="#1d1d1d" sectionColor="#333333" fadeDistance={160} infiniteGrid />
        <Context project={project} />
        <SetItems project={project} show={false} dropAt={0} onInfo={() => undefined} onPick={(id) => select({ kind: 'set', id })} />
        {piece && <Handle s={piece} mode={mode} />}
        <CamRig cam={cam} cx={L.cx} cy={L.y} />
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
        <span className="mx-1 h-4 w-px bg-line" />
        <button className={`btn btn-icon h-7 w-7 ${mode === 'translate' ? 'btn-on' : ''}`} title="Move along X, Y, Z (G)" onClick={() => setMode('translate')}>
          <Move3d size={14} />
        </button>
        <button className={`btn btn-icon h-7 w-7 ${mode === 'rotate' ? 'btn-on' : ''}`} title="Turn around (in 15° steps)" onClick={() => setMode('rotate')}>
          <Rotate3d size={14} />
        </button>
      </div>
      {!compact && <div className="absolute left-4 bottom-4 text-[11px] text-mute">Drag to orbit · right-drag to pan · scroll to zoom · click a piece, then drag the arrows (red X across, blue Y depth, green Z height)</div>}
    </div>
  )
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

// Wireframe box around the selected piece with move / turn handles. Commits on release (one undo step).
function Handle({ s, mode }: { s: SetPiece; mode: 'translate' | 'rotate' }) {
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
      <group key={`${s.id}-${nonce}`} ref={ref} position={[s.x, s.z + s.h / 2, s.y]} rotation-y={-THREE.MathUtils.degToRad(s.rot ?? 0)}>
        <mesh>
          <boxGeometry args={[s.w + 0.1, s.h + 0.1, s.d + 0.1]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.6} />
        </mesh>
      </group>
      <TransformControls
        key={`${s.id}-${nonce}-${mode}`}
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

// Stage decks and truss for reference.
function Context({ project }: { project: Project }) {
  return (
    <group>
      {project.decks.map((d) => (
        <mesh key={d.id} position={[d.x + d.w / 2, d.h / 2, d.y + d.l / 2]}>
          <boxGeometry args={[d.w, d.h, d.l]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.8} />
        </mesh>
      ))}
      {project.truss.map((t) => {
        const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1)
        const size = t.type === 'box40' ? 0.4 : 0.3
        const col = t.finish === 'black' ? '#2a2a2a' : t.finish === 'white' ? '#eeeeee' : '#9a9a9a'
        return (
          <group key={t.id}>
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
    </group>
  )
}
