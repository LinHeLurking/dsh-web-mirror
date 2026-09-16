import z from '@deepseek-ai/schemastery';
/**
 * Mirror configuration. Everything is optional except host/port — the
 * defaults are deliberately conservative (hide sensitive event kinds,
 * redact common token patterns) so a fresh install doesn't leak reasoning
 * traces or API keys to anyone who can reach the mirror port.
 */
export interface Config {
    host: '127.0.0.1' | '0.0.0.0';
    port: number;
    /** Topic-id regex allowlist. Empty = all topics pass. */
    include: string[];
    /** Topic-id regex blocklist, applied after include. */
    exclude: string[];
    /** Event-kind filtering (server-side, before events reach the wire). */
    events: {
        /** Extra kind regexes to hide, on top of the default sensitive set. */
        hide: string[];
        /** Kind regexes to force-show, overriding both hide and the defaults. */
        show: string[];
    };
    /** Tool-call filtering, matched against the tool name. */
    tools: {
        /** Fully hide the tool row (no call, no result, no trace). */
        hide: string[];
        /** Show the row but blank the call payload. */
        hideCalls: string[];
        /** Show the row but blank the result body. */
        hideResults: string[];
    };
    /**
     * Regex replacements applied to every text payload that crosses the
     * wire: assistant text, user message text, tool call arguments, tool
     * result bodies. Patterns are evaluated in order.
     */
    redact: Array<{
        pattern: string;
        replace: string;
    }>;
    /**
     * When true (default), the mirror layers a built-in conservative set on
     * top of the user's rules: hides reasoning/approval/subagent-internal
     * event kinds and redacts common API-key shapes. Set to false to start
     * from a clean slate and configure everything explicitly.
     */
    sensitiveDefaults: boolean;
}
export declare const Config: z<Config>;
export interface FilterRules {
    include: RegExp[];
    exclude: RegExp[];
    events: {
        hide: RegExp[];
        show: RegExp[];
    };
    tools: {
        hide: RegExp[];
        hideCalls: RegExp[];
        hideResults: RegExp[];
    };
    redact: Array<{
        pattern: RegExp;
        replace: string;
    }>;
    sensitiveDefaults: boolean;
}
export declare function compileFilterRules(config: Config): FilterRules;
export declare function isTopicVisible(topicId: string, rules: FilterRules): boolean;
/**
 * Whether an event kind should cross the wire. `show` wins over both the
 * user's `hide` list and the built-in sensitive defaults.
 */
export declare function isEventKindVisible(kind: string, rules: FilterRules): boolean;
/** Tool-name visibility for the three tool-filter axes. */
export interface ToolVisibility {
    /** Drop the entire tool row. */
    hidden: boolean;
    /** Keep the row but strip the call payload. */
    hideCall: boolean;
    /** Keep the row but strip the result body. */
    hideResult: boolean;
}
export declare function toolVisibility(toolName: string, rules: FilterRules): ToolVisibility;
/**
 * Apply every configured redaction to a string. Order matters — later
 * rules see the output of earlier ones.
 */
export declare function redactText(text: string, rules: FilterRules): string;
//# sourceMappingURL=config.d.ts.map