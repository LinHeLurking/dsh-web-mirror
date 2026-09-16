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
export declare class MirrorDataSource {
    private ctx;
    private getRules;
    private coldFactsCache;
    /**
     * `getRules` is a getter rather than a fixed value so runtime config
     * updates (PUT /config) take effect on the next call without rewiring.
     */
    constructor(ctx: Context, getRules: () => FilterRules);
    listTopics(): Promise<{
        workspaces: MirrorWorkspace[];
        topics: MirrorTopic[];
    }>;
    /**
     * Scan a cold session's event log once and extract everything the mirror
     * needs from it: the title (the first `session/title` event's `title`
     * field, if any) and whether any user message was ever posted. Sessions
     * that were opened but never typed into produce no user/message events
     * and should be hidden from the sidebar.
     *
     * On a read failure we assume the session is interesting (`hasUserMessage:
     * true`) — silently dropping a real conversation because the disk hiccuped
     * is worse than occasionally showing an empty one.
     */
    private analyzeColdSession;
    getEvents(sessionId: string): Promise<MirrorEvent[]>;
    /**
     * Server-side filter pipeline applied to every event before it crosses
     * the wire. Three stages, in order:
     *
     * 1. Event-kind filter — drops entire events whose kind matches the
     *    configured hide list (or the built-in sensitive defaults).
     * 2. Tool-name filter — for tool/call and tool/result events, looks up
     *    the tool name and either drops the event entirely, blanks the call
     *    payload, or blanks the result body.
     * 3. Redaction — applies every configured regex replacement to all
     *    string values inside the event's data payload.
     *
     * The tool-name lookup requires a callId→name map built from the same
     * event batch, so this is a two-pass scan.
     */
    private filterEvents;
}
export {};
//# sourceMappingURL=adapter.d.ts.map