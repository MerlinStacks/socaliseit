/**
 * Commerce Catalog Sync API
 * Connect Platform Shops and Sync Products
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const connectShopSchema = z.object({
    platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'PINTEREST', 'TIKTOK', 'YOUTUBE']),
    catalogId: z.string().min(1),
    name: z.string().min(1),
});

/**
 * GET /api/commerce/shops
 * List connected platform shops for the workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;

        const shops = await db.shopConnection.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ shops });
    } catch (error) {
        console.error('Failed to fetch shop connections:', error);
        return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
    }
}

/**
 * POST /api/commerce/shops
 * Connect a new platform shop
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;

        const body = await request.json();
        const parsed = connectShopSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const { platform, catalogId, name } = parsed.data;

        // Upsert the shop connection
        const shop = await db.shopConnection.upsert({
            where: {
                workspaceId_platform: { workspaceId, platform },
            },
            create: {
                workspaceId,
                platform,
                catalogId,
                name,
                syncStatus: 'PENDING',
            },
            update: {
                catalogId,
                name,
                syncStatus: 'PENDING',
                lastSyncError: null,
            },
        });

        return NextResponse.json({ shop });
    } catch (error) {
        console.error('Failed to connect shop:', error);
        return NextResponse.json({ error: 'Failed to connect shop' }, { status: 500 });
    }
}

/**
 * DELETE /api/commerce/shops
 * Disconnect a platform shop
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;

        const { searchParams } = new URL(request.url);
        const platform = searchParams.get('platform');

        if (!platform) {
            return NextResponse.json({ error: 'Platform required' }, { status: 400 });
        }

        await db.shopConnection.delete({
            where: {
                workspaceId_platform: {
                    workspaceId,
                    platform: platform as 'INSTAGRAM' | 'FACEBOOK' | 'PINTEREST' | 'TIKTOK' | 'YOUTUBE',
                },
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to disconnect shop:', error);
        return NextResponse.json({ error: 'Failed to disconnect shop' }, { status: 500 });
    }
}
