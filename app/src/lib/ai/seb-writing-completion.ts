import { getSebProviderSettings } from './seb-config';
import { requestSebCompletion, type SebJsonSchema } from './seb-transport';
import { SebProviderError } from './seb-provider-error';

export type SebWritingMessage = {
    role: 'system' | 'user';
    content: string | Array<
        { type: 'text'; text: string } |
        { type: 'image_url'; image_url: { url: string } }
    >;
};

/** Stateless writing transport: no chat sessions, media processing, or report writes. */
export async function completeSebWriting(messages: SebWritingMessage[], maxTokens = 1000, schema?: SebJsonSchema): Promise<string> {
    const { apiKey, model, temperature } = await getSebProviderSettings();
    const data = await requestSebCompletion({ apiKey, model, temperature }, messages, maxTokens, schema ?? false);
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason === 'length') {
        throw new SebProviderError('INVALID_OUTPUT');
    }
    if (typeof content !== 'string' || !content.trim()) throw new SebProviderError('INVALID_OUTPUT');
    return content.trim();
}
