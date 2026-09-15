import type { MirrorDataSource } from './adapter.js';
import type { Config, FilterRules } from './config.js';
/**
 * Read-only mirror HTTP server on its own port. No auth, no write paths.
 * Only GET handlers are registered — there is no mechanism to mutate
 * anything through this surface.
 */
export declare class MirrorServer {
    private config;
    private source;
    private rules;
    private server;
    private sseClients;
    constructor(config: Config, source: MirrorDataSource, rules: FilterRules);
    listen(): Promise<void>;
    private handle;
    /** Serve the vite-built index.html, which references the hashed assets. */
    private serveIndex;
    private serveStatic;
    private handleTopics;
    private handleHistory;
    private handleEvents;
    /** Notify SSE clients that a topic has new data. */
    notifyTopicChanged(topicId: string): void;
    close(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map