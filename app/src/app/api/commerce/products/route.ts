/**
 * Product Search API for Tagging
 * Search products from internal catalog for tagging in posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/commerce/products
 * Search products from the workspace catalog for tagging
 * Query params:
 *   - q: search query (optional)
 *   - platform: filter products with platform IDs (optional)
 *   - limit: max results (default 20)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const platform = searchParams.get('platform');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

        // Get the workspace's product catalog
        const catalog = await db.productCatalog.findUnique({
            where: { workspaceId },
        });

        if (!catalog) {
            return NextResponse.json({
                products: [],
                message: 'No product catalog connected. Connect Shopify or WooCommerce in Settings.',
            });
        }

        // Build platform filter based on which platform product ID should exist
        type PlatformFilter = {
            instagramProductId?: { not: null };
            facebookProductId?: { not: null };
            pinterestProductId?: { not: null };
            tiktokProductId?: { not: null };
            youtubeProductId?: { not: null };
        };

        let platformFilter: PlatformFilter = {};
        if (platform) {
            switch (platform.toLowerCase()) {
                case 'instagram':
                    platformFilter = { instagramProductId: { not: null } };
                    break;
                case 'facebook':
                    platformFilter = { facebookProductId: { not: null } };
                    break;
                case 'pinterest':
                    platformFilter = { pinterestProductId: { not: null } };
                    break;
                case 'tiktok':
                    platformFilter = { tiktokProductId: { not: null } };
                    break;
                case 'youtube':
                    platformFilter = { youtubeProductId: { not: null } };
                    break;
            }
        }

        const products = await db.product.findMany({
            where: {
                catalogId: catalog.id,
                isActive: true,
                ...(query ? {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                    ],
                } : {}),
                ...platformFilter,
            },
            take: limit,
            orderBy: { name: 'asc' },
            select: {
                id: true,
                externalId: true,
                name: true,
                description: true,
                price: true,
                currency: true,
                imageUrl: true,
                productUrl: true,
                instagramProductId: true,
                facebookProductId: true,
                pinterestProductId: true,
                tiktokProductId: true,
                youtubeProductId: true,
            },
        });

        return NextResponse.json({ products });
    } catch (error) {
        console.error('Failed to search products:', error);
        return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }
}
