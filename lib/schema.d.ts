import z from '@deepseek-ai/schemastery';
import type { MirrorSettings } from './settings.js';
/**
 * Host-only schemastery schema for the `web-mirror` settings namespace.
 * Kept in its own module so the browser bundle (src/dsh-client) never
 * imports schemastery — it is not part of the web shell's static module
 * table, and bundling a second copy just to build a schema it never
 * evaluates would be dead weight.
 */
export declare const MirrorSettingsSchema: z<MirrorSettings>;
//# sourceMappingURL=schema.d.ts.map