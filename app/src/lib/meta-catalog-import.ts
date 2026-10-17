/** Read-only Meta catalog import. Never creates or modifies products on Meta. */
import { db } from '@/lib/db';
import { decryptToken } from '@/lib/token-encryption';
import { getMetaCatalogProducts, type MetaProduct } from '@/lib/api/meta-commerce';
import type { CatalogSyncResult } from '@/lib/catalog-sync';

export async function importMetaCatalog(
    organizationId: string,
    platform: 'INSTAGRAM' | 'FACEBOOK',
): Promise<CatalogSyncResult> {
    const result: CatalogSyncResult = { success: false, synced: 0, failed: 0, errors: [] };
    const shop = await db.shopConnection.findUnique({
        where: { organizationId_platform: { organizationId, platform } },
    });
    if (!shop?.isActive) {
        result.errors.push('No active Meta shop connection found. Connect a catalog first.');
        return result;
    }
    // Only share mappings/status with connections explicitly using this catalog.
    const scope = { organizationId, catalogId: shop.catalogId, isActive: true,
        platform: { in: ['INSTAGRAM', 'FACEBOOK'] as Array<'INSTAGRAM' | 'FACEBOOK'> } };
    try {
        await db.shopConnection.updateMany({ where: scope, data: { syncStatus: 'SYNCING', lastSyncError: null } });
        const accounts = await db.socialAccount.findMany({ where: { organizationId, isActive: true,
            platform: { in: ['INSTAGRAM', 'FACEBOOK'] } }, select: { platform: true, accessToken: true } });
        // Try active workspace tokens directly against the selected catalog ID.
        // Page tokens need not support the user-only /me/accounts or /me/businesses.
        accounts.sort((a, b) => Number(b.platform === platform) - Number(a.platform === platform));
        let products: MetaProduct[] | undefined;
        const tried = new Set<string>();
        for (const account of accounts) {
            const token = decryptToken(account.accessToken);
            if (!token || tried.has(token)) continue;
            tried.add(token);
            try {
                products = await getMetaCatalogProducts(shop.catalogId, token);
                break;
            } catch {
                // Tokens can have different asset access; do not log credentials.
            }
        }
        if (!products) throw new Error('Unable to import the selected Meta catalog. Reconnect Facebook or Instagram with catalog access and check the catalog’s asset permissions in Commerce Manager.');

        // Read every page successfully before changing the local catalog. Keep an
        // existing Shopify/WooCommerce catalog and its products/source untouched.
        const catalog = await db.productCatalog.upsert({
            where: { organizationId }, update: {},
            create: { organizationId, source: 'META', externalId: shop.catalogId },
        });
        const prefix = `meta:${shop.catalogId}:`;
        // Transaction keeps previous mappings intact if any persistence step fails.
        await db.$transaction(async tx => {
            // Upgrade legacy single-platform connections without overwriting a
            // separately configured catalog (or reactivating a disabled shop).
            const siblingPlatform = platform === 'INSTAGRAM' ? 'FACEBOOK' : 'INSTAGRAM';
            await tx.shopConnection.upsert({
                where: { organizationId_platform: { organizationId, platform: siblingPlatform } },
                create: { organizationId, platform: siblingPlatform, catalogId: shop.catalogId, name: shop.name },
                update: {},
            });
            const connections = await tx.shopConnection.findMany({ where: scope });
            const platforms = connections.map(connection => connection.platform);
            const mappings = (id: string | null) => ({
                ...(platforms.includes('INSTAGRAM') ? { instagramProductId: id } : {}),
                ...(platforms.includes('FACEBOOK') ? { facebookProductId: id } : {}),
            });
            await tx.product.updateMany({ where: { catalogId: catalog.id, externalId: { startsWith: prefix } }, data: mappings(null) });
            for (const product of products) {
                const data = {
                    name: product.name, description: product.description ?? null,
                    price: product.price, currency: product.currency,
                    imageUrl: product.image_url ?? null, productUrl: product.url ?? null,
                    isActive: true, syncedAt: new Date(), ...mappings(product.id),
                };
                const externalId = `${prefix}${product.id}`;
                await tx.product.upsert({
                    where: { catalogId_externalId: { catalogId: catalog.id, externalId } },
                    create: { catalogId: catalog.id, externalId, ...data }, update: data,
                });
            }
            await tx.productCatalog.update({ where: { organizationId }, data: { syncedAt: new Date() } });
            await tx.shopConnection.updateMany({ where: scope,
                data: { syncStatus: 'SYNCED', lastSyncAt: new Date(), lastSyncError: null } });
        }, { timeout: 60_000 });
        result.synced = products.length;
        result.success = true;
    } catch {
        // Avoid storing request URLs/credentials from transport or Prisma errors.
        const message = 'Meta product import failed. Check catalog access and reconnect your Meta accounts, then retry. Your existing product mappings were preserved.';
        result.errors.push(message);
        await db.shopConnection.updateMany({ where: scope, data: { syncStatus: 'FAILED', lastSyncError: message } });
    }
    return result;
}
