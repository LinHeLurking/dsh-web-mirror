import type { MirrorDataSource } from './adapter.js';
import type { MirrorConfigStore } from './runtime-config.js';
/**
 * Read-only mirror HTTP server on its own port. Only GET handlers are
 * registered — filter configuration lives in DSH's own settings (the
 * `web-mirror` namespace), edited through the DSH web settings page,
 * never through this surface.
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
     * GET /config — read-only view of the effective filter config and the
     * built-in defaults, for display. Writes happen exclusively through the
     * DSH settings page (the `web-mirror` settings namespace).
     */
    private handleGetConfig;
    private handleHistory;
    private handleEvents;
    /** Notify SSE clients that a topic has new data. */
    notifyTopicChanged(topicId: string): void;
    close(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map