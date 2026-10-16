import { db } from '@/lib/db';
import { generateAltText } from '@/lib/ai/generate-alt-text';
import type { PublishablePost } from './publish-helpers';

const ALT_TEXT_PLATFORMS = new Set(['instagram', 'facebook', 'threads', 'linkedin', 'bluesky', 'pinterest']);

/** Resolve each image before dispatch; provider failures can safely retry without posting. */
export async function ensurePublishAltText(post: PublishablePost): Promise<void> {
    if (!ALT_TEXT_PLATFORMS.has(post.platform?.toLowerCase() || '') || post.altText?.trim()) return;

    for (const { media } of post.media) {
        if (!media.mimeType.startsWith('image/') || media.altText?.trim()) continue;
        const altText = await generateAltText(media.url, post.organizationId, post.caption);
        // Only replace the value read by this job; never overwrite a concurrent manual edit.
        await db.media.updateMany({
            where: { id: media.id, organizationId: post.organizationId, altText: media.altText },
            data: { altText },
        });
        const saved = await db.media.findFirst({ where: { id: media.id, organizationId: post.organizationId } });
        media.altText = saved?.altText?.trim() || altText;
    }
}
