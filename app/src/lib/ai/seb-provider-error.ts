import { NextResponse } from 'next/server';

/** Only allowlisted messages and scalar diagnostics cross the provider boundary. */
const errors = {
    CONFIGURATION: [503, 'OpenRouter is not configured or its API key is invalid. Contact your administrator.'],
    CREDITS: [503, 'OpenRouter credits are exhausted. Contact your administrator.'],
    RATE_LIMIT: [429, 'OpenRouter is rate limiting requests. Please try again later.'],
    TIMEOUT: [504, 'OpenRouter timed out. Please try again later.'],
    UNAVAILABLE: [503, 'OpenRouter is temporarily unavailable. Please try again later.'],
    METADATA: [503, 'Model capabilities are unavailable. Please try again later; no generation was sent.'],
    MODEL: [400, 'Seb requires a model with image input support for alt text. Choose a supported model.'],
    BUDGET: [400, 'This model cannot safely accommodate the requested output and reasoning budget. Choose a model with lower reasoning or larger token limits.'],
    INVALID_OUTPUT: [502, 'OpenRouter returned an empty, incomplete, or invalid response.'],
    BLOCKED: [403, 'The AI provider declined this request. Please revise your input.'],
    REQUEST: [400, 'The AI provider could not accept this request. Check the selected model and input.'],
} as const;

export class SebProviderError extends Error {
    readonly status: number;
    constructor(public readonly code: keyof typeof errors, public readonly retryAfter?: number) {
        super(errors[code][1]);
        this.name = 'SebProviderError';
        this.status = errors[code][0];
    }
}

export function providerError(status: number, type?: unknown, retryAfter?: string | null) {
    const seconds = retryAfter ? /^\d+$/.test(retryAfter) ? Number(retryAfter) : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000) : undefined;
    const types: Record<string, keyof typeof errors> = {
        authentication: 'CONFIGURATION', payment_required: 'CREDITS', rate_limit_exceeded: 'RATE_LIMIT',
        timeout: 'TIMEOUT', refusal: 'BLOCKED', content_policy_violation: 'BLOCKED', permission_denied: 'BLOCKED',
        provider_unavailable: 'UNAVAILABLE', provider_overloaded: 'UNAVAILABLE',
        context_length_exceeded: 'BUDGET', max_tokens_exceeded: 'INVALID_OUTPUT',
    };
    const typed = typeof type === 'string' && Object.hasOwn(types, type) ? types[type] : undefined;
    const code = typed ?? (status === 401 ? 'CONFIGURATION' : status === 402 ? 'CREDITS'
        : status === 429 ? 'RATE_LIMIT' : status === 408 || status === 504 ? 'TIMEOUT'
        : status === 403 ? 'BLOCKED' : status >= 400 && status < 500 ? 'REQUEST' : 'UNAVAILABLE');
    return new SebProviderError(code, seconds && seconds > 0 && Number.isSafeInteger(seconds) ? Math.min(seconds, 86400) : undefined);
}

export function sebErrorResponse(error: unknown): NextResponse | undefined {
    if (!(error instanceof SebProviderError)) return;
    return NextResponse.json({ success: false, error: error.message, code: error.code }, {
        status: error.status,
        headers: error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined,
    });
}
