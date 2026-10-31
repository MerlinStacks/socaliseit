import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { UploadError } from '@/lib/media/receive-upload';
import { MAX_OTHER_UPLOAD_SIZE, MAX_VIDEO_UPLOAD_SIZE } from '@/lib/media/upload-limits';
import type { PublishingPrincipal } from './auth';

export const MAX_MCP_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_MCP_BASE64_LENGTH = Math.ceil(MAX_MCP_FILE_BYTES / 3) * 4;
export const MAX_MCP_REQUEST_BYTES = MAX_MCP_BASE64_LENGTH + 64 * 1024;
export const MCP_UPLOAD_PATH = '/api/mcp/media';
const mimeExtensions: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'],
    'image/heic': ['heic'], 'image/heif': ['heif'], 'video/mp4': ['mp4'], 'video/quicktime': ['mov'],
    'audio/mpeg': ['mp3'], 'audio/wav': ['wav'], 'audio/aac': ['aac'], 'audio/x-m4a': ['m4a'], 'audio/mp4': ['m4a'],
};
export const uploadInput = z.strictObject({
    filename: z.string().min(1).max(255),
    mimeType: z.enum(Object.keys(mimeExtensions) as [string, ...string[]]),
    contentBase64: z.string().min(4).max(MAX_MCP_BASE64_LENGTH)
        .describe('Canonical base64 file bytes, without a data: prefix. Maximum decoded size 8 MiB; use get_media_upload_config for larger files.'),
    folderId: z.string().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(100).refine(tag => !tag.includes(','), 'Tags cannot contain commas')).max(50).default([]),
});

export function validateMcpFilename(filename: string, mimeType: string) {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    if (filename.length > 255 || /[/\\\x00-\x1f\x7f]/.test(filename) || !mimeExtensions[mimeType]?.includes(extension)) {
        throw new UploadError('Use a plain media filename with an extension matching its supported MIME type.');
    }
}

export function decodeUpload(input: z.infer<typeof uploadInput>) {
    validateMcpFilename(input.filename, input.mimeType);
    const encoded = input.contentBase64;
    if (encoded.length > MAX_MCP_BASE64_LENGTH) throw new UploadError('Inline upload exceeds 8 MiB. Use the streaming upload endpoint.', 413);
    if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) throw new UploadError('Invalid base64 file content');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.toString('base64') !== encoded) throw new UploadError('Invalid base64 file content');
    if (bytes.length > MAX_MCP_FILE_BYTES) throw new UploadError('Inline upload exceeds 8 MiB. Use the streaming upload endpoint.', 413);
    return bytes;
}

/** Shared per-key, fail-closed quota for inline and multipart uploads. */
export async function checkUploadRate(principal: PublishingPrincipal) {
    return checkRateLimit(principal.keyId, { max: 20, windowSeconds: 60, prefix: 'ratelimit:auth:mcp-upload' });
}

export async function storeMcpUpload(principal: PublishingPrincipal, request: Request) {
    if (!principal.canUpload) return Response.json({ error: 'Media upload permission required' }, { status: 403 });
    const rate = await checkUploadRate(principal);
    if (!rate.allowed) return Response.json({ error: 'Upload rate limit exceeded or limiter unavailable' }, { status: 429, headers: { 'Retry-After': '60' } });
    const { uploadMedia } = await import('@/lib/media/upload-service');
    const response = await uploadMedia(request, principal.organizationId, validateMcpFilename);
    if (!response.ok) {
        // Upload validation messages are safe, but never expose internal database/storage errors.
        if (response.status >= 500) return Response.json({ error: 'Upload failed. It may have been saved; check the media library before uploading again.' }, { status: 500 });
        return response;
    }
    const media = await response.clone().json() as { id: string; filename: string };
    try {
        await db.activity.create({ data: { organizationId: principal.organizationId, userId: principal.userId,
            userName: principal.userName, action: 'uploaded', resourceType: 'media', resourceId: media.id,
            resourceName: media.filename, details: `MCP key ${principal.keyId}` } });
    } catch (error) { logger.error({ err: error, mediaId: media.id, keyId: principal.keyId }, 'MCP upload audit failed'); }
    return response;
}

export async function uploadInline(principal: PublishingPrincipal, raw: unknown) {
    if (!principal.canUpload) return { error: 'Media upload permission required', status: 403 };
    const input = uploadInput.parse(raw);
    const bytes = decodeUpload(input);
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(bytes)], { type: input.mimeType }), input.filename);
    if (input.folderId) form.set('folderId', input.folderId);
    if (input.tags.length) form.set('tags', input.tags.join(','));
    // Internal Request only: no HTTP loopback, remote fetching, or server-local path access.
    const response = await storeMcpUpload(principal, new Request('http://mcp.internal/upload', { method: 'POST', body: form }));
    return { status: response.status, ...await response.json() };
}

export function mediaUploadConfig() {
    return { uploadPath: MCP_UPLOAD_PATH, method: 'POST', contentType: 'multipart/form-data',
        authentication: 'Send the same Authorization: Bearer API key as your MCP connection. Never put it in the URL.',
        fileField: 'file', optionalFields: ['folderId', 'tags'],
        maxVideoBytes: MAX_VIDEO_UPLOAD_SIZE, maxOtherBytes: MAX_OTHER_UPLOAD_SIZE,
        maxInlineBytes: MAX_MCP_FILE_BYTES, supportedMimeTypes: Object.keys(mimeExtensions),
        message: 'Upload one file to this path on the same origin as your configured MCP URL. Do not set the multipart Content-Type manually; let the HTTP client supply its boundary. Use the returned id in publish_now.mediaIds. Uploads do not publish posts.',
    };
}
