import type { Context } from '@deepseek-ai/cordis'
import { Config, compileFilterRules } from './config.js'
import { MirrorDataSource } from './adapter.js'
import { MirrorServer } from './server.js'

export const name = '@moonshot-ai/dsh-web-mirror'
export { Config }

export const inject = [
  'sessions',
  'sessionPersistence',
  'workspaceRegistry',
]

export function apply(ctx: Context, config: Config): void {
  const rules = compileFilterRules(config)
  const source = new MirrorDataSource(ctx, rules)
  const server = new MirrorServer(config, source, rules)

  // Listener lifecycle — copied from the DSH webserver pattern
  // (packages/host/webserver/src/index.ts:304). Full dispose + re-apply
  // on config hot-update handles SSE teardown and restart for free.
  ctx.effect(async () => {
    await server.listen()
    ctx.logger?.('mirror')?.info?.(`listening on http://${config.host}:${config.port}`)
    return async () => {
      await server.close()
    }
  }, 'mirror:listen')

  // Bridge DSH session events to SSE "changed" notifications. The client
  // refetches history on each notification (Q10).
  ctx.effect(() => {
    const dispose = ctx.on('session/event' as never, ((session: { id: string }) => {
      server.notifyTopicChanged(session.id)
    }) as never)
    return dispose
  }, 'mirror:session-event')

  ctx.effect(() => {
    const created = ctx.on('session/created' as never, ((session: { id: string }) => {
      server.notifyTopicChanged(session.id)
    }) as never)
    const disposed = ctx.on('session/disposed' as never, ((session: { id: string }) => {
      server.notifyTopicChanged(session.id)
    }) as never)
    return () => {
      created()
      disposed()
    }
  }, 'mirror:session-lifecycle')
}
