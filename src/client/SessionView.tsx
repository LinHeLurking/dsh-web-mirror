import { useEffect, useRef, useState } from 'react'
import type { HistoryResponse } from './types.js'
import { MessageRow } from './MessageRow.js'

export function SessionView({ topicId, onBack }: { topicId: string; onBack: () => void }) {
  const [events, setEvents] = useState<HistoryResponse['events']>([])
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    const load = async () => {
      try {
        const res = await fetch(`/topics/${topicId}/history`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: HistoryResponse = await res.json()
        if (!disposed) setEvents(data.events)
      } catch (e) {
        if (!disposed) setError(String(e))
      }
    }
    void load()

    const stream = new EventSource(`/topics/${topicId}/events`)
    stream.onmessage = (msg) => {
      try {
        const frame = JSON.parse(msg.data) as { type: string }
        if (frame.type === 'changed') void load()
      } catch { /* ignore malformed frame */ }
    }
    return () => {
      disposed = true
      stream.close()
    }
  }, [topicId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (error) return <div className="error">Error: {error} <button onClick={onBack}>← Back</button></div>

  return (
    <div className="session">
      <header>
        <button onClick={onBack}>← Back</button>
        <h1>{topicId}</h1>
      </header>
      <main className="messages">
        {events.map((ev) => (
          <MessageRow key={`${ev.seq}-${ev.kind}`} event={ev} />
        ))}
        <div ref={bottomRef} />
      </main>
    </div>
  )
}
