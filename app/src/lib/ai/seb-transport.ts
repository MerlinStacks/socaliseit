import { logger } from '@/lib/logger';
import { getSebModel } from './openrouter-models';
import { sebBudget, sebInputReserve } from './seb-budget';
import { providerError, SebProviderError } from './seb-provider-error';

export type SebJsonSchema = { name: string; schema: Record<string, unknown> };
type Completion = {
    id?: unknown;
    error?: { code?: number; metadata?: { error_type?: unknown } };
    choices?: Array<{
        message?: { content?: unknown; refusal?: unknown };
        finish_reason?: string;
        error?: { code?: number; metadata?: { error_type?: unknown } };
    }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; cost?: unknown; completion_tokens_details?: { reasoning_tokens?: unknown } };
};

/** Sole completion transport. No automatic retries: even empty successes can be billed. */
export async function requestSebCompletion(
    settings: { apiKey: string; model: string; temperature: number },
    messages: unknown[],
    maxTokens: number,
    jsonMode: boolean | SebJsonSchema = false,
    signal?: AbortSignal,
) {
    if (!settings.apiKey.trim()) throw new SebProviderError('CONFIGURATION');
    const model = await getSebModel(settings.model);
    const hasImages = messages.some(message => Array.isArray((message as { content?: unknown })?.content)
        && ((message as { content: Array<{ type?: string }> }).content).some(part => part.type === 'image_url'));
    if (hasImages && !model.supportsImageInput) throw new SebProviderError('MODEL');
    const schema = typeof jsonMode === 'object' ? jsonMode : undefined;
    const structured = schema && model.supportsStructuredOutputs;
    const requestMessages = schema ? [...messages, { role: 'system', content: `Return only JSON matching this schema: ${JSON.stringify(schema.schema)}` }] : messages;
    const budget = sebBudget(model, maxTokens, sebInputReserve(requestMessages));
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
            headers: {
                Authorization: `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://localhost:3000',
                'X-OpenRouter-Title': 'Overseek Socials Seb',
            },
            body: JSON.stringify({
                model: settings.model, messages: requestMessages, ...budget,
                ...(model.supportedParameters.includes('temperature') ? { temperature: settings.temperature } : {}),
                ...(structured || budget.reasoning ? { provider: { require_parameters: true } } : {}),
                ...(structured ? { response_format: { type: 'json_schema', json_schema: { ...schema, strict: true } } }
                    : jsonMode && model.supportedParameters.includes('response_format') ? { response_format: { type: 'json_object' } } : {}),
            }),
        });
        if (!response.ok) {
            // Read only the canonical type; never retain the message, raw body or metadata.
            let type: unknown;
            try { type = (await response.json())?.error?.metadata?.error_type; } catch { /* HTTP status remains authoritative. */ }
            throw providerError(response.status, type, response.headers.get('retry-after'));
        }
        let data: Completion;
        try { data = await response.json(); } catch (error) {
            if (isTimeout(error)) throw new SebProviderError('TIMEOUT');
            throw new SebProviderError('INVALID_OUTPUT');
        }
        if (!data || typeof data !== 'object') throw new SebProviderError('INVALID_OUTPUT');
        const choice = data.choices?.[0];
        const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
        logger.info({
            generationId: typeof data.id === 'string' && /^gen-[a-zA-Z0-9_-]{1,120}$/.test(data.id) ? data.id : undefined,
            promptTokens: number(data.usage?.prompt_tokens), completionTokens: number(data.usage?.completion_tokens),
            totalTokens: number(data.usage?.total_tokens), reasoningTokens: number(data.usage?.completion_tokens_details?.reasoning_tokens),
            cost: number(data.usage?.cost), maxTokens: budget.max_tokens,
            finishReason: ['stop', 'length', 'error', 'content_filter', 'refusal'].includes(choice?.finish_reason ?? '') ? choice?.finish_reason : 'unknown',
        }, 'Seb completion usage');
        const error = data.error ?? choice?.error;
        if (error || choice?.finish_reason === 'error') throw providerError(error?.code ?? 502, error?.metadata?.error_type);
        if (choice?.message?.refusal || ['content_filter', 'refusal'].includes(choice?.finish_reason ?? '')) throw new SebProviderError('BLOCKED');
        return data;
    } catch (error) {
        const safe = error instanceof SebProviderError ? error
            : isTimeout(error) ? new SebProviderError('TIMEOUT')
                : new SebProviderError('UNAVAILABLE');
        logger.warn({ code: safe.code, status: safe.status }, 'Seb provider request failed');
        throw safe;
    }
}

function isTimeout(error: unknown) {
    return error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
}
