import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
    port: z.natural().max(65535).required(),
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
});
export function compileFilterRules(config) {
    const compile = (patterns) => patterns.map((pattern) => {
        try {
            return new RegExp(pattern);
        }
        catch {
            throw new Error(`Invalid regex in filter config: ${pattern}`);
        }
    });
    return {
        include: compile(config.include),
        exclude: compile(config.exclude),
    };
}
export function isTopicVisible(topicId, rules) {
    if (rules.include.length > 0 && !rules.include.some((r) => r.test(topicId))) {
        return false;
    }
    return !rules.exclude.some((r) => r.test(topicId));
}
//# sourceMappingURL=config.js.map