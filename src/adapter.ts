import type { Context } from '@deepseek-ai/cordis'
import type { MirrorEvent, MirrorTopic, MirrorWorkspace } from './types.js'
import type { FilterRules } from './config.js'
import { isTopicVisible } from './config.js'

/**
 * Upstream types — narrowed to what the mirror actually consumes.
 * These mirror the DSH service surfaces without a compile-time dependency
 * on the DSH monorepo: the plugin runs inside DSH's cordis runtime, which
 * injects these services at runtime. Structural typing keeps us honest.
 *
 * Narrowed upstream shapes (verified against dsh-api-session-controller
 * and dsh-session / dsh-session-persistence `.d.ts`):
 * - `SessionSummary.projections` mirrors `SessionProjectionHints`: a
 *   partial, possibly stale cache of folded projections. The
 *   dsh-session-title package folds `session/title` log events into the
 *   `title` projection key (`string | null`), so this is the honest title
 *   source for live sessions — absent when the cache has no entry.
 * - The persisted `SessionHeader` (`{ id, version, createdAt, cwd?, ... }`)
 *   has no title field at all, and `persistence.list()` explicitly avoids
 *   reading event logs — so cold topics keep the sessionId as title.
 */

interface SessionSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  cwd?: string
  projections?: {
    values?: Readonly<Record<string, unknown>>
  }
}

interface SessionWireEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
  readonly ignorable?: true
}

interface SessionHandle {
  /**
   * Read a slice of the valid contiguous event log. `read(0)` returns the
   * full prefix. Used instead of a "snapshotEvents" convenience — the
   * upstream `SessionHandle` interface only exposes `read(offset, length)`,
   * and calling anything else crashes the cold path silently (caught and
   * swallowed below), yielding an empty timeline.
   */
  read(offset?: number, length?: number): Promise<{ events: SessionWireEvent[] }>
  /** Release the handle. */
  close(): Promise<void>
}

interface SessionsService {
  list(): SessionSummary[]
  get(id: string): { snapshotEvents(fromSeq?: number, toSeqExclusive?: number): SessionWireEvent[] } | undefined
}

interface SessionPersistenceService {
  list(): Promise<Array<{ header: { id: string; createdAt: number; cwd?: string } }>>
  open(id: string, mode: 'read'): Promise<SessionHandle>
}

interface WorkspaceRegistryService {
  list(): Array<{ workspaceId: string; path: string; title: string; sessionIds: string[] }>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessions?: SessionsService
    sessionPersistence?: SessionPersistenceService
    workspaceRegistry?: WorkspaceRegistryService
  }
}

/**
 * Data source adapter. Talks to DSH's injected services and translates
 * wire events into MirrorEvents. The only file that knows about DSH
 * shapes — if the upstream wire changes, only this file adapts.
 */
export class MirrorDataSource {
  /**
   * Memoized cold-topic titles, keyed by sessionId. DSH's persisted
   * `SessionHeader` carries no title, so the only honest source for a cold
   * session is the `session/title` event inside its event log. We read the
   * log once per cold session and cache — if the session resumes and
   * changes title, it becomes a live session and the live-projection path
   * takes over.
   */
  private coldTitleCache = new Map<string, string>()

  constructor(private ctx: Context, private rules: FilterRules) {}

