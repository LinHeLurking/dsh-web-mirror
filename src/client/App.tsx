import { useEffect, useState } from 'react'
import type { MirrorTopic, MirrorWorkspace, TopicsResponse } from './types.js'
import { SessionView } from './SessionView.js'

interface GroupedTopics {
  workspace: MirrorWorkspace | null
  topics: MirrorTopic[]
}

export function App() {
  const [data, setData] = useState<TopicsResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch('/topics')
      .then((r) => r.json())
      .then(setData)
  }, [])

  if (selected) {
    return <SessionView topicId={selected} onBack={() => setSelected(null)} />
  }

  if (!data) return <div className="loading">Loading…</div>

  const groups = groupByWorkspace(data.topics, data.workspaces)

  return (
    <div className="page">
      <header>
        <h1>DSH Mirror</h1>
        <p className="subtitle">Read-only. No auth. No write paths.</p>
      </header>
      {groups.map((g) => (
        <section key={g.workspace?.id ?? '__ungrouped'}>
          <h2>
            {g.workspace ? g.workspace.title || g.workspace.path : 'Ungrouped'}
            {g.workspace?.path && <span className="path">{g.workspace.path}</span>}
          </h2>
          <ul className="topic-list">
            {g.topics.map((t) => (
              <li key={t.id}>
                <a href="#" onClick={(e) => { e.preventDefault(); setSelected(t.id) }}>
                  {t.title}
                </a>
                <span className={`badge ${t.running ? 'running' : ''}`}>
                  {t.running ? 'live' : 'cold'}
                </span>
                <time>{new Date(t.updatedAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && <p className="empty">No sessions to mirror.</p>}
    </div>
  )
}

function groupByWorkspace(topics: MirrorTopic[], workspaces: MirrorWorkspace[]): GroupedTopics[] {
  const groups: GroupedTopics[] = []
  const buckets = new Map<string | null, MirrorTopic[]>()

  for (const t of topics) {
    const key = t.workspaceId ?? null
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(t)
  }

  // Ordered: workspaces in registry order, then ungrouped.
  for (const w of workspaces) {
    const items = buckets.get(w.id)
    if (items?.length) groups.push({ workspace: w, topics: items })
  }
  const ungrouped = buckets.get(null)
  if (ungrouped?.length) groups.push({ workspace: null, topics: ungrouped })

  return groups
}
