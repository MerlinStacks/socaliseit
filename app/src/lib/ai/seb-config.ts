import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { SebProviderError } from './seb-provider-error';

export const DEFAULT_SEB_MODEL = 'openai/gpt-4o-mini';

/** Provider availability is independent of the chat/report feature switch.
 * Legacy selectedModel values are imported by the single-model data migration,
 * never used as a generation-time fallback.
 */
export async function getSebProviderSettings() {
    const settings = await db.globalAISettings.findUnique({ where: { id: 'global_ai_settings' } });
    if (!settings?.isConfigured) throw new SebProviderError('CONFIGURATION');
    let apiKey: string;
    try { apiKey = decrypt(settings.apiKey); } catch { throw new SebProviderError('CONFIGURATION'); }
    if (!apiKey.trim()) throw new SebProviderError('CONFIGURATION');
    return {
        settings,
        apiKey,
        model: settings.sebModel?.trim() || DEFAULT_SEB_MODEL,
        temperature: settings.sebTemperature ?? 0.55,
    };
}
