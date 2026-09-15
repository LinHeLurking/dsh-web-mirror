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
  snapshotEvents(fromSeq?: number, toSeqExclusive?: number): SessionWireEvent[]
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
        for (const p of persisted) {
          const sid = p.header.id
          if (seen.has(sid) || !isTopicVisible(sid, this.rules)) continue
          const ws = workspaceBySession.get(sid)
          // The persisted SessionHeader has no title field, and list()
          // deliberately avoids reading logs — cold topics show the id.
          topics.push({
            id: sid,
            title: sid,
            workspaceId: ws?.id,
            workspacePath: ws?.path ?? p.header.cwd,
            updatedAt: p.header.createdAt,
            running: false,
          })
        }
      } catch {
        // Persistence listing is best-effort; a cold reader failure
        // must not take down the mirror index.
      }
    }

    topics.sort((a, b) => b.updatedAt - a.updatedAt)
    return { workspaces, topics }
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
      try {
        const handle = await persistence.open(sessionId, 'read')
        return handle.snapshotEvents().map(wireToMirror)
      } catch {
        return []
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
