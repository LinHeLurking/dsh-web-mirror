import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal hash router. Two routes:
 *   '#/'              → overview (sidebar + welcome)
 *   '#/s/<topicId>'   → session detail
 *
 * Hash routing keeps links shareable and refresh-safe without a router
 * dependency: the server only ever serves `/`, all state lives in the hash.
 */
export type Route = { name: 'overview' } | { name: 'session'; topicId: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const m = /^\/s\/([^/]+)\/?$/.exec(path)
  if (m?.[1]) return { name: 'session', topicId: decodeURIComponent(m[1]) }
  return { name: 'overview' }
}

export function routeToHash(route: Route): string {
  return route.name === 'session' ? `#/s/${encodeURIComponent(route.topicId)}` : '#/'
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    else setRoute(next) // same-hash navigation still needs a state refresh
  }, [])

  return [route, navigate]
}
