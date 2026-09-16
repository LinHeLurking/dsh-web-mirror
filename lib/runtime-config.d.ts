import { type Config, type FilterRules } from './config.js';
/**
 * The subset of the mirror config that the web UI can edit at runtime.
 * host/port are deliberately excluded — rebinding the listener is a
 * restart-level operation and stays in cordis.patch.yml.
 */
export interface EditableConfig {
    include: string[];
    exclude: string[];
    events: {
        hide: string[];
        show: string[];
    };
    tools: {
        hide: string[];
        hideCalls: string[];
        hideResults: string[];
    };
    redact: Array<{
        pattern: string;
        replace: string;
    }>;
    sensitiveDefaults: boolean;
}
/** Where UI-made config changes are persisted so they survive restarts. */
export declare function defaultConfigFile(): string;
/** Deep-partial shape of EditableConfig used for PATCH-style updates. */
export interface EditableConfigPatch {
    include?: string[];
    exclude?: string[];
    events?: {
        hide?: string[];
        show?: string[];
    };
    tools?: {
        hide?: string[];
        hideCalls?: string[];
        hideResults?: string[];
    };
    redact?: Array<{
        pattern: string;
        replace: string;
    }>;
    sensitiveDefaults?: boolean;
}
/**
 * Validate a partial update body. Returns the sanitized patch (only the
 * recognized, well-typed fields) plus a list of human-readable errors.
 * Unknown top-level keys are rejected so typos don't silently no-op.
 */
export declare function validateConfigPatch(body: unknown): {
    patch: EditableConfigPatch;
    errors: string[];
};
export type ConfigUpdateResult = {
    ok: true;
    config: EditableConfig;
} | {
    ok: false;
    errors: string[];
};
/**
 * Runtime-mutable mirror configuration.
 *
 * Resolution order: cordis patch yaml (base) → persisted UI overrides
 * file → live PUT /config updates. The compiled FilterRules are rebuilt
 * eagerly on every accepted update, and consumers read them through the
 * `rules` getter, so a config change takes effect on the next request
 * with no restart and no subscription wiring.
 */
export declare class MirrorConfigStore {
    private base;
    private editable;
    private compiled;
    readonly file: string;
    constructor(base: Config, file?: string);
    /** Compiled rules, recompiled on every accepted update. */
    get rules(): FilterRules;
    /** Full effective config (base host/port + current editable fields). */
    getConfig(): Config;
    /** Defensive copy of the editable fields, for the GET /config response. */
    getEditable(): EditableConfig;
    /** Validate and apply a partial update, persist it, recompile rules. */
    update(body: unknown): ConfigUpdateResult;
    /** Drop all UI overrides and fall back to the cordis patch yaml values. */
    reset(): ConfigUpdateResult;
    private fullConfig;
    private persist;
    /**
     * Load persisted UI overrides. A malformed file is ignored (and left in
     * place for inspection) rather than taking the mirror down at startup.
     */
    private readOverrides;
}
//# sourceMappingURL=runtime-config.d.ts.map