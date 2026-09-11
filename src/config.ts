import z from '@deepseek-ai/schemastery'

export interface Config {
  host: '127.0.0.1' | '0.0.0.0'
  port: number
  include: string[]
  exclude: string[]
}

export const Config: z<Config> = z.object({
  host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
  port: z.natural().max(65535).required(),
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
})

export interface FilterRules {
  include: RegExp[]
  exclude: RegExp[]
}

export function compileFilterRules(config: Config): FilterRules {
  const compile = (patterns: string[]) =>
    patterns.map((pattern) => {
      try {
        return new RegExp(pattern)
      } catch {
        throw new Error(`Invalid regex in filter config: ${pattern}`)
      }
    })
  return {
    include: compile(config.include),
    exclude: compile(config.exclude),
  }
}

export function isTopicVisible(topicId: string, rules: FilterRules): boolean {
  if (rules.include.length > 0 && !rules.include.some((r) => r.test(topicId))) {
    return false
  }
  return !rules.exclude.some((r) => r.test(topicId))
}
