import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { generatePublishingKey, publishingMember } from '@/lib/mcp/auth';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const input = z.strictObject({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.enum(['read', 'publish', 'upload', 'manage_posts'])).min(1).max(4).default(['read', 'publish']),
    expiresInDays: z.number().int().min(1).max(365).default(90),
});

async function manager() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) return null;
    const member = await publishingMember(session.user.currentOrganizationId, session.user.id);
    return member && ['OWNER', 'ADMIN'].includes(member.role) ? member : null;
}

export async function GET(request: Request) {
    const member = await manager();
    if (!member) return json({ error: 'Workspace owner or admin required' }, 403);
    const cursor = z.string().min(1).max(100).optional().safeParse(
        new URL(request.url).searchParams.get('cursor') ?? undefined,
    );
    if (!cursor.success) return json({ error: 'Invalid pagination cursor' }, 400);
    const keys = await db.publishingApiKey.findMany({
        where: { organizationId: member.organizationId },
        select: { id: true, name: true, keyPrefix: true, scopes: true, createdAt: true, expiresAt: true, revokedAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 101,
        ...(cursor.data ? { cursor: { id: cursor.data }, skip: 1 } : {}),
    });
    const page = keys.slice(0, 100);
    return json({ keys: page, nextCursor: keys.length > 100 ? page[page.length - 1].id : null });
}

export async function POST(request: Request) {
    if (!sameOrigin(request)) return json({ error: 'Origin not allowed' }, 403);
    const member = await manager();
    if (!member) return json({ error: 'Workspace owner or admin required' }, 403);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Invalid key settings' }, 400);
    const { key, keyHash, keyPrefix } = generatePublishingKey();
    const record = await db.publishingApiKey.create({ data: {
        organizationId: member.organizationId, userId: member.userId,
        name: parsed.data.name, scopes: parsed.data.scopes, keyHash, keyPrefix,
        expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 86_400_000),
    } });
    await db.activity.create({ data: { organizationId: member.organizationId, userId: member.userId,
        userName: member.user.name || 'Admin', action: 'created', resourceType: 'publishing_api_key',
        resourceId: record.id, resourceName: record.name } });
    return json({ id: record.id, key, expiresAt: record.expiresAt }, 201);
}

export async function DELETE(request: Request) {
    if (!sameOrigin(request)) return json({ error: 'Origin not allowed' }, 403);
    const member = await manager();
    if (!member) return json({ error: 'Workspace owner or admin required' }, 403);
    const parsed = z.strictObject({ id: z.string().min(1).max(100) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Key id required' }, 400);
    const result = await db.publishingApiKey.updateMany({
        where: { id: parsed.data.id, organizationId: member.organizationId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    if (!result.count) return json({ error: 'Active key not found' }, 404);
    await db.activity.create({ data: { organizationId: member.organizationId, userId: member.userId,
        userName: member.user.name || 'Admin', action: 'revoked', resourceType: 'publishing_api_key',
        resourceId: parsed.data.id, resourceName: 'Publishing API key' } });
    return json({ success: true });
}

function sameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    return !origin || origin === new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || request.url).origin;
}
