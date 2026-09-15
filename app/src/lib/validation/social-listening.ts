import { z } from 'zod';
import { Platform } from '@/generated/prisma/client';
import { parseExternalUrl } from '@/lib/validate-url';

const id = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(200);
const terms = z.array(z.string().trim().min(1).max(200)).max(100)
    .transform((values) => [...new Set(values.map((value) => value.toLowerCase()))]);
const keywords = terms.refine((values) => values.length > 0, 'At least one keyword is required');
const platforms = z.array(z.enum(Platform)).max(20);
const monitorFields = { name, keywords, excludedTerms: terms, platforms };

export const listeningQuerySchema = z.object({
    q: z.string().trim().max(500).optional(),
    monitorId: id.optional(),
    platform: z.enum(Platform).optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative', 'question']).optional(),
    sourceType: z.enum(['mention', 'comment', 'review', 'dm', 'public_post', 'crawler']).optional(),
    unread: z.enum(['true', 'false']).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'from must be before or equal to to', path: ['to'],
});
export type ListeningQuery = z.infer<typeof listeningQuerySchema>;
export const listeningItemsSchema = z.object({ ids: z.array(id).min(1).max(100), isRead: z.boolean() }).strict();
export const updateMonitorSchema = z.object({ ...monitorFields, isActive: z.boolean() }).partial().strict()
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

// Preserve the existing create API's comma-separated term inputs.
const legacyTerms = (schema: typeof terms | typeof keywords) => z.preprocess(
    (value) => typeof value === 'string' ? value.split(',').map((term) => term.trim()).filter(Boolean) : value, schema);
export const createMonitorSchema = z.object({
    name: name.optional(), keywords: legacyTerms(keywords),
    excludedTerms: legacyTerms(terms).optional(), platforms: platforms.optional(),
}).strict();

const url = z.string().trim().min(1).max(2048).transform((value, ctx) => {
    try {
        return parseExternalUrl(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`).toString();
    } catch {
        ctx.addIssue({ code: 'custom', message: 'A public HTTP(S) URL without credentials is required' });
        return z.NEVER;
    }
});
const sourceFields = { name, url, type: z.enum(['auto', 'rss', 'sitemap', 'page']) };
export const createSourceSchema = z.object(sourceFields).strict();
export const updateSourceSchema = z.object({ ...sourceFields, isActive: z.boolean() }).partial().strict()
    .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
