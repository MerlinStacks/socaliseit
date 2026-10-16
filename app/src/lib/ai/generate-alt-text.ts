/** Shared vision-based alt text generation for the editor and publishing worker. */
import { readFile } from 'fs/promises';
import path from 'path';
import { completeSebWriting } from './seb-writing-completion';
import { formatSebWritingContext, loadSebWritingContext } from './seb-writing-context';
import { ALT_TEXT_SYSTEM_PROMPT } from './alt-text-prompt';
import { SebProviderError } from './seb-provider-error';

export async function generateAltText(imageUrl: string, organizationId: string, context = ''): Promise<string> {
    const visionUrl = await resolveVisionUrl(imageUrl);
    const business = await loadSebWritingContext(organizationId);
    const content = await completeSebWriting([
        { role: 'system', content: ALT_TEXT_SYSTEM_PROMPT },
        { role: 'user', content: [
            { type: 'image_url', image_url: { url: visionUrl } },
            { type: 'text', text: `Generate alt text for this image.\nBusiness reference:\n${formatSebWritingContext(business)}\nPost reference: ${JSON.stringify(context)}` },
        ] },
    ], 200);
    let altText = content.replace(/^["']|["']$/g, '').trim();
    if (!altText || /^[\[{`]/.test(altText) || /^(?:alt text|description)\s*:/i.test(altText)) {
        throw new SebProviderError('INVALID_OUTPUT');
    }
    if (altText.length > 125) altText = altText.substring(0, 122) + '...';
    return altText;
}

/** Embed local uploads so vision works even when the app isn't publicly reachable. */
async function resolveVisionUrl(url: string): Promise<string> {
    const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL;
    if (appUrl && /^https?:\/\//i.test(url)) {
        const absolute = new URL(url);
        if (absolute.origin === new URL(appUrl).origin && /^\/(?:api\/)?uploads\//.test(absolute.pathname)) {
            url = absolute.pathname;
        }
    }
    const prefix = url.startsWith('/api/uploads/') ? '/api/uploads/' : '/uploads/';
    if (url.startsWith(prefix)) {
        const uploads = path.resolve(process.cwd(), 'public', 'uploads');
        const pathname = decodeURIComponent(url.split(/[?#]/)[0]);
        const filePath = path.resolve(uploads, pathname.slice(prefix.length));
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
