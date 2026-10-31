import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticatePublishingKey } from '@/lib/mcp/auth';
import { createPublishingServer } from '@/lib/mcp/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { MAX_MCP_REQUEST_BYTES } from '@/lib/mcp/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(request: Request) {
    // Non-browser clients omit Origin. Browser requests must match the deployment's configured origin.
    const origin = request.headers.get('origin');
    const expectedOrigin = new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || request.url).origin;
    if (origin && origin !== expectedOrigin) return Response.json({ error: 'Origin not allowed' }, { status: 403, headers });
    try {
        const principal = await authenticatePublishingKey(request);
        if (!principal) return Response.json({ error: 'Valid publishing API key required' }, {
            status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer realm="publishing-mcp"' },
        });
        const rate = await checkRateLimit(principal.keyId, { max: 60, windowSeconds: 60, prefix: 'ratelimit:auth:mcp' });
        if (!rate.allowed) return Response.json({ error: 'Rate limit exceeded or limiter unavailable' }, {
            status: 429, headers: { ...headers, 'Retry-After': '60' },
        });
        // A new stateless server per request prevents identity/session sharing across tenants.
        const server = createPublishingServer(principal);
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined, enableJsonResponse: true,
            maxRequestBodySize: principal.canUpload ? MAX_MCP_REQUEST_BYTES : 128 * 1024,
        });
        try {
            await server.connect(transport);
            const response = await transport.handleRequest(request);
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        } finally {
            await server.close();
        }
    } catch (error) {
        logger.error({ err: error }, 'MCP request failed');
        return Response.json({ error: 'MCP request failed. A publish may already have started; reuse the same requestId.' }, { status: 500, headers });
    }
}

// No persistent SSE sessions, scheduling, or draft endpoints.
export async function GET() {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
}
export const DELETE = GET;
