import type { MirrorEvent } from './types.js'

/**
 * Row renderer for the mirror. Deliberately simple: we're translating
 * DSH's chunkrow/event shapes into plain text blocks. A1-full (reuse of
 * ui-chat components) is the approved future enhancement with a build-time
 * fallback already authorized.
 */
export function MessageRow({ event }: { event: MirrorEvent }) {
  const { kind, data, time } = event

  if (kind === 'user/message') {
    return (
      <div className="msg user">
        <div className="header">
          <span className="author">User</span>
          <time>{new Date(time).toLocaleTimeString()}</time>
        </div>
        <div className="body">{extractText(data)}</div>
      </div>
    )
  }

  if (kind === 'assistant/message' || kind.startsWith('chunkrow/')) {
    return (
      <div className="msg assistant">
        <div className="header">
          <span className="author">Assistant</span>
          <time>{new Date(time).toLocaleTimeString()}</time>
        </div>
        <div className="body">{extractText(data)}</div>
      </div>
    )
  }

  if (kind === 'tool/call' || kind === 'tool/result') {
    return (
      <div className={`msg tool ${kind === 'tool/call' ? 'call' : 'result'}`}>
        <div className="header">
          <span className="author">{kind === 'tool/call' ? '→' : '←'} tool</span>
          <time>{new Date(time).toLocaleTimeString()}</time>
        </div>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    )
  }

  // System-ish events (turn/step boundaries) render as subtle dividers.
  if (kind.startsWith('turn/') || kind.startsWith('step/')) {
    return <div className="divider">{kind}</div>
  }

  return (
    <div className="msg system">
      <div className="header">
        <span className="author">{kind}</span>
        <time>{new Date(time).toLocaleTimeString()}</time>
      </div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

function extractText(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    // Try content blocks first
    const content = d['content'] ?? d['message'] ?? d['text']
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content
        .map((b) => {
          if (typeof b === 'string') return b
          if (b && typeof b === 'object' && 'text' in b) return String(b.text)
          return ''
        })
        .filter(Boolean)
        .join('')
    }
    return JSON.stringify(data, null, 2)
  }
  return String(data)
}
