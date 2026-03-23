/**
 * Product Catalog Sync Service
 * Sync products to social platform catalogs for shopping features
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
    organizationId: string,
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
            where: { organizationId_platform: { organizationId, platform } },
            data: { syncStatus: 'SYNCING' },
        });

        // Get workspace's product catalog
        const catalog = await db.productCatalog.findUnique({
            where: { organizationId },
            include: {
                products: {
                    where: { isActive: true },
                },
            },
        });

        if (!catalog) {
            result.errors.push('No product catalog found');
            await updateSyncStatus(organizationId, platform, 'FAILED', 'No product catalog found');
            return result;
        }

        // Why: Process products in batches of 3 for parallelism,
        // same pattern as engagement sync and posts sync.
        const BATCH_SIZE = 3;
        for (let i = 0; i < catalog.products.length; i += BATCH_SIZE) {
            const batch = catalog.products.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
                batch.map(async (product) => {
                    const platformProductId = await syncProductToPlatform(organizationId, product, platform);
                    return { product, platformProductId };
                })
            );

            for (const [idx, settled] of batchResults.entries()) {
                if (settled.status === 'fulfilled' && settled.value.platformProductId) {
                    await updateProductPlatformId(settled.value.product.id, platform, settled.value.platformProductId);
                    result.synced++;
                } else if (settled.status === 'rejected') {
                    result.failed++;
                    result.errors.push(`Failed to sync "${batch[idx].name}": ${settled.reason}`);
                }
            }
        }

        // Update sync status
        const finalStatus: ShopSyncStatus = result.failed === 0 ? 'SYNCED' : 'FAILED';
        await updateSyncStatus(
            organizationId,
            platform,
            finalStatus,
            result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null
        );

        result.success = result.failed === 0;
        return result;
    } catch (error) {
        result.errors.push(`Sync failed: ${error}`);
        await updateSyncStatus(organizationId, platform, 'FAILED', `${error}`);
        return result;
    }
}

/**
 * Sync a single product to a platform's catalog
 * Returns the platform-specific product ID
 */
async function syncProductToPlatform(
    organizationId: string,
    product: Product,
    platform: Platform
): Promise<string | null> {
    switch (platform) {
        case 'INSTAGRAM':
        case 'FACEBOOK': {
            const connection = await getMetaShopConnection(organizationId, platform);
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
            const connection = await getPinterestShopConnection(organizationId);
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
            const connection = await getTikTokShopConnection(organizationId);
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
            throw new Error('YouTube Shopping (Google Merchant Center) is not supported');

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
    organizationId: string,
    platform: Platform,
    status: ShopSyncStatus,
    error: string | null
): Promise<void> {
    await db.shopConnection.update({
        where: { organizationId_platform: { organizationId, platform } },
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
export async function syncAllCatalogs(organizationId: string): Promise<Record<string, CatalogSyncResult>> {
    const results: Record<string, CatalogSyncResult> = {};

    const shops = await db.shopConnection.findMany({
        where: { organizationId, isActive: true },
    });

    for (const shop of shops) {
        results[shop.platform] = await syncCatalogToPlatform(organizationId, shop.platform);
    }

    return results;
}
