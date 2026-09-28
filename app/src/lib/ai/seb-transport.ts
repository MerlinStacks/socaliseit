import { logger } from '@/lib/logger';
import { getSebModel } from './openrouter-models';
import { sebBudget, sebInputReserve } from './seb-budget';
import { providerError, SebProviderError } from './seb-provider-error';

export type SebJsonSchema = { name: string; schema: Record<string, unknown> };
export type SebTransportOptions = { timeoutMs?: number };
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 180_000;
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
    options: SebTransportOptions = {},
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
    // Invalid budgets retain the default; finite positive budgets are bounded.
    const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(options.timeoutMs))) : DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const controller = new AbortController();
    let abortOrigin: 'local_deadline' | 'caller_abort' | undefined;
    let origin = 'network';
    let httpStatus: number | undefined;
    const abort = (source: NonNullable<typeof abortOrigin>) => {
        if (controller.signal.aborted) return;
        abortOrigin = source;
        controller.abort();
    };
    const onCallerAbort = () => abort('caller_abort');
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (signal?.aborted) onCallerAbort();
    const timer = setTimeout(() => abort('local_deadline'), timeoutMs);
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: controller.signal,
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
        httpStatus = response.status;
        if (!response.ok) {
            origin = 'upstream_http';
            // Read only the canonical type; never retain the message, raw body or metadata.
            let type: unknown;
            try { type = (await response.json())?.error?.metadata?.error_type; } catch { /* HTTP status remains authoritative. */ }
            throw providerError(response.status, type, response.headers.get('retry-after'));
        }
        let data: Completion;
        origin = 'response_body';
        try { data = await response.json(); } catch (error) {
            if (isTimeout(error)) throw new SebProviderError('TIMEOUT');
            throw new SebProviderError('INVALID_OUTPUT');
        }
        origin = 'invalid_output';
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
        if (error || choice?.finish_reason === 'error') {
            origin = 'upstream_typed';
            throw providerError(error?.code ?? 502, error?.metadata?.error_type);
        }
        if (choice?.message?.refusal || ['content_filter', 'refusal'].includes(choice?.finish_reason ?? '')) {
            origin = 'upstream_refusal';
            throw new SebProviderError('BLOCKED');
        }
        return data;
    } catch (error) {
        const safe = error instanceof SebProviderError ? error
            : abortOrigin || isTimeout(error) ? new SebProviderError('TIMEOUT')
                : new SebProviderError('UNAVAILABLE');
        logger.warn({ code: safe.code, status: safe.status, httpStatus,
            elapsedMs: Math.max(0, Date.now() - startedAt), timeoutMs, origin: abortOrigin ?? origin }, 'Seb provider request failed');
        throw safe;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
    }
}

function isTimeout(error: unknown) {
    return error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
}
