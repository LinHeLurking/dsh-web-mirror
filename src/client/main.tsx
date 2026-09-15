import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { applyTheme, resolveTheme } from './theme.js'
import './style.css'

// The no-FOUC inline script in index.html normally sets data-theme before
// this runs. Re-resolve here as a belt-and-suspenders fallback (e.g. when
// the page is embedded by a tooling preview without the inline script).
if (!document.documentElement.dataset['theme']) {
  applyTheme(resolveTheme())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
