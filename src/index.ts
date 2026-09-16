import type { Context } from '@deepseek-ai/cordis'
// Side-effect import: augments cordis Context with the `settings` service.
import '@deepseek-ai/dsh-settings'
import { Config } from './config.js'
import { MirrorDataSource } from './adapter.js'
import { MirrorConfigStore } from './runtime-config.js'
import { MirrorServer } from './server.js'
import { MirrorSettingsSchema } from './schema.js'
import { MIRROR_SETTINGS_NS, validateMirrorSettings, type MirrorSettings } from './settings.js'

export const name = '@moonshot-ai/dsh-web-mirror'
export { Config }

export const inject = [
  'sessions',
  'sessionPersistence',
  'workspaceRegistry',
]

export function apply(ctx: Context, config: Config): void {
  // The store owns the effective filter config. Its initial value is the
  // composition base (cordis yaml); when the host `settings` service is
  // present, the `web-mirror` namespace layers on top — that registration
  // is what surfaces the mirror's filters in the DSH web settings page.
  const store = new MirrorConfigStore(config, settingsFromBase(config))
  const source = new MirrorDataSource(ctx, () => store.rules)
  let server: MirrorServer | null = null

  ctx.inject(['settings'], (settingsCtx) => {
    // The thunk handed to setSource is the authoritative configuration
    // source (settings scope while attached, composition entry after
    // detach). Keep it and re-resolve the store on every onChange, which
    // fires at attach, at detach, and after every committed settings write.
    let source: () => MirrorSettings = () => settingsFromBase(config)
    settingsCtx.settings.installSection(ctx, MIRROR_SETTINGS_NS, MirrorSettingsSchema, settingsFromBase(config), {
      validate: validateMirrorSettings,
      setSource: (current) => {
        source = current
      },
      onChange: () => {
        store.updateSettings(source())
      },
    })
  })

  // Listener lifecycle — copied from the DSH webserver pattern
  // (packages/host/webserver/src/index.ts:304). Full dispose + re-apply
  // on config hot-update handles SSE teardown and restart for free.
  ctx.effect(async () => {
    server = new MirrorServer(store, source)
    await server.listen()
    ctx.logger?.('mirror')?.info?.(`listening on http://${config.host}:${config.port}`)
    return async () => {
      await server?.close()
      server = null
    }
  }, 'mirror:listen')

  // Bridge DSH session events to SSE "changed" notifications. The client
  // refetches history on each notification (Q10).
  ctx.effect(() => {
    const dispose = ctx.on('session/event' as never, ((session: { id: string }) => {
      server?.notifyTopicChanged(session.id)
    }) as never)
    return dispose
  }, 'mirror:session-event')

  ctx.effect(() => {
    const created = ctx.on('session/created' as never, ((session: { id: string }) => {
      server?.notifyTopicChanged(session.id)
    }) as never)
    const disposed = ctx.on('session/disposed' as never, ((session: { id: string }) => {
      server?.notifyTopicChanged(session.id)
    }) as never)
    return () => {
      created()
      disposed()
    }
  }, 'mirror:session-lifecycle')
}

/** The composition layer of the settings namespace: the yaml's filter fields. */
function settingsFromBase(config: Config): MirrorSettings {
  return {
    include: [...config.include],
    exclude: [...config.exclude],
    events: { hide: [...config.events.hide], show: [...config.events.show] },
    tools: {
      hide: [...config.tools.hide],
      hideCalls: [...config.tools.hideCalls],
      hideResults: [...config.tools.hideResults],
    },
    redact: config.redact.map((r) => ({ ...r })),
    sensitiveDefaults: config.sensitiveDefaults,
  }
}
