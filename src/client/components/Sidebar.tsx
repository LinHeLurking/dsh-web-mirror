import { useMemo, useState } from 'react'
import type { MirrorTopic, MirrorWorkspace } from '../types.js'
import { SessionListItem } from './SessionListItem.js'
import { ChevronIcon, MoonIcon, SearchIcon, SunIcon } from './icons.js'

interface Group {
  workspace: MirrorWorkspace | null
  topics: MirrorTopic[]
}

export function groupByWorkspace(topics: MirrorTopic[], workspaces: MirrorWorkspace[]): Group[] {
  const buckets = new Map<string | null, MirrorTopic[]>()
  for (const t of topics) {
    const key = t.workspaceId ?? null
    const bucket = buckets.get(key)
    if (bucket) bucket.push(t)
    else buckets.set(key, [t])
  }
  const groups: Group[] = []
  for (const w of workspaces) {
    const items = buckets.get(w.id)
    if (items?.length) groups.push({ workspace: w, topics: items })
  }
  const ungrouped = buckets.get(null)
  if (ungrouped?.length) groups.push({ workspace: null, topics: ungrouped })
  return groups
}

export function Sidebar({
  workspaces,
  topics,
  loading,
  activeTopicId,
  theme,
  onToggleTheme,
  onSelect,
}: {
  workspaces: MirrorWorkspace[] | null
  topics: MirrorTopic[] | null
  loading: boolean
  activeTopicId: string | null
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const groups = useMemo(() => {
    if (!topics || !workspaces) return []
    const q = filter.trim().toLowerCase()
    // Defensive: drop malformed topics with no usable id before they reach
    // key/href rendering (the adapter filters these, but don't trust the wire).
    const usable = topics.filter((t) => typeof t.id === 'string' && t.id.length > 0)
    const filtered = q
      ? usable.filter(
          (t) =>
            (t.title ?? '').toLowerCase().includes(q) ||
            (t.id ?? '').toLowerCase().includes(q) ||
            (t.workspacePath?.toLowerCase().includes(q) ?? false),
        )
      : usable
    return groupByWorkspace(filtered, workspaces)
  }, [topics, workspaces, filter])

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <a href="#/" className="brand">
          DSH Mirror
        </a>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>
      </header>

      <div className="sidebar-filter">
        <SearchIcon size={13} className="filter-icon" />
        <input
          type="search"
          placeholder="Filter sessions…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          spellCheck={false}
          aria-label="Filter sessions"
        />
      </div>

      <nav className="sidebar-nav">
        {loading ? <div className="sidebar-note">Loading…</div> : null}
        {!loading && groups.length === 0 ? (
          <div className="sidebar-note">{filter ? 'No sessions match the filter.' : 'No sessions to mirror.'}</div>
        ) : null}
        {groups.map((g) => {
          const key = g.workspace?.id ?? '__ungrouped'
          const isCollapsed = collapsed.has(key)
          return (
            <section className="ws-group" key={key}>
              <button
                type="button"
                className="ws-header"
                onClick={() => toggleGroup(key)}
                aria-expanded={!isCollapsed}
              >
                <ChevronIcon size={12} className={`ws-chevron${isCollapsed ? ' collapsed' : ''}`} />
                <span className="ws-title" title={g.workspace?.path}>
                  {g.workspace ? g.workspace.title || g.workspace.path : 'Ungrouped'}
                </span>
                <span className="ws-count">{g.topics.length}</span>
              </button>
              {!isCollapsed ? (
                <ul className="sess-list">
                  {g.topics.map((t) => (
                    <SessionListItem
                      key={t.id}
                      topic={t}
                      active={t.id === activeTopicId}
                      onSelect={onSelect}
                    />
                  ))}
                </ul>
              ) : null}
            </section>
          )
        })}
      </nav>

      <footer className="sidebar-footer">Read-only · no auth</footer>
    </aside>
  )
}
