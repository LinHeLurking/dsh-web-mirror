import { memo, useState } from 'react'
import type { MirrorEvent } from '../types.js'
import { CheckIcon, ChevronIcon, SpinnerIcon, ToolIcon, XIcon } from './icons.js'
import { TimeAgo } from './TimeAgo.js'
import { extractText, extractToolCall, extractToolResult, prettyJson, safeJson } from './MessageItem.js'

/**
 * A tool/call paired with its tool/result, rendered as a collapsed one-line
 * summary: status icon + tool name + first line of args + duration.
 * Click expands into a two-pane call/result payload view.
 */
export const ToolCallRow = memo(function ToolCallRow({
  call,
  result,
}: {
  call: MirrorEvent
  result: MirrorEvent | null
}) {
  const [open, setOpen] = useState(false)
  const c = extractToolCall(call.data)
  const r = result ? extractToolResult(result.data) : null
  const duration = result ? result.time - call.time : null

  const argsPreview = firstLine(typeof c.args === 'string' ? c.args : safeJson(c.args))

  return (
    <div className={`tool${open ? ' open' : ''}`}>
      <button
        type="button"
        className="tool-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronIcon size={12} className="tool-chevron" />
        {r ? (
          r.isError ? (
            <XIcon size={14} className="tool-status err" title="Failed" />
          ) : (
            <CheckIcon size={14} className="tool-status ok" title="Done" />
          )
        ) : (
          <SpinnerIcon size={14} className="tool-status pending" title="Running / no result yet" />
        )}
        <ToolIcon size={14} className="tool-glyph" />
        <span className="tool-name">{c.name}</span>
        <code className="tool-args" title={typeof c.args === 'string' ? c.args : safeJson(c.args)}>
          {argsPreview}
        </code>
        {duration !== null && duration >= 0 ? (
          <span className="tool-duration">{formatDuration(duration)}</span>
        ) : null}
        <TimeAgo time={call.time} className="tool-time" />
      </button>
      {open ? (
        <div className="tool-panes">
          <div className="tool-pane">
            <div className="tool-pane-title">Call</div>
            <pre className="json">{prettyJson(c.args ?? call.data)}</pre>
          </div>
          <div className="tool-pane">
            <div className="tool-pane-title">{r ? (r.isError ? 'Result (error)' : 'Result') : 'Result'}</div>
            {r ? (
              <pre className="json">{looksLikeJson(r.text) ? prettyJson(r.text) : r.text}</pre>
            ) : (
              <div className="tool-pending">No result yet — the call is still in flight.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
})

/**
 * Fallback for an unpaired tool/result (its call fell outside the mirrored
 * window, or the payload carried no callId). Rendered like a system row.
 */
export const ToolResultOrphan = memo(function ToolResultOrphan({ event }: { event: MirrorEvent }) {
  const [open, setOpen] = useState(false)
  const r = extractToolResult(event.data)
  return (
    <div className={`tool orphan${open ? ' open' : ''}`}>
      <button type="button" className="tool-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronIcon size={12} className="tool-chevron" />
        {r.isError ? (
          <XIcon size={14} className="tool-status err" />
        ) : (
          <CheckIcon size={14} className="tool-status ok" />
        )}
        <ToolIcon size={14} className="tool-glyph" />
        <span className="tool-name">tool result</span>
        <code className="tool-args">{firstLine(r.text)}</code>
        <TimeAgo time={event.time} className="tool-time" />
      </button>
      {open ? (
        <div className="tool-panes">
          <div className="tool-pane">
            <div className="tool-pane-title">Result</div>
            <pre className="json">{looksLikeJson(r.text) ? prettyJson(r.text) : r.text}</pre>
          </div>
        </div>
      ) : null}
    </div>
  )
})

/** Collapsed summary row for unknown/system-ish events. */
export const SystemRow = memo(function SystemRow({ event }: { event: MirrorEvent }) {
  const [open, setOpen] = useState(false)
  const preview = firstLine(extractText(event.data))
  return (
    <div className={`tool system${open ? ' open' : ''}`}>
      <button type="button" className="tool-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronIcon size={12} className="tool-chevron" />
        <span className="sys-dot" aria-hidden="true" />
        <span className="tool-name mono">{event.kind}</span>
        <code className="tool-args">{preview}</code>
        <TimeAgo time={event.time} className="tool-time" />
      </button>
      {open ? (
        <div className="tool-panes">
          <div className="tool-pane">
            <div className="tool-pane-title">Payload</div>
            <pre className="json">{safeJson(event.data)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  )
})

function firstLine(text: string, max = 100): string {
  const line = text.split('\n', 1)[0] ?? ''
  const trimmed = line.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

function looksLikeJson(text: string): boolean {
  const t = text.trim()
  return t.startsWith('{') || t.startsWith('[')
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m ${sec}s`
}
