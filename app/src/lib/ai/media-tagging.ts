import { db } from '@/lib/db';
import { getSebProviderSettings } from './seb-config';
import { requestSebCompletion } from './seb-transport';
import { SebProviderError } from './seb-provider-error';
import { taggingImages } from '@/lib/media/tagging-images';
import { acceptedMediaTags, MEDIA_TAGGING_PROMPT, normalizeMediaTag } from './media-tagging-prompt';

export async function analyzeMediaTags(organizationId: string, mediaId: string) {
    const media = await db.media.findFirst({ where: { id: mediaId, organizationId } });
    if (!media || !/^(image|video)\//.test(media.mimeType)) return;
    const settings = await getSebProviderSettings();
    const items = await db.media.findMany({
        where: { organizationId, NOT: { tags: { isEmpty: true } } },
        select: { tags: true }, orderBy: { createdAt: 'desc' }, take: 1000,
    });
    const existing = [...new Set(items.flatMap(item => item.tags))].filter(tag => tag.length <= 60).slice(0, 300);
    const images = await taggingImages(media);
    const result = await requestSebCompletion({ ...settings, temperature: 0.2 }, [
        { role: 'system', content: MEDIA_TAGGING_PROMPT },
        { role: 'user', content: [
            { type: 'text', text: `Existing workspace tags: ${JSON.stringify(existing)}` },
            ...images.map(url => ({ type: 'image_url', image_url: { url } })),
        ] },
    ], 1200, true);
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string' || choice?.finish_reason === 'length') throw new SebProviderError('INVALID_OUTPUT');
    let tags: string[];
    try {
        tags = acceptedMediaTags(JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()), existing);
    } catch { throw new SebProviderError('INVALID_OUTPUT'); }

    // Compare-and-swap preserves tags edited while the AI request was running.
    for (let attempt = 0; attempt < 5; attempt++) {
        const current = await db.media.findFirst({ where: { id: mediaId, organizationId }, select: { tags: true } });
        if (!current) return;
        const keys = new Set(current.tags.map(normalizeMediaTag));
        const added = tags.filter(tag => !keys.has(normalizeMediaTag(tag)));
        const updated = await db.media.updateMany({
            where: { id: mediaId, organizationId, tags: { equals: current.tags } },
            data: { tags: [...current.tags, ...added], aiTags: tags, aiTagStatus: 'completed', aiTagError: null },
        });
        if (updated.count) return;
    }
    throw new Error('Media tags changed during analysis. Please try again.');
}
