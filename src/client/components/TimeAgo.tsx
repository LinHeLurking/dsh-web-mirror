import { useEffect, useState } from 'react'

/** Single shared ticker — one interval for every TimeAgo on screen. */
let listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 30_000)
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => subscribe(() => setNow(Date.now())), [])
  void intervalMs // interval is fixed at 30s; parameter kept for API clarity
  return now
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function formatRelative(time: number, now: number): string {
  const diff = now - time
  if (diff < 45_000) return 'just now'
  if (diff < 90_000) return '1m ago'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < 1.5 * HOUR) return '1h ago'
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 1.5 * DAY) return '1d ago'
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatExact(time: number): string {
  return new Date(time).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Relative time with exact timestamp on hover. Re-renders at most every 30s
 * via the shared ticker.
 */
export function TimeAgo({ time, className }: { time: number; className?: string }) {
  const now = useNow()
  return (
    <time className={className} dateTime={new Date(time).toISOString()} title={formatExact(time)}>
      {formatRelative(time, now)}
    </time>
  )
}
