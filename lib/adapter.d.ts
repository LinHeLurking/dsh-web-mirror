import type { Context } from '@deepseek-ai/cordis';
import type { MirrorEvent, MirrorTopic, MirrorWorkspace } from './types.js';
import type { FilterRules } from './config.js';
/**
 * Upstream types — narrowed to what the mirror actually consumes.
 * These mirror the DSH service surfaces without a compile-time dependency
 * on the DSH monorepo: the plugin runs inside DSH's cordis runtime, which
 * injects these services at runtime. Structural typing keeps us honest.
 */
interface SessionSummary {
    sessionId: string;
    updatedAt: number;
    running: boolean;
    cwd?: string;
}
interface SessionWireEvent {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
    readonly ignorable?: true;
}
interface SessionHandle {
    snapshotEvents(fromSeq?: number, toSeqExclusive?: number): SessionWireEvent[];
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
    constructor(ctx: Context, rules: FilterRules);
    listTopics(): Promise<{
        workspaces: MirrorWorkspace[];
        topics: MirrorTopic[];
    }>;
    getEvents(sessionId: string): Promise<MirrorEvent[]>;
}
export {};
//# sourceMappingURL=adapter.d.ts.map