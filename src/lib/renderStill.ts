// High-quality still image from the current camera, rendered once on request.
// Several passes are averaged: the key light moves a little each pass (soft shadows) and the camera shifts
// by under a pixel (smooth edges). Editing stays as fast as before because nothing here runs per frame.
import * as THREE from 'three'

export interface StillOptions {
  width: number
  height: number
  passes: number // 8–24: more = softer shadows, slower
  onProgress?: (f: number) => void
}

const isHelper = (o: THREE.Object3D) =>
  !!o.userData?.helper || !!(o as unknown as { isTransformControls?: boolean }).isTransformControls || !!(o as unknown as { isTransformControlsGizmo?: boolean }).isTransformControlsGizmo || !!(o as unknown as { isTransformControlsPlane?: boolean }).isTransformControlsPlane

export async function renderStill(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: StillOptions): Promise<Blob> {
  const { width: W, height: H } = o
  const passes = Math.max(1, Math.min(24, Math.round(o.passes)))
  const undo: (() => void)[] = []

  // 1. Hide editor helpers (grid, outlines, move handles, brush ring).
  scene.traverse((x) => {
    if (x.visible && isHelper(x)) {
      x.visible = false
      undo.push(() => (x.visible = true))
    }
  })

  // 2. Shadows on for this render only.
  const box = new THREE.Box3()
  scene.traverse((x) => {
    const m = x as THREE.Mesh
    if (!m.isMesh || !m.visible) return
    const was = [m.castShadow, m.receiveShadow] as const
    m.castShadow = true
    m.receiveShadow = true
    undo.push(() => ([m.castShadow, m.receiveShadow] = was))
    if (m.geometry) box.expandByObject(m)
  })
  const sm = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type }
  gl.shadowMap.enabled = true
  gl.shadowMap.type = THREE.PCFSoftShadowMap
  undo.push(() => ((gl.shadowMap.enabled = sm.enabled), (gl.shadowMap.type = sm.type)))
  const recompile = () => scene.traverse((x) => ((x as THREE.Mesh).material as THREE.Material | undefined) && (((x as THREE.Mesh).material as THREE.Material).needsUpdate = true))
  recompile()
  undo.push(recompile)

  // 3. A soft key light sized to the scene, plus a ground that catches its shadows.
  if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(20, 10, 20))
  const centre = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const reach = Math.max(size.x, size.z, size.y) * 0.8 + 5
  const key = new THREE.DirectionalLight('#ffffff', 1.4)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: reach * 6 })
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.target.position.copy(centre)
  scene.add(key, key.target)
  // A studio floor just lighter than the background, so shadows read on dark scenes as well as light ones.
  const bg = scene.background instanceof THREE.Color ? scene.background.clone() : new THREE.Color('#0b0b0b')
  const floorColor = bg.clone().offsetHSL(0, 0, bg.getHSL({ h: 0, s: 0, l: 0 }).l < 0.5 ? 0 : -0.03)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(reach * 6, reach * 6), new THREE.MeshStandardMaterial({ color: floorColor, roughness: 1, metalness: 0, envMapIntensity: 0.3 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.set(centre.x, Math.min(0, box.min.y) - 0.003, centre.z)
  ground.receiveShadow = true
  scene.add(ground)
  undo.push(() => {
    scene.remove(key, key.target, ground)
    key.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
  })
  // Key light from the upper left and slightly behind, so shadows fall forward where the camera sees them.
  const keyBase = centre.clone().add(new THREE.Vector3(-reach * 0.9, reach * 1.5, -reach * 0.35))

  // 4. Render the passes into an image-sized target and average them.
  const aspect = camera.aspect
  camera.aspect = W / H
  camera.updateProjectionMatrix()
  undo.push(() => {
    camera.clearViewOffset()
    camera.aspect = aspect
    camera.updateProjectionMatrix()
  })
  const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 })
  rt.texture.colorSpace = THREE.SRGBColorSpace
  const px = new Uint8Array(W * H * 4)
  const acc = new Uint16Array(W * H * 4)
  const prevTarget = gl.getRenderTarget()
  try {
    for (let k = 0; k < passes; k++) {
      // Spread light positions over a disc (golden angle) for even soft shadows.
      const a = k * 2.399963
      const r = Math.sqrt((k + 0.5) / passes) * reach * 0.12
      key.position.copy(keyBase).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
      camera.setViewOffset(W, H, ((k * 0.618) % 1) - 0.5, ((k * 0.382) % 1) - 0.5, W, H)
      gl.setRenderTarget(rt)
      gl.render(scene, camera)
      gl.readRenderTargetPixels(rt, 0, 0, W, H, px)
      for (let i = 0; i < px.length; i++) acc[i] += px[i]
      o.onProgress?.((k + 1) / passes)
      await new Promise((res) => setTimeout(res, 0)) // let the page breathe between passes
    }
  } finally {
    gl.setRenderTarget(prevTarget)
    rt.dispose()
    for (const f of undo.reverse()) f()
  }

  // 5. Average, flip (WebGL rows start at the bottom) and encode as PNG.
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4
    const dst = y * W * 4
    for (let i = 0; i < W * 4; i++) img.data[dst + i] = Math.round(acc[src + i] / passes)
  }
  ctx.putImageData(img, 0, 0)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), 'image/png'))
}
