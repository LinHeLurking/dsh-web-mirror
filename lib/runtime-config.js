import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { compileFilterRules } from './config.js';
/** Where UI-made config changes are persisted so they survive restarts. */
export function defaultConfigFile() {
    return process.env['DSH_MIRROR_CONFIG_FILE'] ?? join(homedir(), '.dsh-web-mirror.json');
}
function pickEditable(config) {
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
    };
}
/** All fields here are plain JSON data — JSON round-trip is a safe deep copy. */
function copyEditable(config) {
    return JSON.parse(JSON.stringify(config));
}
function validateRegexList(value, label, errors) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push(`${label}: expected an array of strings`);
        return undefined;
    }
    for (const pattern of value) {
        try {
            new RegExp(pattern);
        }
        catch {
            errors.push(`${label}: invalid regex: ${pattern}`);
        }
    }
    return value;
}
/**
 * Validate a partial update body. Returns the sanitized patch (only the
 * recognized, well-typed fields) plus a list of human-readable errors.
 * Unknown top-level keys are rejected so typos don't silently no-op.
 */
export function validateConfigPatch(body) {
    const errors = [];
    const patch = {};
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return { patch, errors: ['Request body must be a JSON object'] };
    }
    const input = body;
    for (const key of Object.keys(input)) {
        if (key === 'host' || key === 'port') {
            errors.push(`${key}: read-only here — change it in cordis.patch.yml and restart dsh`);
        }
        else if (!['include', 'exclude', 'events', 'tools', 'redact', 'sensitiveDefaults'].includes(key)) {
            errors.push(`Unknown config key: ${key}`);
        }
    }
    const include = validateRegexList(input['include'], 'include', errors);
    if (include)
        patch.include = include;
    const exclude = validateRegexList(input['exclude'], 'exclude', errors);
    if (exclude)
        patch.exclude = exclude;
    if (input['events'] !== undefined) {
        const events = input['events'];
        if (events === null || typeof events !== 'object' || Array.isArray(events)) {
            errors.push('events: expected an object with hide/show arrays');
        }
        else {
            const e = events;
            const hide = validateRegexList(e['hide'], 'events.hide', errors);
            const show = validateRegexList(e['show'], 'events.show', errors);
            patch.events = {};
            if (hide)
                patch.events.hide = hide;
            if (show)
                patch.events.show = show;
            if (!hide && !show)
                delete patch.events;
        }
    }
    if (input['tools'] !== undefined) {
        const tools = input['tools'];
        if (tools === null || typeof tools !== 'object' || Array.isArray(tools)) {
            errors.push('tools: expected an object with hide/hideCalls/hideResults arrays');
        }
        else {
            const t = tools;
            const hide = validateRegexList(t['hide'], 'tools.hide', errors);
            const hideCalls = validateRegexList(t['hideCalls'], 'tools.hideCalls', errors);
            const hideResults = validateRegexList(t['hideResults'], 'tools.hideResults', errors);
            patch.tools = {};
            if (hide)
                patch.tools.hide = hide;
            if (hideCalls)
                patch.tools.hideCalls = hideCalls;
            if (hideResults)
                patch.tools.hideResults = hideResults;
            if (!hide && !hideCalls && !hideResults)
                delete patch.tools;
        }
    }
    if (input['redact'] !== undefined) {
        const redact = input['redact'];
        if (!Array.isArray(redact)) {
            errors.push('redact: expected an array of {pattern, replace}');
        }
        else {
            const rules = [];
            redact.forEach((rule, i) => {
                if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
                    errors.push(`redact[${i}]: expected an object with pattern/replace`);
                    return;
                }
                const r = rule;
                if (typeof r['pattern'] !== 'string' || typeof r['replace'] !== 'string') {
                    errors.push(`redact[${i}]: pattern and replace must be strings`);
                    return;
                }
                try {
                    new RegExp(r['pattern']);
                }
                catch {
                    errors.push(`redact[${i}]: invalid regex: ${r['pattern']}`);
                    return;
                }
                rules.push({ pattern: r['pattern'], replace: r['replace'] });
            });
            patch.redact = rules;
        }
    }
    if (input['sensitiveDefaults'] !== undefined) {
        if (typeof input['sensitiveDefaults'] === 'boolean') {
            patch.sensitiveDefaults = input['sensitiveDefaults'];
        }
        else {
            errors.push('sensitiveDefaults: expected a boolean');
        }
    }
    return { patch, errors };
}
function mergeEditable(base, patch) {
    const next = copyEditable(base);
    if (patch.include !== undefined)
        next.include = patch.include;
    if (patch.exclude !== undefined)
        next.exclude = patch.exclude;
    if (patch.events !== undefined) {
        if (patch.events.hide !== undefined)
            next.events.hide = patch.events.hide;
        if (patch.events.show !== undefined)
            next.events.show = patch.events.show;
    }
    if (patch.tools !== undefined) {
        if (patch.tools.hide !== undefined)
            next.tools.hide = patch.tools.hide;
        if (patch.tools.hideCalls !== undefined)
            next.tools.hideCalls = patch.tools.hideCalls;
        if (patch.tools.hideResults !== undefined)
            next.tools.hideResults = patch.tools.hideResults;
    }
    if (patch.redact !== undefined)
        next.redact = patch.redact;
    if (patch.sensitiveDefaults !== undefined)
        next.sensitiveDefaults = patch.sensitiveDefaults;
    return next;
}
/**
 * Runtime-mutable mirror configuration.
 *
 * Resolution order: cordis patch yaml (base) → persisted UI overrides
 * file → live PUT /config updates. The compiled FilterRules are rebuilt
 * eagerly on every accepted update, and consumers read them through the
 * `rules` getter, so a config change takes effect on the next request
 * with no restart and no subscription wiring.
 */
