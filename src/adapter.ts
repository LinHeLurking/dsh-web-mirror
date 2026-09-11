import type { Context } from '@deepseek-ai/cordis'
import type { MirrorEvent, MirrorTopic, MirrorWorkspace } from './types.js'
import type { FilterRules } from './config.js'
import { isTopicVisible } from './config.js'

/**
 * Upstream types — narrowed to what the mirror actually consumes.
 * These mirror the DSH service surfaces without a compile-time dependency
 * on the DSH monorepo: the plugin runs inside DSH's cordis runtime, which
 * injects these services at runtime. Structural typing keeps us honest.
 */

interface SessionSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  cwd?: string
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
      topics.push({
        id: s.sessionId,
        title: s.sessionId, // refined below by title resolution
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
