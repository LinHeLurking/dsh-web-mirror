import { compileFilterRules, type Config, type FilterRules } from './config.js'
import type { MirrorSettings } from './settings.js'

/**
 * Runtime-mutable mirror configuration.
 *
 * The effective filter config layers two sources:
 *   1. composition base — the cordis patch yaml (plugin config)
 *   2. DSH settings — the `web-mirror` namespace, edited in the DSH web
 *      settings page and persisted by DSH itself (settings.yaml)
 *
 * The store holds the current layer values, recompiles FilterRules eagerly
 * on every change, and hands them out through the `rules` getter, so a
 * settings commit takes effect on the next request with no restart and no
 * subscription wiring in the consumers.
 */
export class MirrorConfigStore {
  private compiled: FilterRules

  constructor(
    private readonly base: Config,
    private settings: MirrorSettings,
  ) {
    this.compiled = compileFilterRules(this.fullConfig())
  }

  /** Compiled rules for the current layers. */
  get rules(): FilterRules {
    return this.compiled
  }

  /** Swap the DSH settings layer (called after every settings commit). */
  updateSettings(settings: MirrorSettings): void {
    this.settings = settings
    this.compiled = compileFilterRules(this.fullConfig())
  }

  /** Full effective config: filter fields from settings, host/port from base. */
  getConfig(): Config {
    return this.fullConfig()
  }

  private fullConfig(): Config {
    const s = this.settings
    return {
      host: this.base.host,
      port: this.base.port,
      include: [...s.include],
      exclude: [...s.exclude],
      events: { hide: [...s.events.hide], show: [...s.events.show] },
      tools: {
        hide: [...s.tools.hide],
        hideCalls: [...s.tools.hideCalls],
        hideResults: [...s.tools.hideResults],
      },
      redact: s.redact.map((r) => ({ ...r })),
      sensitiveDefaults: s.sensitiveDefaults,
    }
  }
}
