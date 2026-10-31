import { authenticatePublishingKey } from '@/lib/mcp/auth';
import { storeMcpUpload } from '@/lib/mcp/uploads';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 1800;
export const fetchCache = 'force-no-store';
const headers = { 'Cache-Control': 'private, no-store' };

/** Binary companion to the MCP tools: stream videos without buffering JSON/base64. */
export async function POST(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || request.url).origin) {
        return Response.json({ error: 'Origin not allowed' }, { status: 403, headers });
    }
    try {
        // This route bypasses proxy buffering, so protect authentication DB lookups here too.
        const rate = await checkRateLimit(getClientIp(request.headers), {
            max: 60, windowSeconds: 60, prefix: 'ratelimit:auth:mcp-upload-ip',
        });
        if (!rate.allowed) return Response.json({ error: 'Rate limit exceeded or limiter unavailable' }, {
            status: 429, headers: { ...headers, 'Retry-After': '60' },
        });
        const principal = await authenticatePublishingKey(request);
        if (!principal) return Response.json({ error: 'Valid API key required' }, {
            status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer realm="publishing-mcp"' },
        });
        const response = await storeMcpUpload(principal, request);
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    } catch (error) {
        logger.error({ err: error }, 'MCP multipart upload failed');
        return Response.json({ error: 'Upload failed. Check the media library before uploading again.' }, { status: 500, headers });
    }
}
