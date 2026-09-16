/**
 * The mirror's DSH settings namespace. Registering it with the host
 * `settings` service (see index.ts) is what makes the mirror's filter
 * configuration appear in the DSH web settings page (Plugins section),
 * persisted to DSH's own settings.yaml — instead of the mirror's private
 * config file and private settings UI.
 *
 * host/port are NOT here: they decide where the mirror listens, so they
 * stay composition-level (cordis.patch.yml) and require a restart.
 *
 * NOTE: this module is imported by BOTH the host plugin and the browser
 * bundle. The schemastery schema is host-only (see schema.ts) — the
 * browser must never pull it in, because schemastery is not part of the
 * web shell's static module table.
 */
export const MIRROR_SETTINGS_NS = 'web-mirror'

export interface MirrorSettings {
  /** Topic-id regex allowlist. Empty = all topics pass. */
  include: string[]
  /** Topic-id regex blocklist, applied after include. */
  exclude: string[]
  /** Event-kind filtering (server-side, before events reach the wire). */
  events: {
    /** Extra kind regexes to hide, on top of the default sensitive set. */
    hide: string[]
    /** Kind regexes to force-show, overriding both hide and the defaults. */
    show: string[]
  }
  /** Tool-call filtering, matched against the tool name. */
  tools: {
    /** Fully hide the tool row (no call, no result, no trace). */
    hide: string[]
    /** Show the row but blank the call payload. */
    hideCalls: string[]
    /** Show the row but blank the result body. */
    hideResults: string[]
  }
  /** Regex replacements applied to every text payload that crosses the wire. */
  redact: Array<{ pattern: string; replace: string }>
  /**
   * When true (default), layer the built-in conservative set on top:
   * hides reasoning/approval/subagent-internal event kinds and redacts
   * common API-key shapes.
   */
  sensitiveDefaults: boolean
}

/** Validate every regex field; throws (rejecting the settings write) on the first bad pattern. */
export function validateMirrorSettings(value: MirrorSettings): void {
  const check = (patterns: string[], label: string) => {
    for (const pattern of patterns) {
      try {
        new RegExp(pattern)
      } catch {
        throw new Error(`${label}: invalid regex: ${pattern}`)
      }
    }
  }
  check(value.include, 'include')
  check(value.exclude, 'exclude')
  check(value.events.hide, 'events.hide')
  check(value.events.show, 'events.show')
  check(value.tools.hide, 'tools.hide')
  check(value.tools.hideCalls, 'tools.hideCalls')
  check(value.tools.hideResults, 'tools.hideResults')
  for (const rule of value.redact) {
    try {
      new RegExp(rule.pattern)
    } catch {
      throw new Error(`redact: invalid regex: ${rule.pattern}`)
    }
  }
}
