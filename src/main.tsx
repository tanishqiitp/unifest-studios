import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/theme'
import App from './App.tsx'
import { AppCrash, ErrorBoundary } from './components/Safe3D'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary where="app" fallback={() => <AppCrash />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
