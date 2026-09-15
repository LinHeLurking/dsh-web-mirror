import { useCallback, useEffect, useState } from 'react'
import type { MirrorTopic, TopicsResponse } from './types.js'
import { fetchTopics, useSessionEvents } from './api.js'
import { useHashRoute } from './router.js'
import { useTheme } from './theme.js'
import { Sidebar } from './components/Sidebar.js'
import { Timeline } from './components/Timeline.js'
import { displayTitle } from './components/SessionListItem.js'
import { DotIcon, InboxIcon } from './components/icons.js'

const INDEX_POLL_MS = 30_000

export function App() {
  const [route, navigate] = useHashRoute()
  const [theme, toggleTheme] = useTheme()
  const [index, setIndex] = useState<TopicsResponse | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let inFlight = false
    const load = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const data = await fetchTopics()
        if (!disposed) {
          setIndex(data)
          setIndexError(null)
        }
      } catch (e) {
        if (!disposed) setIndexError(String(e))
      } finally {
        inFlight = false
      }
    }
    void load()
    const timer = setInterval(() => {
      if (!document.hidden) void load()
    }, INDEX_POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  const activeTopicId = route.name === 'session' ? route.topicId : null
  const onSelect = useCallback(
    (id: string) => navigate({ name: 'session', topicId: id }),
    [navigate],
  )

  return (
    <div className="shell">
      <Sidebar
        workspaces={index?.workspaces ?? null}
        topics={index?.topics ?? null}
        loading={!index && !indexError}
        activeTopicId={activeTopicId}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelect={onSelect}
      />
      <main className="content">
        {route.name === 'session' ? (
          <SessionPage topicId={route.topicId} topics={index?.topics ?? null} />
        ) : (
          <Welcome topicCount={index?.topics.length ?? null} error={indexError} />
        )}
      </main>
    </div>
  )
}

/** Overview route: welcome / empty state. */
function Welcome({ topicCount, error }: { topicCount: number | null; error: string | null }) {
  return (
    <div className="welcome">
      <InboxIcon size={32} className="welcome-icon" />
      <h1>DSH Mirror</h1>
      <p>
            A read-only mirror of DeepSeek Harness sessions.
            {topicCount !== null && topicCount > 0
              ? ` ${topicCount} session${topicCount === 1 ? '' : 's'} mirrored — pick one from the sidebar.`
              : ''}
      </p>
      {error ? <p className="error-text">Failed to load the session index: {error}</p> : null}
      <p className="welcome-hint">
        Shareable links: <code>#/s/&lt;sessionId&gt;</code>
      </p>
    </div>
  )
}

/** Session detail route: header + live timeline. */
function SessionPage({ topicId, topics }: { topicId: string; topics: MirrorTopic[] | null }) {
  const { events, loading, error, connected } = useSessionEvents(topicId)
  const topic = topics?.find((t) => t.id === topicId)
  const title = topic ? displayTitle(topic.title) : displayTitle(topicId)

  useEffect(() => {
    document.title = `${title} · DSH Mirror`
    return () => {
      document.title = 'DSH Mirror'
    }
  }, [title])

  return (
    <div className="session-page">
      <header className="session-header">
        <DotIcon
          size={8}
          className={`sess-dot ${topic?.running ? 'live' : 'cold'}`}
          title={`${topic?.running ? 'Live session' : 'Cold (persisted) session'} · stream ${connected ? 'connected' : 'disconnected'}`}
        />
        <h1 title={topicId}>{title}</h1>
        <span className="session-meta">
          {events.length} event{events.length === 1 ? '' : 's'}
          {topic?.workspacePath ? ` · ${topic.workspacePath}` : ''}
        </span>
      </header>
      {error ? <div className="error-banner">Error loading history: {error}</div> : null}
      <Timeline events={events} loading={loading} />
    </div>
  )
}
