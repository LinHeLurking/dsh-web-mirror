import { useEffect, useRef, useState } from 'react'
import type { HistoryResponse, MirrorEvent, TopicsResponse } from './types.js'

/** GET /topics — workspace + session index. */
export async function fetchTopics(signal?: AbortSignal): Promise<TopicsResponse> {
  const res = await fetch('/topics', signal ? { signal } : undefined)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as TopicsResponse
}

/**
 * GET /topics/:id/history — event log for one session.
 * Pass `afterSeq` for the server's incremental mode (seq > afterSeq only).
 */
export async function fetchHistory(topicId: string, afterSeq?: number, signal?: AbortSignal): Promise<HistoryResponse> {
  const base = `/topics/${encodeURIComponent(topicId)}/history`
  const url = afterSeq !== undefined && afterSeq >= 0 ? `${base}?after=${afterSeq}` : base
  const res = await fetch(url, signal ? { signal } : undefined)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as HistoryResponse
}

export interface SessionEventsState {
  events: MirrorEvent[]
  loading: boolean
  error: string | null
  /** SSE connection state (cold sessions may never emit frames). */
  connected: boolean
}

/**
 * History + live tail for one session.
 *
 * Events are an append-only log with monotonic seq, and each event is
 * immutable, so updates are incremental by design:
 *
 * - Initial load and SSE-reconnect resyncs do a full fetch. Existing events
 *   keep their object identity (reconciled by seq) so memoized timeline rows
 *   skip re-rendering, and identity-mismatch (compaction/rewrite) falls back
 *   to a full replace.
 * - Routine SSE "changed" frames use `?after=<lastSeq>` — only genuinely new
 *   events cross the wire (no more full-history refetch per frame).
 * - Burst frames coalesce into one in-flight request.
 */
export function useSessionEvents(topicId: string): SessionEventsState {
  const [state, setState] = useState<SessionEventsState>({
    events: [],
    loading: true,
    error: null,
    connected: false,
  })
  const lastSeqRef = useRef(-1)
  const eventsRef = useRef<MirrorEvent[]>([])

  useEffect(() => {
    let disposed = false
    let refreshing: Promise<void> | null = null
    let pendingIncremental = false
    let openedOnce = false
    lastSeqRef.current = -1
    eventsRef.current = []
    setState({ events: [], loading: true, error: null, connected: false })

    const apply = (next: MirrorEvent[], error: string | null = null) => {
      eventsRef.current = next
      lastSeqRef.current = next.length > 0 ? (next[next.length - 1]?.seq ?? lastSeqRef.current) : lastSeqRef.current
      setState((s) => ({ ...s, events: next, loading: false, error }))
    }

    /** Incremental: fetch seq > lastSeq and append. */
    const refreshIncremental = async () => {
      const data = await fetchHistory(topicId, lastSeqRef.current)
      if (disposed) return
      if (data.events.length === 0) {
        setState((s) => ({ ...s, loading: false, error: null }))
        return
      }
      apply([...eventsRef.current, ...data.events])
    }

    /** Full resync: reconcile by seq, keeping identities of unchanged events. */
    const refreshFull = async () => {
      const data = await fetchHistory(topicId)
      if (disposed) return
      const prev = eventsRef.current
      const prevBySeq = new Map(prev.map((ev) => [ev.seq, ev]))
      let identitiesKept = 0
      const next = data.events.map((ev) => {
        const old = prevBySeq.get(ev.seq)
        // Same seq + same time + same kind → same immutable event: reuse it.
        if (old && old.time === ev.time && old.kind === ev.kind) {
          identitiesKept++
          return old
        }
        return ev
      })
      if (next.length === prev.length && identitiesKept === next.length) {
        setState((s) => ({ ...s, loading: false, error: null }))
        return
      }
      apply(next)
    }

    const run = (fn: () => Promise<void>) => {
      if (refreshing) {
        // Coalesce bursted SSE frames: remember that at least one refresh was
        // requested while busy, then run one trailing incremental pass so no
        // frame is ever dropped (e.g. a frame racing the initial load).
        pendingIncremental = true
        return refreshing
      }
      refreshing = (async () => {
        try {
          await fn()
          if (pendingIncremental && !disposed) {
            pendingIncremental = false
            await refreshIncremental()
          }
        } catch (e) {
          if (!disposed) setState((s) => ({ ...s, loading: false, error: String(e) }))
        } finally {
          refreshing = null
        }
      })()
      return refreshing
    }

    void run(refreshFull)

    const stream = new EventSource(`/topics/${encodeURIComponent(topicId)}/events`)
    stream.onopen = () => {
      if (disposed) return
      setState((s) => ({ ...s, connected: true }))
      // Reconnect (not the first connect): we may have missed frames while
      // the socket was down — resync fully once.
      if (openedOnce) void run(refreshFull)
      openedOnce = true
    }
    stream.onmessage = (msg) => {
      try {
        const frame = JSON.parse(msg.data as string) as { type: string; topicId?: string }
        if (frame.type === 'changed' && (!frame.topicId || frame.topicId === topicId)) {
          void run(refreshIncremental)
        }
      } catch {
        /* ignore malformed frame */
      }
    }
    stream.onerror = () => {
      // EventSource retries automatically; just reflect the drop.
      if (!disposed) setState((s) => ({ ...s, connected: false }))
    }

    return () => {
      disposed = true
      stream.close()
    }
  }, [topicId])

  return state
}
