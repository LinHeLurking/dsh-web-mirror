import z from '@deepseek-ai/schemastery'

/**
 * Mirror configuration. Everything is optional except host/port — the
 * defaults are deliberately conservative (hide sensitive event kinds,
 * redact common token patterns) so a fresh install doesn't leak reasoning
 * traces or API keys to anyone who can reach the mirror port.
 */
export interface Config {
  host: '127.0.0.1' | '0.0.0.0'
  port: number
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
  /**
   * Regex replacements applied to every text payload that crosses the
   * wire: assistant text, user message text, tool call arguments, tool
   * result bodies. Patterns are evaluated in order.
   */
  redact: Array<{ pattern: string; replace: string }>
  /**
   * When true (default), the mirror layers a built-in conservative set on
   * top of the user's rules: hides reasoning/approval/subagent-internal
   * event kinds and redacts common API-key shapes. Set to false to start
   * from a clean slate and configure everything explicitly.
   */
  sensitiveDefaults: boolean
}

export const Config: z<Config> = z.object({
  host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
  port: z.natural().max(65535).required(),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  events: z
    .object({
      hide: z.array(z.string()).default([]),
      show: z.array(z.string()).default([]),
    })
    .default({ hide: [], show: [] }),
  tools: z
    .object({
      hide: z.array(z.string()).default([]),
      hideCalls: z.array(z.string()).default([]),
      hideResults: z.array(z.string()).default([]),
    })
    .default({ hide: [], hideCalls: [], hideResults: [] }),
  redact: z
    .array(
      z.object({
        pattern: z.string().required(),
        replace: z.string().required(),
      })
    )
    .default([]),
  sensitiveDefaults: z.boolean().default(true),
})

export interface FilterRules {
  include: RegExp[]
  exclude: RegExp[]
  events: {
    hide: RegExp[]
    show: RegExp[]
  }
  tools: {
    hide: RegExp[]
    hideCalls: RegExp[]
    hideResults: RegExp[]
  }
  redact: Array<{ pattern: RegExp; replace: string }>
  sensitiveDefaults: boolean
}

/**
 * Event kinds hidden by default when `sensitiveDefaults` is on. These are
 * the kinds that routinely carry internal state — chain-of-thought,
 * approval prompts with full tool args, subagent model catalogs — and are
 * rarely what a mirror consumer wants to see.
 *
 * `show` rules always win over this list, so a user can re-expose any of
 * them explicitly.
 */
export const DEFAULT_HIDDEN_EVENT_KINDS = [
  '^reasoning$',
  '^thinking$',
  '^approval/asked$',
  '^approval/decided$',
  '^subagent/model-selection-policy$',
  '^subagent/catalog$',
  '^session/title-llm-request$',
  '^request/context$',
  '^request/header$',
]

/**
 * Token shapes redacted by default when `sensitiveDefaults` is on. Kept
 * deliberately narrow — broad patterns (e.g. any 32-char hex) would nuke
 * legitimate content like commit hashes.
 */
export const DEFAULT_REDACT_RULES: Array<{ pattern: string; replace: string }> = [
  { pattern: 'sk-[A-Za-z0-9_-]{20,}', replace: '[REDACTED_API_KEY]' },
  { pattern: 'ghp_[A-Za-z0-9]{20,}', replace: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: 'gho_[A-Za-z0-9]{20,}', replace: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: 'github_pat_[A-Za-z0-9_]{20,}', replace: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: 'AKIA[0-9A-Z]{16}', replace: '[REDACTED_AWS_KEY]' },
  { pattern: 'Bearer\\s+[A-Za-z0-9._~+/=-]{20,}', replace: 'Bearer [REDACTED]' },
]

function compileRegexList(patterns: string[], label: string): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern)
    } catch {
      throw new Error(`Invalid regex in ${label}: ${pattern}`)
    }
  })
}

export function compileFilterRules(config: Config): FilterRules {
  const redactPatterns = config.sensitiveDefaults
    ? [...DEFAULT_REDACT_RULES, ...config.redact]
    : config.redact
  return {
    include: compileRegexList(config.include, 'include'),
    exclude: compileRegexList(config.exclude, 'exclude'),
    events: {
      hide: compileRegexList(config.events.hide, 'events.hide'),
      show: compileRegexList(config.events.show, 'events.show'),
    },
    tools: {
      hide: compileRegexList(config.tools.hide, 'tools.hide'),
      hideCalls: compileRegexList(config.tools.hideCalls, 'tools.hideCalls'),
      hideResults: compileRegexList(config.tools.hideResults, 'tools.hideResults'),
    },
    redact: redactPatterns.map((r) => {
      try {
        return { pattern: new RegExp(r.pattern, 'g'), replace: r.replace }
      } catch {
        throw new Error(`Invalid regex in redact: ${r.pattern}`)
      }
    }),
    sensitiveDefaults: config.sensitiveDefaults,
  }
}

export function isTopicVisible(topicId: string, rules: FilterRules): boolean {
  if (rules.include.length > 0 && !rules.include.some((r) => r.test(topicId))) {
    return false
  }
  return !rules.exclude.some((r) => r.test(topicId))
}

/**
 * Whether an event kind should cross the wire. `show` wins over both the
 * user's `hide` list and the built-in sensitive defaults.
 */
export function isEventKindVisible(kind: string, rules: FilterRules): boolean {
  if (rules.events.show.some((r) => r.test(kind))) return true
  if (rules.events.hide.some((r) => r.test(kind))) return false
  if (rules.sensitiveDefaults) {
    for (const pattern of DEFAULT_HIDDEN_EVENT_KINDS) {
      if (new RegExp(pattern).test(kind)) return false
    }
  }
  return true
}

/** Tool-name visibility for the three tool-filter axes. */
export interface ToolVisibility {
  /** Drop the entire tool row. */
  hidden: boolean
  /** Keep the row but strip the call payload. */
  hideCall: boolean
  /** Keep the row but strip the result body. */
  hideResult: boolean
}

export function toolVisibility(toolName: string, rules: FilterRules): ToolVisibility {
  const matches = (list: RegExp[]) => list.some((r) => r.test(toolName))
  return {
    hidden: matches(rules.tools.hide),
    hideCall: matches(rules.tools.hideCalls),
    hideResult: matches(rules.tools.hideResults),
  }
}

/**
 * Apply every configured redaction to a string. Order matters — later
 * rules see the output of earlier ones.
 */
export function redactText(text: string, rules: FilterRules): string {
  let out = text
  for (const { pattern, replace } of rules.redact) {
    // Reset lastIndex so a `g` regex can be reused across calls.
    pattern.lastIndex = 0
    out = out.replace(pattern, replace)
  }
  return out
}