  async listTopics(): Promise<{ workspaces: MirrorWorkspace[]; topics: MirrorTopic[] }> {
    const workspacesSvc = this.ctx.workspaceRegistry
    const persistence = this.ctx.sessionPersistence
    const sessionsSvc = this.ctx.sessions

    const workspaces: MirrorWorkspace[] = (workspacesSvc?.list() ?? []).map((w) => ({
      id: w.workspaceId,
      path: w.path,
      title: w.title,
    }))

    const workspaceBySession = new Map<string, { id: string; path: string }>()
    for (const w of workspacesSvc?.list() ?? []) {
      for (const sid of w.sessionIds) {
        workspaceBySession.set(sid, { id: w.workspaceId, path: w.path })
      }
    }

    const topics: MirrorTopic[] = []
    const seen = new Set<string>()

    // Live sessions first (they have the freshest state).
    for (const s of sessionsSvc?.list() ?? []) {
      // Sessions can appear mid-initialization with no sessionId yet; skip
      // those — a topic without a stable id is unusable downstream.
      if (typeof s.sessionId !== 'string' || s.sessionId.length === 0) continue
      if (!isTopicVisible(s.sessionId, this.rules)) continue
      seen.add(s.sessionId)
      const ws = workspaceBySession.get(s.sessionId)
      // Live sessions: the title projection (folded from `session/title`
      // events by dsh-session-title) is the only log-free title source.
      // Fall back to the raw sessionId when the cache has no title.
      const projected = s.projections?.values?.['title']
      const title = typeof projected === 'string' && projected.length > 0
        ? projected
        : s.sessionId
      topics.push({
        id: s.sessionId,
        title,
        workspaceId: ws?.id,
        workspacePath: ws?.path,
        updatedAt: s.updatedAt,
        running: true,
      })
    }

    // Then persisted (cold) sessions not already seen.
    if (persistence) {
      try {
        const persisted = await persistence.list()
        // Resolve titles for cold sessions in parallel — each is a single
        // log scan and the results are memoized, so subsequent /topics
        // calls cost nothing.
        const coldTopics = await Promise.all(
          persisted
            .filter((p) => {
              const sid = p.header.id
              return !seen.has(sid) && isTopicVisible(sid, this.rules)
            })
            .map(async (p): Promise<MirrorTopic> => {
              const sid = p.header.id
              const ws = workspaceBySession.get(sid)
              const title = await this.resolveColdTitle(sid)
              return {
                id: sid,
                title,
                workspaceId: ws?.id,
                workspacePath: ws?.path ?? p.header.cwd,
                updatedAt: p.header.createdAt,
                running: false,
              }
            })
        )
        topics.push(...coldTopics)
      } catch {
        // Persistence listing is best-effort; a cold reader failure
        // must not take down the mirror index.
      }
    }

    topics.sort((a, b) => b.updatedAt - a.updatedAt)
    return { workspaces, topics }
  }

  /**
   * Look up the title of a cold session by scanning its event log for the
   * first `session/title` event. Falls back to the raw sessionId when no
   * title was ever recorded (or the log can't be read). Memoized — a cold
   * session's title is immutable from the mirror's point of view.
   */
  private async resolveColdTitle(sessionId: string): Promise<string> {
    const cached = this.coldTitleCache.get(sessionId)
    if (cached !== undefined) return cached
    let title = sessionId
    try {
      const events = await this.getEvents(sessionId)
      for (const ev of events) {
        if (ev.kind !== 'session/title') continue
        const data = ev.data as { title?: unknown } | null | undefined
        if (data && typeof data.title === 'string' && data.title.length > 0) {
          title = data.title
          break
        }
      }
    } catch {
      // Fall through — keep the sessionId as title.
    }
    this.coldTitleCache.set(sessionId, title)
    return title
  }

  async getEvents(sessionId: string): Promise<MirrorEvent[]> {
    if (!isTopicVisible(sessionId, this.rules)) {
      return []
    }

    const live = this.ctx.sessions?.get(sessionId)
    if (live) {
      return live.snapshotEvents().map(wireToMirror)
    }

    const persistence = this.ctx.sessionPersistence
    if (persistence) {
      let handle: SessionHandle | undefined
      try {
        handle = await persistence.open(sessionId, 'read')
        const { events } = await handle.read()
        return events.map(wireToMirror)
      } catch {
        return []
      } finally {
        // Always release the read handle — even on a throw, otherwise the
        // persistence tracker keeps a slot open for this session forever.
        if (handle) {
          try {
            await handle.close()
          } catch {
            // Close is best-effort from our side.
          }
        }
      }
    }
    return []
  }
}

function wireToMirror(wire: SessionWireEvent): MirrorEvent {
  return {
    seq: wire.seq,
    time: wire.time,
    kind: wire.type,
    data: wire.data,
  }
}
