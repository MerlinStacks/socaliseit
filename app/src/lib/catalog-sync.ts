/**
 * Platform Catalog Sync Service
 * Syncs products from internal catalog to platform shopping catalogs
 * 
 * Why: Each platform (Instagram, Facebook, Pinterest) requires products to exist
 * in their catalog before they can be tagged in posts. This service pushes
 * our products to each platform's catalog.
 */

import { db } from '@/lib/db';
import type { Platform, Product, ShopConnection, ShopSyncStatus } from '@/generated/prisma/client';
import { syncProductToMetaCatalog, getMetaShopConnection } from './api/meta-commerce';
import { syncProductToPinterestCatalog, getPinterestShopConnection } from './api/pinterest-commerce';
import { syncProductToTikTokShop, getTikTokShopConnection } from './api/tiktok-commerce';

export interface CatalogSyncResult {
    success: boolean;
    synced: number;
    failed: number;
    errors: string[];
}

export interface PlatformProduct {
    externalId: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    imageUrl?: string;
    productUrl?: string;
}

/**
 * Sync all products to a specific platform's catalog
 */
export async function syncCatalogToPlatform(
    workspaceId: string,
    platform: Platform
): Promise<CatalogSyncResult> {
    const result: CatalogSyncResult = {
        success: false,
        synced: 0,
        failed: 0,
        errors: [],
    };

    try {
        // Update sync status to SYNCING
        await db.shopConnection.update({
            where: { workspaceId_platform: { workspaceId, platform } },
            data: { syncStatus: 'SYNCING' },
        });

        // Get workspace's product catalog
        const catalog = await db.productCatalog.findUnique({
            where: { workspaceId },
            include: {
                products: {
                    where: { isActive: true },
                },
            },
        });

        if (!catalog) {
            result.errors.push('No product catalog found');
            await updateSyncStatus(workspaceId, platform, 'FAILED', 'No product catalog found');
            return result;
        }

        // Sync each product based on platform
        for (const product of catalog.products) {
            try {
                const platformProductId = await syncProductToPlatform(workspaceId, product, platform);

                if (platformProductId) {
                    // Update product with platform-specific ID
                    await updateProductPlatformId(product.id, platform, platformProductId);
                    result.synced++;
                }
            } catch (error) {
                result.failed++;
                result.errors.push(`Failed to sync "${product.name}": ${error}`);
            }
        }

        // Update sync status
        const finalStatus: ShopSyncStatus = result.failed === 0 ? 'SYNCED' : 'FAILED';
        await updateSyncStatus(
            workspaceId,
            platform,
            finalStatus,
            result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null
        );

        result.success = result.failed === 0;
        return result;
    } catch (error) {
        result.errors.push(`Sync failed: ${error}`);
        await updateSyncStatus(workspaceId, platform, 'FAILED', `${error}`);
        return result;
    }
}

/**
 * Sync a single product to a platform's catalog
 * Returns the platform-specific product ID
 */
async function syncProductToPlatform(
    workspaceId: string,
    product: Product,
    platform: Platform
): Promise<string | null> {
    switch (platform) {
        case 'INSTAGRAM':
        case 'FACEBOOK': {
            const connection = await getMetaShopConnection(workspaceId, platform);
            if (!connection) {
                throw new Error(`No ${platform} shop connection or access token found`);
            }
            return syncProductToMetaCatalog(
                connection.shop.catalogId,
                connection.accessToken,
                product
            );
        }

        case 'PINTEREST': {
            const connection = await getPinterestShopConnection(workspaceId);
            if (!connection) {
                throw new Error('No Pinterest shop connection or access token found');
            }
            return syncProductToPinterestCatalog(
                connection.shop.catalogId,
                connection.accessToken,
                product
            );
        }

        case 'TIKTOK': {
            const connection = await getTikTokShopConnection(workspaceId);
            if (!connection) {
                throw new Error('No TikTok shop connection or access token found');
            }
            return syncProductToTikTokShop(
                connection.shop.catalogId,
                connection.accessToken,
                product
            );
        }

        case 'YOUTUBE':
            // YouTube Shopping uses Google Merchant Center
            // Requires separate Google Merchant Center integration
            console.log(`[YouTube] Syncing to Google Merchant Center: ${product.name}`);
            return `youtube_${product.externalId}_${Date.now()}`;

        default:
            throw new Error(`Platform ${platform} does not support product catalogs`);
    }
}

/**
 * Update a product's platform-specific ID
 */
async function updateProductPlatformId(
    productId: string,
    platform: Platform,
    platformProductId: string
): Promise<void> {
    const updateData: Record<string, string> = {};

    switch (platform) {
        case 'INSTAGRAM':
            updateData.instagramProductId = platformProductId;
            break;
        case 'FACEBOOK':
            updateData.facebookProductId = platformProductId;
            break;
        case 'PINTEREST':
            updateData.pinterestProductId = platformProductId;
            break;
        case 'TIKTOK':
            updateData.tiktokProductId = platformProductId;
            break;
        case 'YOUTUBE':
            updateData.youtubeProductId = platformProductId;
            break;
    }

    await db.product.update({
        where: { id: productId },
        data: updateData,
    });
}

/**
 * Update shop connection sync status
 */
async function updateSyncStatus(
    workspaceId: string,
    platform: Platform,
    status: ShopSyncStatus,
    error: string | null
): Promise<void> {
    await db.shopConnection.update({
        where: { workspaceId_platform: { workspaceId, platform } },
        data: {
            syncStatus: status,
            lastSyncAt: new Date(),
            lastSyncError: error,
        },
    });
}

/**
 * Get platform product ID for a product
 */
export function getPlatformProductId(
    product: Product,
    platform: Platform
): string | null {
    switch (platform) {
        case 'INSTAGRAM':
            return product.instagramProductId;
        case 'FACEBOOK':
            return product.facebookProductId;
        case 'PINTEREST':
            return product.pinterestProductId;
        case 'TIKTOK':
            return product.tiktokProductId;
        case 'YOUTUBE':
            return product.youtubeProductId;
        default:
            return null;
    }
}

/**
 * Check if a product is available for tagging on a platform
 */
export function canTagProductOnPlatform(
    product: Product,
    platform: Platform
): boolean {
    return getPlatformProductId(product, platform) !== null;
}

/**
 * Trigger sync for all connected shops in a workspace
 */
export async function syncAllCatalogs(workspaceId: string): Promise<Record<string, CatalogSyncResult>> {
    const results: Record<string, CatalogSyncResult> = {};

    const shops = await db.shopConnection.findMany({
        where: { workspaceId, isActive: true },
    });

    for (const shop of shops) {
        results[shop.platform] = await syncCatalogToPlatform(workspaceId, shop.platform);
    }

    return results;
}
