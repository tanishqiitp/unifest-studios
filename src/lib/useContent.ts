import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Loads an image or video for the screens. The texture is only handed out once the picture is
// ready, so the per-column copies never start from an empty image.
export function useContent(src: string | null, onError?: () => void): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const err = useRef(onError)
  err.current = onError
  useEffect(() => {
    setTex(null)
    if (!src) return
    let dead = false
    if (src.endsWith('#img') || src.startsWith('data:image')) {
      let loaded: THREE.Texture | null = null
      new THREE.TextureLoader().load(
        src.replace('#img', ''),
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          loaded = t
          if (dead) t.dispose()
          else setTex(t)
        },
        undefined,
        () => !dead && err.current?.(),
      )
      return () => {
        dead = true
        loaded?.dispose()
      }
    }
    const v = document.createElement('video')
    v.loop = true
    v.muted = true
    v.playsInline = true
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    const t = new THREE.VideoTexture(v)
    t.colorSpace = THREE.SRGBColorSpace
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    const ready = () => !dead && setTex(t)
    const fail = () => !dead && err.current?.()
    v.addEventListener('loadeddata', ready, { once: true })
    v.addEventListener('error', fail, { once: true })
    v.src = src
    v.play().catch(() => undefined)
    return () => {
      dead = true
      v.removeEventListener('loadeddata', ready)
      v.removeEventListener('error', fail)
      v.pause()
      v.removeAttribute('src')
      v.load()
      t.dispose()
    }
  }, [src])
  return tex
}
