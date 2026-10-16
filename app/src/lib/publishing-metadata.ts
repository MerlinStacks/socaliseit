import { z } from 'zod';

/** Explicit user choices only. Never generate people/product tags or subtitle dialogue. */
export const UserTagsSchema = z.array(z.object({
    username: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/, 'Use an Instagram username without @'),
    mediaIndex: z.number().int().min(0).max(9),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
})).max(20);

export const SubtitleTracksSchema = z.array(z.object({
    language: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'Use a language code such as en or en-AU'),
    name: z.string().trim().min(1).max(150),
    text: z.string().min(1).max(500_000).refine(text => /\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(text), 'Provide timed SRT or WebVTT subtitles'),
})).max(5).refine(tracks => new Set(tracks.map(t => `${t.language}:${t.name}`)).size === tracks.length, 'Subtitle tracks must have unique language/name pairs');

export type UserTag = z.infer<typeof UserTagsSchema>[number];
export type SubtitleTrack = z.infer<typeof SubtitleTracksSchema>[number];

const ProductTagsSchema = z.array(z.object({
    platformProductId: z.string().min(1).max(200),
    productName: z.string().min(1).max(500),
    mediaIndex: z.number().int().min(0).max(9),
    positionX: z.number().min(0).max(1).nullish(),
    positionY: z.number().min(0).max(1).nullish(),
})).max(30);

const CustomThumbnailsSchema = z.record(z.string().min(1).max(200), z.string().max(3_000_000))
    .refine(values => Object.keys(values).length <= 20, 'Too many custom thumbnails');

export function validatePublishingMetadata(settings: Record<string, unknown>, mediaCount?: number): string | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'Platform settings must be an object';
    for (const [field, schema] of [['userTags', UserTagsSchema], ['subtitleTracks', SubtitleTracksSchema], ['productTags', ProductTagsSchema], ['customThumbnails', CustomThumbnailsSchema]] as const) {
        if (settings[field] === undefined) continue;
        const result = schema.safeParse(settings[field]);
        if (!result.success) return `${field}: ${result.error.issues[0].message}`;
    }
    if (mediaCount !== undefined) {
        for (const field of ['userTags', 'productTags']) {
            const tags = settings[field];
            if (Array.isArray(tags) && tags.some(tag => !Number.isInteger(tag.mediaIndex) || tag.mediaIndex < 0 || tag.mediaIndex >= mediaCount)) {
                return `${field}: a selected media item is no longer attached. Review tags before publishing.`;
            }
        }
    }
    return null;
}
