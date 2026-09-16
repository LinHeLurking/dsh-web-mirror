import z from '@deepseek-ai/schemastery'
import type { MirrorSettings } from './settings.js'

/**
 * Host-only schemastery schema for the `web-mirror` settings namespace.
 * Kept in its own module so the browser bundle (src/dsh-client) never
 * imports schemastery — it is not part of the web shell's static module
 * table, and bundling a second copy just to build a schema it never
 * evaluates would be dead weight.
 */
export const MirrorSettingsSchema: z<MirrorSettings> = z.object({
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