export class MirrorConfigStore {
    base;
    editable;
    compiled;
    file;
    constructor(base, file) {
        this.base = base;
        this.file = file ?? defaultConfigFile();
        this.editable = pickEditable(base);
        const saved = this.readOverrides();
        if (saved !== null) {
            this.editable = mergeEditable(this.editable, saved);
        }
        this.compiled = compileFilterRules(this.fullConfig());
    }
    /** Compiled rules, recompiled on every accepted update. */
    get rules() {
        return this.compiled;
    }
    /** Full effective config (base host/port + current editable fields). */
    getConfig() {
        return this.fullConfig();
    }
    /** Defensive copy of the editable fields, for the GET /config response. */
    getEditable() {
        return copyEditable(this.editable);
    }
    /** Validate and apply a partial update, persist it, recompile rules. */
    update(body) {
        const { patch, errors } = validateConfigPatch(body);
        if (errors.length > 0)
            return { ok: false, errors };
        const next = mergeEditable(this.editable, patch);
        try {
            this.persist(next);
        }
        catch (e) {
            return { ok: false, errors: [`Failed to persist config to ${this.file}: ${String(e)}`] };
        }
        this.editable = next;
        this.compiled = compileFilterRules(this.fullConfig());
        return { ok: true, config: this.getEditable() };
    }
    /** Drop all UI overrides and fall back to the cordis patch yaml values. */
    reset() {
        const next = pickEditable(this.base);
        try {
            if (existsSync(this.file))
                unlinkSync(this.file);
        }
        catch (e) {
            return { ok: false, errors: [`Failed to remove ${this.file}: ${String(e)}`] };
        }
        this.editable = next;
        this.compiled = compileFilterRules(this.fullConfig());
        return { ok: true, config: this.getEditable() };
    }
    fullConfig() {
        return { host: this.base.host, port: this.base.port, ...copyEditable(this.editable) };
    }
    persist(editable) {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(this.file, `${JSON.stringify({ version: 1, ...editable }, null, 2)}\n`, 'utf-8');
    }
    /**
     * Load persisted UI overrides. A malformed file is ignored (and left in
     * place for inspection) rather than taking the mirror down at startup.
     */
    readOverrides() {
        let raw;
        try {
            raw = readFileSync(this.file, 'utf-8');
        }
        catch {
            return null;
        }
        try {
            const parsed = JSON.parse(raw);
            // The envelope carries a `version` field for future migrations;
            // strip it before the strict unknown-key validation.
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                delete parsed['version'];
            }
            const { patch, errors } = validateConfigPatch(parsed);
            if (errors.length > 0)
                return null;
            return patch;
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=runtime-config.js.map