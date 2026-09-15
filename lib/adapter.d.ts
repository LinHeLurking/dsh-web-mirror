import type { Context } from '@deepseek-ai/cordis';
import type { MirrorEvent, MirrorTopic, MirrorWorkspace } from './types.js';
import type { FilterRules } from './config.js';
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
    sessionId: string;
    updatedAt: number;
    running: boolean;
    cwd?: string;
    projections?: {
        values?: Readonly<Record<string, unknown>>;
    };
}
interface SessionWireEvent {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
    readonly ignorable?: true;
}
interface SessionHandle {
    /**
     * Read a slice of the valid contiguous event log. `read(0)` returns the
     * full prefix. Used instead of a "snapshotEvents" convenience — the
     * upstream `SessionHandle` interface only exposes `read(offset, length)`,
     * and calling anything else crashes the cold path silently (caught and
     * swallowed below), yielding an empty timeline.
     */
    read(offset?: number, length?: number): Promise<{
        events: SessionWireEvent[];
    }>;
    /** Release the handle. */
    close(): Promise<void>;
}
interface SessionsService {
    list(): SessionSummary[];
    get(id: string): {
        snapshotEvents(fromSeq?: number, toSeqExclusive?: number): SessionWireEvent[];
    } | undefined;
}
interface SessionPersistenceService {
    list(): Promise<Array<{
        header: {
            id: string;
            createdAt: number;
            cwd?: string;
        };
    }>>;
    open(id: string, mode: 'read'): Promise<SessionHandle>;
}
interface WorkspaceRegistryService {
    list(): Array<{
        workspaceId: string;
        path: string;
        title: string;
        sessionIds: string[];
    }>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        sessions?: SessionsService;
        sessionPersistence?: SessionPersistenceService;
        workspaceRegistry?: WorkspaceRegistryService;
    }
}
/**
 * Data source adapter. Talks to DSH's injected services and translates
 * wire events into MirrorEvents. The only file that knows about DSH
 * shapes — if the upstream wire changes, only this file adapts.
 */
export declare class MirrorDataSource {
    private ctx;
    private rules;
    /**
     * Memoized cold-topic titles, keyed by sessionId. DSH's persisted
     * `SessionHeader` carries no title, so the only honest source for a cold
     * session is the `session/title` event inside its event log. We read the
     * log once per cold session and cache — if the session resumes and
     * changes title, it becomes a live session and the live-projection path
     * takes over.
     */
    private coldTitleCache;
    constructor(ctx: Context, rules: FilterRules);
    listTopics(): Promise<{
        workspaces: MirrorWorkspace[];
        topics: MirrorTopic[];
    }>;
    /**
     * Look up the title of a cold session by scanning its event log for the
     * first `session/title` event. Falls back to the raw sessionId when no
     * title was ever recorded (or the log can't be read). Memoized — a cold
     * session's title is immutable from the mirror's point of view.
     */
    private resolveColdTitle;
    getEvents(sessionId: string): Promise<MirrorEvent[]>;
}
export {};
//# sourceMappingURL=adapter.d.ts.map