/**
 * TikTok Shop API Client
 * Handles product catalog sync and product links
 * 
 * API Reference: developers.tiktok.com/doc/tiktok-shop-api
 * 
 * Note: TikTok only supports product links, not visual product tags
 */

import { db } from '@/lib/db';
import type { Product, ShopConnection } from '@prisma/client';

const TIKTOK_API = 'https://open-api.tiktok.com';

export interface TikTokProduct {
    product_id: string;
    title: string;
    price: { currency: string; sale_price: number };
    main_images: Array<{ uri: string }>;
}

/**
 * Get products from TikTok Shop
 */
export async function getTikTokShopProducts(
    shopId: string,
    accessToken: string,
    query?: string
): Promise<TikTokProduct[]> {
    try {
        const response = await fetch(`${TIKTOK_API}/product/202309/products/search`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shop_id: shopId,
                page_size: 50,
                ...(query ? { search_keyword: query } : {}),
            }),
        });

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.message || 'Failed to fetch TikTok products');
        }

        return data.data?.products || [];
    } catch (error) {
        console.error('Failed to fetch TikTok Shop products:', error);
        throw error;
    }
}

/**
 * Sync a product to TikTok Shop
 */
export async function syncProductToTikTokShop(
    shopId: string,
    accessToken: string,
    product: Product
): Promise<string> {
    try {
        const productData = {
            title: product.name,
            description: product.description || product.name,
            category_id: '0', // Would need proper category mapping
            brand_id: '',
            main_images: product.imageUrl ? [{ uri: product.imageUrl }] : [],
            skus: [{
                seller_sku: product.externalId,
                price: {
                    currency: product.currency,
                    sale_price: product.price * 100, // TikTok uses cents
                },
                inventory: [{ quantity: 100 }],
            }],
        };

        const response = await fetch(`${TIKTOK_API}/product/202309/products`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shop_id: shopId,
                ...productData,
            }),
        });

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.message || 'Failed to sync product to TikTok');
        }

        return data.data?.product_id || product.externalId;
    } catch (error) {
        console.error('Failed to sync product to TikTok Shop:', error);
        throw error;
    }
}

/**
 * Create TikTok video with product link
 * Note: TikTok uses the Content Posting API, not traditional product tags
 */
export async function createTikTokVideoWithProduct(
    accessToken: string,
    videoUrl: string,
    caption: string,
    productId: string
): Promise<{ publish_id: string }> {
    try {
        // TikTok requires direct upload, not URL-based
        // This is a simplified example - real implementation needs video upload flow
        const response = await fetch(`${TIKTOK_API}/share/video/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                post_info: {
                    title: caption,
                    privacy_level: 'PUBLIC_TO_EVERYONE',
                    duet_disabled: false,
                    stitch_disabled: false,
                    video_cover_timestamp_ms: 1000,
                },
                source_info: {
                    source: 'FILE_UPLOAD',
                    video_url: videoUrl,
                },
                // Product link - TikTok Shop integration
                product_link: {
                    product_id: productId,
                },
            }),
        });

        const data = await response.json();

        if (data.error?.code) {
            throw new Error(data.error.message || 'Failed to create TikTok video');
        }

        return { publish_id: data.data?.publish_id };
    } catch (error) {
        console.error('Failed to create TikTok video with product:', error);
        throw error;
    }
}

/**
 * Get TikTok shop connection with access token
 */
export async function getTikTokShopConnection(
    workspaceId: string
): Promise<{ shop: ShopConnection; accessToken: string } | null> {
    const shop = await db.shopConnection.findUnique({
        where: { workspaceId_platform: { workspaceId, platform: 'TIKTOK' } },
    });

    if (!shop) return null;

    const account = await db.socialAccount.findFirst({
        where: {
            workspaceId,
            platform: 'TIKTOK',
        },
    });

    if (!account) return null;

    return { shop, accessToken: account.accessToken };
}
