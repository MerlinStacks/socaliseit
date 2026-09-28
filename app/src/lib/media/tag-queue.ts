import { db } from '@/lib/db';
import { mediaTagQueue } from '@/lib/bullmq/queues';
import { logger } from '@/lib/logger';

/** Claim before enqueueing so concurrent upload/manual requests cannot duplicate analysis. */
export async function enqueueMediaTagging(organizationId: string, mediaId: string): Promise<boolean> {
    const claimed = await db.media.updateMany({
        where: {
            id: mediaId, organizationId,
            AND: [
                { OR: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }] },
                { OR: [{ aiTagStatus: null }, { aiTagStatus: { notIn: ['pending', 'processing'] } }] },
            ],
        },
        data: { aiTagStatus: 'pending', aiTagError: null },
    });
    if (!claimed.count) return false;
    try {
        await mediaTagQueue.add('analyze', { organizationId, mediaId });
        return true;
    } catch (error) {
        await db.media.updateMany({
            where: { id: mediaId, organizationId, aiTagStatus: 'pending' },
            data: { aiTagStatus: 'failed', aiTagError: 'Could not queue analysis. Please try again.' },
        });
        throw error;
    }
}

/** Upload success is independent of AI/queue availability. */
export async function autoTagUpload(organizationId: string, mediaId: string, mimeType: string) {
    if (!/^(image|video)\//.test(mimeType)) return;
    try {
        const [organization, settings] = await Promise.all([
            db.organization.findUnique({ where: { id: organizationId }, select: { mediaAutoTagEnabled: true } }),
            db.globalAISettings.findUnique({ where: { id: 'global_ai_settings' }, select: { isConfigured: true } }),
        ]);
        if (organization?.mediaAutoTagEnabled && settings?.isConfigured) {
            await enqueueMediaTagging(organizationId, mediaId);
        }
    } catch (error) {
        logger.warn({ err: error, mediaId, organizationId }, 'Could not auto-tag upload');
    }
}
