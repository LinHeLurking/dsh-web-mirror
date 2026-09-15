import { memo } from 'react'
import type { MirrorEvent } from '../types.js'
import { Markdown } from './Markdown.js'
import { TimeAgo } from './TimeAgo.js'

/* ------------------------------------------------------------------ */
/* Payload extraction — defensive `unknown` → text/coercion helpers.   */
/*                                                                     */
/* Mirror data is `unknown` on purpose: the adapter copies DSH wire    */
/* payloads verbatim. Today they look like:                            */
/*   user/message      → UserMessage { content: ContentBlock[] }       */
/*   assistant/message → { message: AssistantMessage, stream, usage? } */
/*   tool/call         → { callId, name, arguments: string }           */
/*   tool/result       → { message: ToolResultMessage, error? }        */
/* but the client must degrade gracefully for any other shape.         */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Pull the .text strings out of a DSH ContentBlock[]-ish array. */
function blocksToText(blocks: unknown[]): string {
  return blocks
    .map((b) => {
      if (typeof b === 'string') return b
      if (isRecord(b)) {
        const text = b['text']
        if (typeof text === 'string') return text
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Best-effort plain-text extraction from any message-ish payload.
 * Handles strings, {content|message|text}, ContentBlock arrays, and the
 * DSH assistant envelope { message: { content } }. Falls back to JSON.
 */
export function extractText(data: unknown): string {
  if (typeof data === 'string') return data
  if (Array.isArray(data)) return blocksToText(data) || safeJson(data)
  if (isRecord(data)) {
    // Envelope: { message: { content: [...] } } or { message: "…" }
    const msg = data['message']
    if (typeof msg === 'string') return msg
    if (isRecord(msg)) {
      const inner = extractText(msg)
      if (inner) return inner
    }
    const content = data['content'] ?? data['text']
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const text = blocksToText(content)
      if (text) return text
    }
    if (msg !== undefined) return '' // had an envelope we could not read
    return safeJson(data)
  }
  return String(data)
}

export function safeJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

/** Pretty-print a JSON string (or value) for a <pre> block. */
export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        /* not actually JSON — fall through */
      }
    }
    return value
  }
  return safeJson(value)
}

/** Tool-call descriptor from a tool/call payload. */
export function extractToolCall(data: unknown): { callId: string | null; name: string; args: unknown } {
  if (!isRecord(data)) return { callId: null, name: 'tool', args: data }
  const callId = pickString(data, ['callId', 'toolCallId', 'toolUseId', 'id'])
  const name = pickString(data, ['name', 'toolName', 'tool']) ?? 'tool'
  const args = data['arguments'] ?? data['args'] ?? data['input'] ?? null
  return { callId, name, args }
}

/** Tool-result descriptor from a tool/result payload. */
export function extractToolResult(data: unknown): { callId: string | null; text: string; isError: boolean } {
  if (!isRecord(data)) return { callId: null, text: String(data), isError: false }
  const msg = data['message']
  let callId: string | null = pickString(data, ['callId', 'toolCallId', 'toolUseId', 'id'])
  let isError = isRecord(data['error']) || data['isError'] === true
  if (isRecord(msg)) {
    // DSH: message.source.callId pairs the result with its call.
    const src = msg['source']
    if (!callId && isRecord(src)) callId = pickString(src, ['callId', 'toolCallId'])
    const content = msg['content']
    if (Array.isArray(content)) {
      for (const block of content) {
        if (isRecord(block)) {
          if (!callId) callId = pickString(block, ['toolCallId', 'callId'])
          if (block['isError'] === true) isError = true
        }
      }
      // ToolResultBlock.content is itself a ContentBlock[] — dig one level.
      const text = content
        .map((block) => {
          if (!isRecord(block)) return ''
          const inner = block['content']
          if (Array.isArray(inner)) return blocksToText(inner)
          if (typeof block['text'] === 'string') return block['text']
          return ''
        })
        .filter(Boolean)
        .join('\n\n')
      if (text) return { callId, text, isError }
    }
    const text = extractText(msg)
    return { callId, text: text || safeJson(data), isError }
  }
  const text = extractText(data)
  return { callId, text: text || safeJson(data), isError }
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = record[key]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Reading-flow message rows (user / assistant).                       */
/* ------------------------------------------------------------------ */

interface MessageItemProps {
  role: 'user' | 'assistant'
  /** Merged event(s) — chunkrow runs arrive pre-joined. */
  events: MirrorEvent[]
}

/** Avatar placeholder: the first letter of the role label. */
function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return <span className={`avatar avatar-${role}`}>{role === 'user' ? 'U' : 'A'}</span>
}

export const MessageItem = memo(function MessageItem({ role, events }: MessageItemProps) {
  const first = events[0]
  const last = events[events.length - 1]
  const isAssistant = role === 'assistant'
  const text = isAssistant ? events.map((ev) => extractText(ev.data)).join('') : extractText(first?.data)
  const label = isAssistant ? 'Assistant' : 'User'

  if (!text.trim() && events.length > 0) {
    // Payload had no readable text — render as a system-style JSON row instead.
    return (
      <div className="row row-system">
        <div className="row-meta">
          <span className="row-author">{label}</span>
          {first ? <TimeAgo time={first.time} className="row-time" /> : null}
        </div>
        <pre className="json">{safeJson(first?.data)}</pre>
      </div>
    )
  }

  return (
    <div className={`row row-msg row-${role}`}>
      <div className="row-meta">
        <Avatar role={role} />
        <span className="row-author">{label}</span>
        {last ? <TimeAgo time={last.time} className="row-time" /> : null}
      </div>
      <div className="row-body">
        <Markdown text={text} />
      </div>
    </div>
  )
})
