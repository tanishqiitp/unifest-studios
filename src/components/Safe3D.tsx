import { Component, createContext, useCallback, useContext, useState, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Download, RotateCcw } from 'lucide-react'

// ---------------------------------------------------------------- WebGL capability

let probed: boolean | null = null
/** True when this browser can create a WebGL context. `?nogl` in the address simulates a browser without it. */
export function hasWebGL(force = false): boolean {
  if (typeof window === 'undefined') return false
  if (new URLSearchParams(location.search).has('nogl')) return false
  if (probed !== null && !force) return probed
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    probed = !!gl
    // Free the probe context straight away; browsers allow only a few at once.
    ;(gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    probed = false
  }
  return probed
}

// ---------------------------------------------------------------- error boundary

type FallbackFn = (error: Error, reset: () => void) => ReactNode
export class ErrorBoundary extends Component<{ fallback: FallbackFn; children: ReactNode; where?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Details for developers; customers only see the friendly fallback.
    console.error(`[unifest] ${this.props.where ?? 'view'} failed:`, error, import.meta.env.DEV ? info.componentStack : '')
  }
  reset = () => this.setState({ error: null })
  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children
  }
}

// ---------------------------------------------------------------- 3D wrapper

const LostCtx = createContext<(() => void) | null>(null)

/** Pass to <Canvas onCreated>: reports a lost graphics context to the nearest <Safe3D>. */
export function useGlCreated() {
  const lost = useContext(LostCtx)
  return useCallback(
    ({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
      gl.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault()
        lost?.()
      })
    },
    [lost],
  )
}

type Kind = 'none' | 'error' | 'lost'
const TEXT: Record<Kind, [string, string]> = {
  none: ['3D is not available here', 'This browser or device could not start 3D graphics. Turn on hardware acceleration in the browser settings, update the graphics driver, or try Chrome or Edge. Your project is safe and every 2D view still works.'],
  error: ['3D view stopped', 'Something went wrong while drawing this 3D view. Your project and edits are safe. Try again, or carry on in 2D.'],
  lost: ['3D view paused', 'The graphics card reset the 3D view (this can happen when memory runs low or the computer wakes from sleep). Your project is safe.'],
}

function Fallback({ kind, onRetry, onExit, exitLabel, detail }: { kind: Kind; onRetry?: () => void; onExit?: () => void; exitLabel?: string; detail?: string }) {
  const [title, body] = TEXT[kind]
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 bg-canvas z-20" role="alert">
      <div className="card max-w-sm w-full p-5 text-center">
        <AlertTriangle size={20} className="mx-auto text-dim" aria-hidden />
        <h2 className="font-display font-semibold mt-2">{title}</h2>
        <p className="text-xs text-dim mt-2 leading-relaxed">{body}</p>
        {import.meta.env.DEV && detail && <pre className="mt-3 text-[10px] text-left text-mute whitespace-pre-wrap max-h-24 overflow-auto">{detail}</pre>}
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {onRetry && (
            <button className="btn btn-primary h-9" onClick={onRetry}>
              <RotateCcw size={13} /> Try again
            </button>
          )}
          {onExit && (
            <button className="btn h-9" onClick={onExit}>
              <ArrowLeft size={13} /> {exitLabel ?? 'Back to 2D'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Guards a 3D view: checks WebGL first, catches render errors and handles a lost graphics context,
 * so a 3D failure only replaces this view and never blanks the app. `onExit` offers a way back to 2D.
 */
export function Safe3D({ children, onExit, exitLabel }: { children: ReactNode; onExit?: () => void; exitLabel?: string }) {
  const [attempt, setAttempt] = useState(0)
  const [lost, setLost] = useState(false)
  const [, force] = useState(0)
  const retry = () => {
    setLost(false)
    hasWebGL(true)
    setAttempt((n) => n + 1)
    force((n) => n + 1)
  }
  if (!hasWebGL()) return <Fallback kind="none" onRetry={retry} onExit={onExit} exitLabel={exitLabel} />
  if (lost) return <Fallback kind="lost" onRetry={retry} onExit={onExit} exitLabel={exitLabel} />
  return (
    <LostCtx.Provider value={() => setLost(true)}>
      <ErrorBoundary key={attempt} where="3D" fallback={(err) => <Fallback kind="error" onRetry={retry} onExit={onExit} exitLabel={exitLabel} detail={String(err?.stack ?? err)} />}>
        {children}
      </ErrorBoundary>
    </LostCtx.Provider>
  )
}

// ---------------------------------------------------------------- app-level fallbacks

/** Downloads the project saved on this device, so work is never stranded behind an error screen. */
export function downloadBackup() {
  try {
    const cur = localStorage.getItem('unifest:current')
    const raw = (cur && localStorage.getItem(`unifest:p:${cur}`)) || localStorage.getItem('unifest:project')
    if (!raw) return false
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    a.download = 'unifest-backup.unifest'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    return true
  } catch {
    return false
  }
}

export function AppCrash({ onHome }: { onHome?: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-4 bg-canvas" role="alert">
      <div className="card max-w-sm w-full p-6 text-center">
        <AlertTriangle size={22} className="mx-auto text-dim" aria-hidden />
        <h1 className="font-display font-semibold text-lg mt-2">This screen stopped working</h1>
        <p className="text-xs text-dim mt-2 leading-relaxed">Your project is saved on this device. Reload to carry on, or download a backup copy first.</p>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <button className="btn btn-primary h-9" onClick={() => location.reload()}>
            <RotateCcw size={13} /> Reload
          </button>
          {onHome && (
            <button className="btn h-9" onClick={onHome}>
              <ArrowLeft size={13} /> Ground plan
            </button>
          )}
          <button className="btn h-9" onClick={() => downloadBackup()}>
            <Download size={13} /> Download backup
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Load a code chunk, retrying twice on a flaky connection (or right after a new deploy) before giving up.
 * React caches a failed lazy load, so retrying here is what lets "Try again" work.
 */
export function retryImport<T>(load: () => Promise<T>, tries = 3): Promise<T> {
  return load().catch((err) => (tries <= 1 ? Promise.reject(err) : new Promise<T>((res) => setTimeout(() => res(retryImport(load, tries - 1)), 1200))))
}
