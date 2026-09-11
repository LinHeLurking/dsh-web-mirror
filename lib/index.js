import { Config, compileFilterRules } from './config.js';
import { MirrorDataSource } from './adapter.js';
import { MirrorServer } from './server.js';
export const name = '@moonshot-ai/dsh-web-mirror';
export { Config };
export const inject = [
    'sessions',
    'sessionPersistence',
    'workspaceRegistry',
];
export function apply(ctx, config) {
    const rules = compileFilterRules(config);
    const source = new MirrorDataSource(ctx, rules);
    const server = new MirrorServer(config, source, rules);
    // Listener lifecycle — copied from the DSH webserver pattern
    // (packages/host/webserver/src/index.ts:304). Full dispose + re-apply
    // on config hot-update handles SSE teardown and restart for free.
    ctx.effect(async () => {
        await server.listen();
        ctx.logger?.('mirror')?.info?.(`listening on http://${config.host}:${config.port}`);
        return async () => {
            await server.close();
        };
    }, 'mirror:listen');
    // Bridge DSH session events to SSE "changed" notifications. The client
    // refetches history on each notification (Q10).
    ctx.effect(() => {
        const dispose = ctx.on('session/event', ((session) => {
            server.notifyTopicChanged(session.id);
        }));
        return dispose;
    }, 'mirror:session-event');
    ctx.effect(() => {
        const created = ctx.on('session/created', ((session) => {
            server.notifyTopicChanged(session.id);
        }));
        const disposed = ctx.on('session/disposed', ((session) => {
            server.notifyTopicChanged(session.id);
        }));
        return () => {
            created();
            disposed();
        };
    }, 'mirror:session-lifecycle');
}
//# sourceMappingURL=index.js.map