import { SebProviderError } from './seb-provider-error';

export interface SebModel {
    id: string;
    name: string;
    description: string;
    inputModalities: string[];
    supportedParameters: string[];
    supportsImageInput: boolean;
    supportsStructuredOutputs: boolean;
    contextLength: number | null;
    maxCompletionTokens: number | null;
    modality: string;
    promptPrice: string;
    completionPrice: string;
    reasoning: {
        supportedEfforts?: string[] | null;
        defaultEnabled?: boolean;
        mandatory?: boolean;
        supportsMaxTokens: boolean;
    } | null;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase()) : [];
const cap = (...values: unknown[]): number | null => {
    const numbers = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
    return numbers.length ? Math.floor(Math.min(...numbers)) : null;
};

export function normalizeSebModel(value: unknown): SebModel | null {
    const row = object(value);
    // A missing parameter catalogue is unknown capability, not a non-reasoning model.
    if (typeof row.id !== 'string' || !row.id || !Array.isArray(row.supported_parameters)) return null;
    const architecture = object(row.architecture), top = object(row.top_provider), limits = object(row.per_request_limits);
    const pricing = object(row.pricing), reasoning = object(row.reasoning);
    // Never infer image *input* from image output in the legacy modality string.
    const inputModalities = strings(architecture.input_modalities);
    const supportedParameters = strings(row.supported_parameters);
    return {
        id: row.id, name: typeof row.name === 'string' ? row.name : row.id,
        description: typeof row.description === 'string' ? row.description : '',
        inputModalities, supportedParameters,
        supportsImageInput: inputModalities.includes('image'),
        supportsStructuredOutputs: supportedParameters.includes('structured_outputs'),
        contextLength: cap(row.context_length, top.context_length),
        maxCompletionTokens: cap(top.max_completion_tokens, limits.completion_tokens),
        modality: typeof architecture.modality === 'string' ? architecture.modality : inputModalities.join(','),
        promptPrice: typeof pricing.prompt === 'string' ? pricing.prompt : '0',
        completionPrice: typeof pricing.completion === 'string' ? pricing.completion : '0',
        reasoning: row.reasoning ? {
            supportedEfforts: reasoning.supported_efforts === null ? null : Array.isArray(reasoning.supported_efforts) ? strings(reasoning.supported_efforts) : undefined,
            defaultEnabled: typeof reasoning.default_enabled === 'boolean' ? reasoning.default_enabled : undefined,
            mandatory: typeof reasoning.mandatory === 'boolean' ? reasoning.mandatory : undefined,
            supportsMaxTokens: reasoning.supports_max_tokens === true,
        } : null,
    };
}

// Public catalogue: no key, persistence, or stale capability assumptions. Coalesce requests.
let cache: { models: SebModel[]; expires: number } | undefined;
let pending: Promise<SebModel[]> | undefined;
let retryAt = 0;
export async function getSebModels(): Promise<SebModel[]> {
    if (cache && cache.expires > Date.now()) return cache.models;
    if (pending) return pending;
    if (retryAt > Date.now()) throw new SebProviderError('METADATA');
    pending = (async () => {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'X-OpenRouter-Title': 'Overseek Socials Seb' },
                signal: AbortSignal.timeout(10000), cache: 'no-store',
            });
            if (!response.ok) throw new Error();
            const body = await response.json();
            if (!Array.isArray(body?.data) || !body.data.length) throw new Error();
            const models = body.data.map(normalizeSebModel).filter((m: SebModel | null): m is SebModel => m !== null);
            if (!models.length) throw new Error();
            cache = { models, expires: Date.now() + 300000 };
            return models;
        } catch {
            retryAt = Date.now() + 15000;
            throw new SebProviderError('METADATA');
        } finally { pending = undefined; }
    })();
    return pending;
}

export async function getSebModel(id: string): Promise<SebModel> {
    const model = (await getSebModels()).find(model => model.id === id);
    if (!model) throw new SebProviderError('METADATA');
    return model;
}

export async function validateSebModel(id: string) {
    const model = (await getSebModels()).find(model => model.id === id);
    if (!model?.supportsImageInput) throw new SebProviderError('MODEL');
    return model;
}
