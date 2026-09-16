import type { MirrorDataSource } from './adapter.js';
import type { MirrorConfigStore } from './runtime-config.js';
/**
 * Mirror HTTP server on its own port. Session data is read-only; the only
 * write surface is /config, which mutates the mirror's own filter settings
 * (never DSH state) and persists them to a JSON file in the user's home.
 */
export declare class MirrorServer {
    private store;
    private source;
    private server;
    private sseClients;
    constructor(store: MirrorConfigStore, source: MirrorDataSource);
    listen(): Promise<void>;
    private handle;
    /** Serve the vite-built index.html, which references the hashed assets. */
    private serveIndex;
    private serveStatic;
    private handleTopics;
    /**
     * GET /config — the effective editable config plus the read-only context
     * the settings UI needs: listen address, the persisted-overrides file
     * location, and the built-in defaults (so the UI can display them).
     */
    private handleGetConfig;
    /**
     * PUT /config — validate and apply a partial editable-config update.
     * Takes effect immediately (the rules getter is re-read per request)
     * and persists to the overrides file so it survives restarts.
     */
    private handlePutConfig;
    /** POST /config/reset — drop UI overrides, revert to the yaml config. */
    private handleResetConfig;
    private handleHistory;
    private handleEvents;
    /** Notify SSE clients that a topic has new data. */
    notifyTopicChanged(topicId: string): void;
    close(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map