import z from '@deepseek-ai/schemastery';
export interface Config {
    host: '127.0.0.1' | '0.0.0.0';
    port: number;
    include: string[];
    exclude: string[];
}
export declare const Config: z<Config>;
export interface FilterRules {
    include: RegExp[];
    exclude: RegExp[];
}
export declare function compileFilterRules(config: Config): FilterRules;
export declare function isTopicVisible(topicId: string, rules: FilterRules): boolean;
//# sourceMappingURL=config.d.ts.map