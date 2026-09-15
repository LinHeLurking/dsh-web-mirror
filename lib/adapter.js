import { isTopicVisible } from './config.js';
/**
 * Data source adapter. Talks to DSH's injected services and translates
 * wire events into MirrorEvents. The only file that knows about DSH
 * shapes — if the upstream wire changes, only this file adapts.
 */
export class MirrorDataSource {
    ctx;
    rules;
    /**
     * Memoized cold-topic titles, keyed by sessionId. DSH's persisted
     * `SessionHeader` carries no title, so the only honest source for a cold
     * session is the `session/title` event inside its event log. We read the
     * log once per cold session and cache — if the session resumes and
     * changes title, it becomes a live session and the live-projection path
     * takes over.
     */
    coldTitleCache = new Map();
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
                // Resolve titles for cold sessions in parallel — each is a single
                // log scan and the results are memoized, so subsequent /topics
                // calls cost nothing.
                const coldTopics = await Promise.all(persisted
                    .filter((p) => {
                    const sid = p.header.id;
                    return !seen.has(sid) && isTopicVisible(sid, this.rules);
                })
                    .map(async (p) => {
                    const sid = p.header.id;
                    const ws = workspaceBySession.get(sid);
                    const title = await this.resolveColdTitle(sid);
                    return {
                        id: sid,
                        title,
                        workspaceId: ws?.id,
                        workspacePath: ws?.path ?? p.header.cwd,
                        updatedAt: p.header.createdAt,
                        running: false,
                    };
                }));
                topics.push(...coldTopics);
            }
            catch {
                // Persistence listing is best-effort; a cold reader failure
                // must not take down the mirror index.
            }
        }
        topics.sort((a, b) => b.updatedAt - a.updatedAt);
        return { workspaces, topics };
    }
    /**
     * Look up the title of a cold session by scanning its event log for the
     * first `session/title` event. Falls back to the raw sessionId when no
     * title was ever recorded (or the log can't be read). Memoized — a cold
     * session's title is immutable from the mirror's point of view.
     */
    async resolveColdTitle(sessionId) {
        const cached = this.coldTitleCache.get(sessionId);
        if (cached !== undefined)
            return cached;
        let title = sessionId;
        try {
            const events = await this.getEvents(sessionId);
            for (const ev of events) {
                if (ev.kind !== 'session/title')
                    continue;
                const data = ev.data;
                if (data && typeof data.title === 'string' && data.title.length > 0) {
                    title = data.title;
                    break;
                }
            }
        }
        catch {
            // Fall through — keep the sessionId as title.
        }
        this.coldTitleCache.set(sessionId, title);
        return title;
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
            let handle;
            try {
                handle = await persistence.open(sessionId, 'read');
                const { events } = await handle.read();
                return events.map(wireToMirror);
            }
            catch {
                return [];
            }
            finally {
                // Always release the read handle — even on a throw, otherwise the
                // persistence tracker keeps a slot open for this session forever.
                if (handle) {
                    try {
                        await handle.close();
                    }
                    catch {
                        // Close is best-effort from our side.
                    }
                }
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