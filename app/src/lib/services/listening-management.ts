import { z } from 'zod';
import { db } from '@/lib/db';
import { validateExternalUrl } from '@/lib/validate-url';
import { ListeningApiError } from './listening-api';
import { createSourceSchema, updateSourceSchema, updateMonitorSchema, listeningItemsSchema } from '@/lib/validation/social-listening';

export async function updateListeningItems(organizationId: string, input: z.infer<typeof listeningItemsSchema>) {
    // Unknown/foreign IDs are ignored; the count only describes this tenant's rows.
    const result = await db.socialListeningItem.updateMany({
        where: { organizationId, id: { in: input.ids } }, data: { isRead: input.isRead },
    });
    return { success: true, updatedCount: result.count };
}

export function updateListeningMonitor(organizationId: string, id: string, input: z.infer<typeof updateMonitorSchema>) {
    return db.socialListeningMonitor.update({ where: { id, organizationId }, data: input });
}

async function safeUrl(url: string) {
    const result = await validateExternalUrl(url);
    if (!result.valid) throw new ListeningApiError('Source URL must resolve to a public HTTP(S) address', 400);
    return result.url.toString();
}

export async function createListeningSource(organizationId: string, input: z.infer<typeof createSourceSchema>) {
    return db.socialListeningSource.create({ data: {
        organizationId, name: input.name, url: await safeUrl(input.url), sourceType: input.type,
    } });
}

export async function updateListeningSource(organizationId: string, id: string, input: z.infer<typeof updateSourceSchema>) {
    const source = await db.socialListeningSource.findFirst({ where: { id, organizationId } });
    if (!source) throw new ListeningApiError('Source not found', 404);
    const { type, url, ...data } = input;
    // Revalidate existing URLs when enabling a previously saved source.
    const validatedUrl = url !== undefined || input.isActive === true ? await safeUrl(url ?? source.url) : undefined;
    return db.socialListeningSource.update({ where: { id, organizationId }, data: {
        ...data, ...(type !== undefined && { sourceType: type }),
        ...(validatedUrl !== undefined && { url: validatedUrl }),
    } });
}
