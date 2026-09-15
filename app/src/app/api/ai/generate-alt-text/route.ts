/** POST /api/ai/generate-alt-text — objective image descriptions through Seb. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { completeSebWriting } from '@/lib/ai/seb-writing-completion';
import { formatSebWritingContext, loadSebWritingContext } from '@/lib/ai/seb-writing-context';
import { ALT_TEXT_SYSTEM_PROMPT } from '@/lib/ai/alt-text-prompt';
import { sebErrorResponse, SebProviderError } from '@/lib/ai/seb-provider-error';
import { readFile } from 'fs/promises';
import path from 'path';

const log = createRouteLogger('API', '/api/ai/generate-alt-text');
const RequestSchema = z.object({
    mediaId: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    context: z.string().max(10000).optional(),
}).refine(body => body.mediaId || body.imageUrl, 'mediaId or imageUrl is required');

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const organizationId = session.user.currentOrganizationId;
        const rateLimit = await checkRateLimit(`${session.user.id}:ai-alt-text`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) },
            );
        }
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const { mediaId, imageUrl, context } = RequestSchema.parse(body);

        let resolvedUrl = imageUrl;
        if (mediaId) {
            const media = await db.media.findFirst({ where: { id: mediaId, organizationId } });
            if (!media) {
                return NextResponse.json({ success: false, error: 'Media not found' }, { status: 404 });
            }
            resolvedUrl = media.url;
        }

        const visionUrl = await resolveVisionUrl(resolvedUrl!);
        const business = await loadSebWritingContext(organizationId);
        const content = await completeSebWriting([
            { role: 'system', content: ALT_TEXT_SYSTEM_PROMPT },
            { role: 'user', content: [
                { type: 'image_url', image_url: { url: visionUrl } },
                { type: 'text', text: `Generate alt text for this image.\nBusiness reference:\n${formatSebWritingContext(business)}\nPost reference: ${JSON.stringify(context || '')}` },
            ] },
        ], 200);

        let altText = content.replace(/^["']|["']$/g, '').trim();
        // Reject structured/explanatory output rather than saving it as a description.
        if (!altText || /^[\[{`]/.test(altText) || /^(?:alt text|description)\s*:/i.test(altText)) {
            throw new SebProviderError('INVALID_OUTPUT');
        }
        if (altText.length > 125) altText = altText.substring(0, 122) + '...';

        if (mediaId) {
            try {
                await db.media.update({ where: { id: mediaId, organizationId }, data: { altText } });
            } catch {
                log.warn({ mediaId }, 'Failed to save alt text to media record');
            }
        }
        return NextResponse.json({ success: true, data: { altText } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        log.error({ err: error }, 'Alt text generation failed');
        return NextResponse.json({ success: false, error: 'Failed to generate alt text' }, { status: 500 });
    }
}

/** Local uploads are embedded; remote images remain actual vision inputs, never text-only guesses. */
async function resolveVisionUrl(url: string): Promise<string> {
    // Uploaded media may be stored as an absolute URL on this application's origin.
    const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL;
    if (appUrl && /^https?:\/\//i.test(url)) {
        const absolute = new URL(url);
        if (absolute.origin === new URL(appUrl).origin && absolute.pathname.startsWith('/uploads/')) {
            url = absolute.pathname;
        }
    }
    if (url.startsWith('/uploads/')) {
        const uploads = path.resolve(process.cwd(), 'public', 'uploads');
        const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
        const filePath = path.resolve(uploads, pathname.slice('/uploads/'.length));
        if (!filePath.startsWith(uploads + path.sep)) throw new Error('Invalid image path');
        const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.webp': 'image/webp', '.gif': 'image/gif',
        };
        const mimeType = mimeMap[path.extname(filePath).toLowerCase()];
        if (!mimeType) throw new Error('Unsupported image type');
        const buffer = await readFile(filePath);
        if (!buffer.length) throw new Error('Empty image');
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    const remote = new URL(url);
    if (!['https:', 'http:'].includes(remote.protocol)) throw new Error('Unsupported image URL');
    return remote.href;
}
