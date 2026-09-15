import { isTopicVisible } from './config.js';
/**
 * Data source adapter. Talks to DSH's injected services and translates
 * wire events into MirrorEvents. The only file that knows about DSH
 * shapes — if the upstream wire changes, only this file adapts.
 */
export class MirrorDataSource {
    ctx;
    rules;
    constructor(ctx, rules) {
        this.ctx = ctx;
        this.rules = rules;
    }
    async listTopics() {
        const workspacesSvc = this.ctx.workspaceRegistry;
        const persistence = this.ctx.sessionPersistence;
        const sessionsSvc = this.ctx.sessions;
        const workspaces = (workspacesSvc?.list() ?? []).map((w) => ({
            id: w.workspaceId,
            path: w.path,
            title: w.title,
        }));
        const workspaceBySession = new Map();
        for (const w of workspacesSvc?.list() ?? []) {
            for (const sid of w.sessionIds) {
                workspaceBySession.set(sid, { id: w.workspaceId, path: w.path });
            }
        }
        const topics = [];
        const seen = new Set();
        // Live sessions first (they have the freshest state).
        for (const s of sessionsSvc?.list() ?? []) {
            // Sessions can appear mid-initialization with no sessionId yet; skip
            // those — a topic without a stable id is unusable downstream.
            if (typeof s.sessionId !== 'string' || s.sessionId.length === 0)
                continue;
            if (!isTopicVisible(s.sessionId, this.rules))
                continue;
            seen.add(s.sessionId);
            const ws = workspaceBySession.get(s.sessionId);
            // Live sessions: the title projection (folded from `session/title`
            // events by dsh-session-title) is the only log-free title source.
            // Fall back to the raw sessionId when the cache has no title.
            const projected = s.projections?.values?.['title'];
            const title = typeof projected === 'string' && projected.length > 0
                ? projected
                : s.sessionId;
            topics.push({
                id: s.sessionId,
                title,
                workspaceId: ws?.id,
                workspacePath: ws?.path,
                updatedAt: s.updatedAt,
                running: true,
            });
        }
        // Then persisted (cold) sessions not already seen.
        if (persistence) {
            try {
                const persisted = await persistence.list();
                for (const p of persisted) {
                    const sid = p.header.id;
                    if (seen.has(sid) || !isTopicVisible(sid, this.rules))
                        continue;
                    const ws = workspaceBySession.get(sid);
                    // The persisted SessionHeader has no title field, and list()
                    // deliberately avoids reading logs — cold topics show the id.
                    topics.push({
                        id: sid,
                        title: sid,
                        workspaceId: ws?.id,
                        workspacePath: ws?.path ?? p.header.cwd,
                        updatedAt: p.header.createdAt,
                        running: false,
                    });
                }
            }
            catch {
                // Persistence listing is best-effort; a cold reader failure
                // must not take down the mirror index.
            }
        }
        topics.sort((a, b) => b.updatedAt - a.updatedAt);
        return { workspaces, topics };
    }
    async getEvents(sessionId) {
        if (!isTopicVisible(sessionId, this.rules)) {
            return [];
        }
        const live = this.ctx.sessions?.get(sessionId);
        if (live) {
            return live.snapshotEvents().map(wireToMirror);
        }
        const persistence = this.ctx.sessionPersistence;
        if (persistence) {
            try {
                const handle = await persistence.open(sessionId, 'read');
                return handle.snapshotEvents().map(wireToMirror);
            }
            catch {
                return [];
            }
        }
        return [];
    }
}
function wireToMirror(wire) {
    return {
        seq: wire.seq,
        time: wire.time,
        kind: wire.type,
        data: wire.data,
    };
}
//# sourceMappingURL=adapter.js.map