import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/theme'
import App from './App.tsx'
import { AppCrash, ErrorBoundary, reloadForUpdate } from './components/Safe3D'

// Any code file of an older version that is gone after an update (3D views, exporters, importers):
// load the latest version instead of failing. Vite raises this event for every lazy-loaded file.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForUpdate()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary where="app" fallback={() => <AppCrash />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
