import { type Config, type FilterRules } from './config.js';
import type { MirrorSettings } from './settings.js';
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
export declare class MirrorConfigStore {
    private readonly base;
    private settings;
    private compiled;
    constructor(base: Config, settings: MirrorSettings);
    /** Compiled rules for the current layers. */
    get rules(): FilterRules;
    /** Swap the DSH settings layer (called after every settings commit). */
    updateSettings(settings: MirrorSettings): void;
    /** Full effective config: filter fields from settings, host/port from base. */
    getConfig(): Config;
    private fullConfig;
}
//# sourceMappingURL=runtime-config.d.ts.map