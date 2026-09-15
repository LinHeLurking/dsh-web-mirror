import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'dsh-mirror-theme'

/**
 * Theme detection / toggle / persistence.
 *
 * The no-FOUC bootstrap lives in an inline <script> in index.html — it runs
 * before React mounts and sets [data-theme] from localStorage or
 * prefers-color-scheme. This module reads that same resolution so the toggle
 * and the bootstrap never disagree.
 */
export function getStoredTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme()
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme
}

export function toggleTheme(): Theme {
  const next: Theme = resolveTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode etc. — theme still applies for this session */
  }
  return next
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(resolveTheme)

  useEffect(() => {
    // Follow OS theme changes unless the user made an explicit choice.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq || getStoredTheme()) return
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light'
      applyTheme(next)
      setTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return [theme, () => setTheme(toggleTheme())]
}
