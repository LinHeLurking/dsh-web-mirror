import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MirrorEvent } from '../types.js'
import { Divider } from './Divider.js'
import { MessageItem, extractToolCall, extractToolResult } from './MessageItem.js'
import { SystemRow, ToolCallRow, ToolResultOrphan } from './ToolCallRow.js'
import { ArrowDownIcon } from './icons.js'

/* ------------------------------------------------------------------ */
/* Grouping: raw events → render items                                 */
/*                                                                     */
/* - Adjacent chunkrow/* events of the same kind (and turn, when the   */
/*   payload carries one) merge into ONE assistant message.            */
/* - tool/call pairs with its tool/result by callId, else by adjacency */
/*   (next unpaired result binds to the last unpaired call).           */
/* ------------------------------------------------------------------ */

type RenderItem =
  | { type: 'message'; role: 'user' | 'assistant'; events: MirrorEvent[]; key: string }
  | { type: 'tool'; call: MirrorEvent; result: MirrorEvent | null; key: string }
  | { type: 'tool-orphan'; event: MirrorEvent; key: string }
  | { type: 'divider'; label: string; time: number; key: string }
  | { type: 'system'; event: MirrorEvent; key: string }

function turnOf(ev: MirrorEvent): unknown {
  const d = ev.data
  return typeof d === 'object' && d !== null ? (d as Record<string, unknown>)['turn'] : undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function groupEvents(events: MirrorEvent[]): RenderItem[] {
  const items: RenderItem[] = []
  // callId → index into items of a 'tool' render item awaiting its result.
  const pendingByCallId = new Map<string, number>()
  // Fallback pairing: indexes of tool items without a callId, FIFO.
  const pendingAnonymous: number[] = []

  const attachResult = (result: MirrorEvent) => {
    const { callId } = extractToolResult(result.data)
    if (callId !== null) {
      const idx = pendingByCallId.get(callId)
      if (idx !== undefined) {
        const item = items[idx]
        if (item?.type === 'tool' && !item.result) {
          items[idx] = { ...item, result }
          pendingByCallId.delete(callId)
          return
        }
      }
    }
    // Adjacency fallback: oldest anonymous pending call.
    const anonIdx = pendingAnonymous.shift()
    if (anonIdx !== undefined) {
      const item = items[anonIdx]
      if (item?.type === 'tool' && !item.result) {
        items[anonIdx] = { ...item, result }
        return
      }
    }
    items.push({ type: 'tool-orphan', event: result, key: `orphan-${result.seq}` })
  }

  for (const ev of events) {
    const { kind } = ev

    if (kind === 'user/message') {
      items.push({ type: 'message', role: 'user', events: [ev], key: `msg-${ev.seq}` })
      continue
    }

    if (kind === 'assistant/message' || kind.startsWith('chunkrow/')) {
      // Merge with the previous item when it is the same kind of assistant
      // row from the same turn (streaming chunks arrive back-to-back).
      const prev = items[items.length - 1]
      if (
        prev?.type === 'message' &&
        prev.role === 'assistant' &&
        prev.events[0]?.kind === kind &&
        turnOf(prev.events[0]) === turnOf(ev)
      ) {
        prev.events.push(ev)
        continue
      }
      items.push({ type: 'message', role: 'assistant', events: [ev], key: `msg-${ev.seq}` })
      continue
    }

    if (kind === 'tool/call') {
      const { callId } = extractToolCall(ev.data)
      const idx = items.length
      items.push({ type: 'tool', call: ev, result: null, key: `tool-${ev.seq}` })
      if (callId !== null) pendingByCallId.set(callId, idx)
      else pendingAnonymous.push(idx)
      continue
    }

    if (kind === 'tool/result') {
      attachResult(ev)
      continue
    }

    if (kind.startsWith('turn/') || kind.startsWith('step/')) {
      const label = boundaryLabel(ev)
      if (label !== null) items.push({ type: 'divider', label, time: ev.time, key: `div-${ev.seq}` })
      continue
    }

    items.push({ type: 'system', event: ev, key: `sys-${ev.seq}` })
  }

  return items
}

/**
 * Boundary events → divider labels. Deliberately selective: a tool-heavy
 * turn runs many steps, so a divider per step/* event is pure noise —
 * only turn boundaries (and abnormal endings) earn a divider.
 */
function boundaryLabel(ev: MirrorEvent): string | null {
  const d = isRecord(ev.data) ? ev.data : {}
  const turn = typeof d['turn'] === 'number' ? d['turn'] : null
  switch (ev.kind) {
    case 'turn/start':
      return turn !== null ? `Turn ${turn}` : 'Turn started'
    case 'turn/end': {
      const reason = typeof d['reason'] === 'string' ? d['reason'] : ''
      const quiet = reason === '' || reason === 'success' || reason === 'completed' || reason === 'stop'
      if (quiet) return null
      return `Turn ${turn ?? '?'} ended · ${reason}`
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Timeline with scroll-follow                                         */
/* ------------------------------------------------------------------ */

const NEAR_BOTTOM_PX = 100

const TimelineRow = memo(function TimelineRow({ item }: { item: RenderItem }) {
  switch (item.type) {
    case 'message':
      return (
        <div className="cv-row">
          <MessageItem role={item.role} events={item.events} />
        </div>
      )
    case 'tool':
      return (
        <div className="cv-row cv-row-sm">
          <ToolCallRow call={item.call} result={item.result} />
        </div>
      )
    case 'tool-orphan':
      return (
        <div className="cv-row cv-row-sm">
          <ToolResultOrphan event={item.event} />
        </div>
      )
    case 'divider':
      return (
        <div className="cv-row cv-row-sm">
          <Divider label={item.label} time={item.time} />
        </div>
      )
    case 'system':
      return (
        <div className="cv-row cv-row-sm">
          <SystemRow event={item.event} />
        </div>
      )
  }
})

export function Timeline({ events, loading }: { events: MirrorEvent[]; loading: boolean }) {
  const items = useMemo(() => groupEvents(events), [events])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const initialScrolledRef = useRef(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = scrollerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    pinnedRef.current = nearBottom
    if (nearBottom) setShowJump(false)
  }

  // First paint: jump straight to the latest content.
  useLayoutEffect(() => {
    if (!initialScrolledRef.current && items.length > 0) {
      initialScrolledRef.current = true
      scrollToBottom('auto')
    }
  }, [items.length])

  // Live tail: keep pinned readers at the bottom; offer a jump button otherwise.
  const prevCountRef = useRef(0)
  useEffect(() => {
    const grew = items.length > prevCountRef.current
    prevCountRef.current = items.length
    if (!grew) return
    if (pinnedRef.current) {
      scrollToBottom('smooth')
    } else {
      setShowJump(true)
    }
  }, [items.length])

  if (loading && items.length === 0) {
    return <div className="timeline-empty">Loading history…</div>
  }
  if (items.length === 0) {
    return <div className="timeline-empty">This session has no mirrored events yet.</div>
  }

  return (
    <div className="timeline-wrap">
      <div className="timeline" ref={scrollerRef} onScroll={onScroll}>
        <div className="timeline-inner">
          {items.map((item) => (
            <TimelineRow key={item.key} item={item} />
          ))}
        </div>
      </div>
      {showJump ? (
        <button
          type="button"
          className="jump-latest"
          onClick={() => {
            scrollToBottom('smooth')
            setShowJump(false)
          }}
        >
          <ArrowDownIcon size={13} />
          New messages
        </button>
      ) : null}
    </div>
  )
}
