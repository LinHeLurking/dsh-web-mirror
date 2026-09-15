import { memo } from 'react'
import type { MirrorTopic } from '../types.js'
import { TimeAgo } from './TimeAgo.js'
import { DotIcon } from './icons.js'

/**
 * Compress raw sessionId-style titles: `session-2146b764-…-462671a0ae1c`
 * → `session-2146…ae1c`. Real titles pass through, capped at 40 chars.
 */
export function displayTitle(title: string): string {
  const m = /^(session-[0-9a-f]{4})[0-9a-f-]*([0-9a-f]{4})$/i.exec(title)
  if (m) return `${m[1]}…${m[2]}`
  return title.length > 40 ? `${title.slice(0, 39)}…` : title
}

export const SessionListItem = memo(function SessionListItem({
  topic,
  active,
  onSelect,
}: {
  topic: MirrorTopic
  active: boolean
  onSelect: (id: string) => void
}) {
  return (
    <li>
      <a
        href={`#/s/${encodeURIComponent(topic.id)}`}
        className={`sess${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={(e) => {
          // Same-hash clicks don't fire hashchange; still let the parent know.
          if (active) e.preventDefault()
          onSelect(topic.id)
        }}
        title={topic.title}
      >
        <DotIcon
          size={8}
          className={`sess-dot ${topic.running ? 'live' : 'cold'}`}
          title={topic.running ? 'Live session' : 'Cold (persisted) session'}
        />
        <span className={`sess-title${topic.title === topic.id ? ' mono' : ''}`}>
          {displayTitle(topic.title)}
        </span>
        <TimeAgo time={topic.updatedAt} className="sess-time" />
      </a>
    </li>
  )
})
