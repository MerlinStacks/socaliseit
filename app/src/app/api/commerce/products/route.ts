/**
 * Product Search API for Tagging
 * Search products from internal catalog for tagging in posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import type { Prisma } from '@/generated/prisma/client';

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
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q') || '';
        const platform = searchParams.get('platform');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

        // Get the workspace's product catalog
        const catalog = await db.productCatalog.findUnique({
            where: { organizationId },
        });

        if (!catalog) {
            return NextResponse.json({
                products: [],
                message: 'No products imported yet. Connect a Meta catalog and import its products in Shopping & Commerce settings.',
            });
        }

        // Build the where clause
        const whereClause: Prisma.ProductWhereInput = {
            catalogId: catalog.id,
            isActive: true,
        };

        // Add search filter
        if (query) {
            whereClause.OR = [
                { name: { contains: query, mode: 'insensitive' as const } },
                { description: { contains: query, mode: 'insensitive' as const } },
            ];
        }

        // Add platform filter - only show products that have a platform-specific ID
        if (platform) {
            const platformKey = `${platform.toLowerCase()}ProductId`;
            if (['instagram', 'facebook', 'pinterest', 'tiktok', 'youtube'].includes(platform.toLowerCase())) {
                whereClause.NOT = { [platformKey]: null };
            }
            if (['instagram', 'facebook'].includes(platform.toLowerCase())) {
                const shop = await db.shopConnection.findUnique({ where: {
                    organizationId_platform: { organizationId, platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' },
                } });
                if (!shop?.isActive) return NextResponse.json({ products: [] });
                // Do not offer stale Meta imports after switching catalogs. Keep
                // existing non-Meta store products with explicit platform mappings.
                whereClause.AND = [{ OR: [
                    { externalId: { startsWith: `meta:${shop.catalogId}:` } },
                    { NOT: { externalId: { startsWith: 'meta:' } } },
                ] }];
            }
        }

        const products = await db.product.findMany({
            where: whereClause,
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
        createRouteLogger('API', '/api/commerce/products').error({ err: error }, 'Failed to search products');
        return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }
}
