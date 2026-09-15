import type { SebModel } from './openrouter-models';
import { SebProviderError } from './seb-provider-error';

/** Reserve visible output separately. Effort is a provider hint, never a hard token cap. */
export function sebBudget(model: SebModel, output: number, inputReserve: number) {
    const r = model.reasoning;
    let reasoning: { effort?: string; max_tokens?: number; exclude: boolean } | undefined;
    let reserve = 0;
    if (!r && (model.supportedParameters.some(p => ['reasoning', 'reasoning_effort'].includes(p)) || model.id.startsWith('openrouter/'))) {
        throw new SebProviderError('BUDGET');
    }
    if (r) {
        const allows = (effort: string) => r.supportedEfforts === null || r.supportedEfforts?.includes(effort);
        if (r.mandatory === false && allows('none')) {
            reasoning = { effort: 'none', exclude: true };
        } else if (r.supportsMaxTokens) {
            // 1024 is the documented Anthropic minimum; do not send a tiny invalid budget.
            reserve = 1024;
            reasoning = { max_tokens: reserve, exclude: true };
        } else {
            const effort = ['minimal', 'low'].find(allows);
            if (effort) {
                reserve = Math.max(2048, Math.ceil(output / (effort === 'low' ? 4 : 9)));
                reasoning = { effort, exclude: true };
            } else if (r.mandatory !== false || r.defaultEnabled !== false) {
                throw new SebProviderError('BUDGET');
            }
        }
    }
    const total = output + reserve;
    // Fail before billing rather than silently shrinking away the visible-output reserve.
    if (total > (model.maxCompletionTokens ?? Infinity) || total + inputReserve > (model.contextLength ?? Infinity)) {
        throw new SebProviderError('BUDGET');
    }
    return { max_tokens: total, ...(reasoning ? { reasoning } : {}) };
}

/** Conservative text byte upper bound; image tokenization varies by provider. */
export function sebInputReserve(messages: unknown[]): number {
    let size = 128;
    for (const message of messages) {
        const content = (message as { content?: unknown })?.content;
        size += 32;
        if (typeof content === 'string') size += Buffer.byteLength(content);
        else if (Array.isArray(content)) for (const part of content) {
            if (part?.type === 'image_url') size += 4096;
            else if (typeof part?.text === 'string') size += Buffer.byteLength(part.text);
        }
    }
    return size;
}
