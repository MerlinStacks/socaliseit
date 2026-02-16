/**
 * Pinterest API Client
 * Handles product catalog sync and product pins
 *
 * API Reference: developers.pinterest.com/docs/api/v5
 *
 * Requirements:
 * - Pinterest Business account
 * - Approved catalog
 * - OAuth with catalogs:read and pins:write scopes
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Product, ShopConnection } from '@/generated/prisma/client';

// Re-export the shared paginated board fetcher so existing consumers keep working
export { fetchPinterestBoardsDirect as getPinterestBoards } from '@/lib/api/pinterest-boards';

const PINTEREST_API = 'https://api.pinterest.com/v5';

export interface PinterestProduct {
    item_id: string;
    title: string;
    price: string;
    currency_code: string;
    link: string;
    image_link: string;
    availability: string;
}

export interface PinterestProductTag {
    item_id: string;
}

/**
 * Get products from a Pinterest catalog
 */
export async function getPinterestCatalogProducts(
    catalogId: string,
    accessToken: string,
    query?: string
): Promise<PinterestProduct[]> {
    try {
        const url = `${PINTEREST_API}/catalogs/${catalogId}/items?page_size=50`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch Pinterest products');
        }

        let products = data.items || [];

        // Filter by query if provided
        if (query) {
            const lowerQuery = query.toLowerCase();
            products = products.filter((p: PinterestProduct) =>
                p.title.toLowerCase().includes(lowerQuery)
            );
        }

        return products;
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch Pinterest catalog products');
        throw error;
    }
}

/**
 * Sync a product to Pinterest catalog
 */
export async function syncProductToPinterestCatalog(
    catalogId: string,
    accessToken: string,
    product: Product
): Promise<string> {
    try {
        const productData = {
            item_id: product.externalId,
            title: product.name,
            description: product.description || '',
            price: `${product.price} ${product.currency}`,
            link: product.productUrl || '',
            image_link: product.imageUrl || '',
            availability: 'in_stock',
        };

        // Use batch upsert endpoint
        const response = await fetch(`${PINTEREST_API}/catalogs/items/batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                catalog_id: catalogId,
                operation: 'UPSERT',
                items: [productData],
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to sync product to Pinterest');
        }

        // Return the item_id as the Pinterest product ID
        return product.externalId;
    } catch (error) {
        logger.error({ err: error }, 'Failed to sync product to Pinterest catalog');
        throw error;
    }
}

/**
 * Create a Pinterest Pin with product tags
 */
export async function createPinterestProductPin(
    accessToken: string,
    boardId: string,
    imageUrl: string,
    title: string,
    description: string,
    link: string,
    productTags: PinterestProductTag[]
): Promise<{ id: string; link?: string }> {
    try {
        const pinData: Record<string, unknown> = {
            board_id: boardId,
            media_source: {
                source_type: 'image_url',
                url: imageUrl,
            },
            title,
            description,
            link,
        };

        // Add product tags (up to 6 per pin)
        if (productTags.length > 0) {
            pinData.product_tags = productTags.slice(0, 6).map(tag => ({
                id: tag.item_id,
            }));
        }

        const response = await fetch(`${PINTEREST_API}/pins`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pinData),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to create Pinterest pin');
        }

        return {
            id: data.id,
            link: data.link,
        };
    } catch (error) {
        logger.error({ err: error }, 'Failed to create Pinterest product pin');
        throw error;
    }
}

/**
 * Get Pinterest shop connection with access token
 */
export async function getPinterestShopConnection(
    organizationId: string
): Promise<{ shop: ShopConnection; accessToken: string } | null> {
    const shop = await db.shopConnection.findUnique({
        where: { organizationId_platform: { organizationId, platform: 'PINTEREST' } },
    });

    if (!shop) return null;

    const account = await db.socialAccount.findFirst({
        where: {
            organizationId,
            platform: 'PINTEREST',
        },
    });

    if (!account) return null;

    return { shop, accessToken: account.accessToken };
}

