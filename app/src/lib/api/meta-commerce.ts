/**
 * Meta Commerce API Client
 * Handles product catalog sync and product tagging for Instagram/Facebook
 * 
 * API Reference:
 * - Instagram Content Publishing: developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing
 * - Product Tags: developers.facebook.com/docs/instagram-platform/shopping/product-tagging
 * 
 * Requirements:
 * - Instagram Business account with approved Shop
 * - Permissions: instagram_basic, instagram_shopping_tag_products, catalog_management
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ShopConnection, Product } from '@/generated/prisma/client';
import { GRAPH_API_URL } from '@/lib/platform-api/constants';
import { metaFetch, metaJson } from '@/lib/platform-api/meta-fetch';

const META_GRAPH_API = GRAPH_API_URL;

export interface MetaProduct {
    retailer_id: string;
    name: string;
    price: number;
    currency: string;
    image_url?: string;
    url?: string;
}

export interface ProductTagPosition {
    product_id: string;
    x?: number;  // 0-1 from left
    y?: number;  // 0-1 from top
}

export interface MetaPublishPayload {
    ig_user_id: string;
    access_token: string;
    image_url?: string;
    video_url?: string;
    caption: string;
    product_tags?: ProductTagPosition[];
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
}

export interface MetaCatalog {
    id: string;
    name: string;
}

/**
 * Discover product catalogs, not advertising-only catalogs (e.g. offer_items).
 * Instagram's available_catalogs has a different schema from ProductCatalog
 * and is the authority for which catalogs the account can use for tagging.
 */
export async function fetchMetaCatalogs(
    accessToken: string,
    account?: { platform: 'INSTAGRAM' | 'FACEBOOK'; platformId: string },
): Promise<MetaCatalog[]> {
    const catalogs = new Map<string, MetaCatalog>();
    let failed = false;

    // Each edge is independent: a Page token cannot enumerate /me/businesses,
    // but can still discover the linked Instagram account's available catalogs.
    async function readEdge<T>(edge: string, fields = 'id,name'): Promise<T[]> {
        const nodes: T[] = [];
        let after: string | undefined;
        const cursors = new Set<string>();
        try {
            do {
                const url = new URL(`${META_GRAPH_API}/${edge}`);
                url.searchParams.set('fields', fields);
                url.searchParams.set('limit', '100');
                if (after) url.searchParams.set('after', after);
                const data = await metaJson<{
                    data?: T[];
                    error?: { code?: number };
                    paging?: { next?: string; cursors?: { after?: string } };
                }>(accessToken, url.toString());
                if (data.error || !Array.isArray(data.data)) {
                    failed = true;
                    logger.warn({ edge, code: data.error?.code }, 'Meta catalog discovery edge unavailable');
                    break;
                }
                nodes.push(...data.data);
                after = data.paging?.next ? data.paging.cursors?.after : undefined;
                if (after && cursors.has(after)) break;
                if (after) cursors.add(after);
            } while (after);
        } catch {
            // Do not log request URLs or tokens from upstream exception messages.
            failed = true;
            logger.warn({ edge }, 'Meta catalog discovery request failed');
        }
        return nodes;
    }

    if (account?.platform === 'INSTAGRAM') {
        const available = await readEdge<{
            catalog_id: string;
            catalog_name: string;
        }>(`${account.platformId}/available_catalogs`, 'catalog_id,catalog_name');
        for (const catalog of available) {
            if (!catalog.catalog_id || !catalog.catalog_name) {
                failed = true;
                continue;
            }
            catalogs.set(catalog.catalog_id, { id: catalog.catalog_id, name: catalog.catalog_name });
        }
    } else {
        async function addCatalogs(edge: string) {
            for (const catalog of await readEdge<MetaCatalog & { vertical?: string }>(edge, 'id,name,vertical')) {
                if (!catalog.vertical || !catalog.id || !catalog.name) {
                    failed = true;
                    continue;
                }
                // Do not infer suitability from the name, count, or mere API access.
                // Promo codes, vehicles, hotels, etc. are not retail product catalogs.
                if (catalog.vertical.toLowerCase() === 'commerce') {
                    catalogs.set(catalog.id, { id: catalog.id, name: catalog.name });
                }
            }
        }

        await Promise.all([
            addCatalogs('me/product_catalogs'),
            (async () => {
                const pages = await readEdge<MetaCatalog>('me/accounts');
                await Promise.all(pages.map(page => addCatalogs(`${page.id}/product_catalogs`)));
            })(),
            (async () => {
                const businesses = await readEdge<MetaCatalog>('me/businesses');
                await Promise.all(businesses.flatMap(business => [
                    addCatalogs(`${business.id}/owned_product_catalogs`),
                    addCatalogs(`${business.id}/client_product_catalogs`),
                ]));
            })(),
        ]);
    }

    if (!catalogs.size && failed) {
        throw new Error('Meta catalog access could not be verified. Reconnect your Facebook and Instagram accounts with catalog and business permissions, and ensure the connecting user has access to the catalog in Meta Commerce Manager.');
    }
    return Array.from(catalogs.values());
}


/**
 * Get products from a Meta Commerce catalog
 */
export async function getMetaCatalogProducts(
    catalogId: string,
    accessToken: string,
    query?: string
): Promise<MetaProduct[]> {
    try {
        let url = `${META_GRAPH_API}/${catalogId}/products?fields=id,retailer_id,name,price,currency,image_url,url`;

        if (query) {
            url += `&filter={"name":{"contains":"${query}"}}`;
        }

        const data = await metaJson(accessToken, url);

        if (data.error) {
            logger.error({ error: data.error }, 'Meta API error');
            throw new Error(data.error.message);
        }

        return (data.data || []).map((p: Record<string, unknown>) => ({
            retailer_id: p.retailer_id as string,
            name: p.name as string,
            price: typeof p.price === 'string' ? parseFloat(p.price) : (p.price as number),
            currency: p.currency as string,
            image_url: p.image_url as string | undefined,
            url: p.url as string | undefined,
        }));
    } catch (error) {
        logger.error({ err: error }, 'Failed to fetch Meta catalog products');
        throw error;
    }
}

/**
 * Sync a product to Meta Commerce catalog
 * Creates or updates the product in the catalog
 */
export async function syncProductToMetaCatalog(
    catalogId: string,
    accessToken: string,
    product: Product
): Promise<string> {
    try {
        // Check if product exists
        const existingUrl = `${META_GRAPH_API}/${catalogId}/products?filter=${encodeURIComponent(JSON.stringify({ retailer_id: { eq: product.externalId } }))}`;
        const existingData = await metaJson(accessToken, existingUrl);

        const productData = {
            retailer_id: product.externalId,
            name: product.name,
            description: product.description || '',
            price: `${product.price} ${product.currency}`,
            url: product.productUrl || '',
            image_url: product.imageUrl || '',
            availability: 'in stock',
        };

        if (existingData.data && existingData.data.length > 0) {
            // Update existing product
            const productId = existingData.data[0].id;
            const updateResponse = await metaFetch(accessToken, `${META_GRAPH_API}/${productId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData),
            });

            if (!updateResponse.ok) {
                throw new Error('Failed to update product in Meta catalog');
            }

            return productId;
        } else {
            // Create new product
            const createResponse = await metaFetch(accessToken, `${META_GRAPH_API}/${catalogId}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData),
            });

            const createData = await createResponse.json();
            if (createData.error) {
                throw new Error(createData.error.message);
            }

            return createData.id;
        }
    } catch (error) {
        logger.error({ err: error }, 'Failed to sync product to Meta catalog');
        throw error;
    }
}

/**
 * Create Instagram media container with product tags
 * Step 1 of 2-step publishing process
 */
export async function createInstagramMediaContainer(
    payload: MetaPublishPayload
): Promise<string> {
    const { ig_user_id, access_token, image_url, video_url, caption, product_tags, media_type } = payload;

    const params: Record<string, string> = {
        caption,
    };

    if (media_type === 'IMAGE' && image_url) {
        params.image_url = image_url;
    } else if ((media_type === 'VIDEO' || media_type === 'REELS') && video_url) {
        params.video_url = video_url;
        params.media_type = media_type;
    }

    // Add product tags if provided
    if (product_tags && product_tags.length > 0) {
        const tagData = product_tags.map(tag => ({
            product_id: tag.product_id,
            ...(tag.x !== undefined && tag.y !== undefined ? { x: tag.x, y: tag.y } : {}),
        }));
        params.user_tags = JSON.stringify(tagData);
    }

    const response = await metaFetch(access_token, `${META_GRAPH_API}/${ig_user_id}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }

    return data.id; // Container ID
}

/**
 * Publish Instagram media container
 * Step 2 of 2-step publishing process
 */
export async function publishInstagramMedia(
    igUserId: string,
    containerId: string,
    accessToken: string
): Promise<{ id: string; permalink?: string }> {
    const response = await metaFetch(accessToken, `${META_GRAPH_API}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ creation_id: containerId }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }

    // Fetch permalink
    const mediaData = await metaJson<{ permalink?: string }>(accessToken, `${META_GRAPH_API}/${data.id}?fields=permalink`);

    return {
        id: data.id,
        permalink: mediaData.permalink,
    };
}

/**
 * Add product tags to an existing Instagram post
 */
export async function addProductTagsToMedia(
    mediaId: string,
    productTags: ProductTagPosition[],
    accessToken: string
): Promise<boolean> {
    const tagData = productTags.map(tag => ({
        product_id: tag.product_id,
        ...(tag.x !== undefined && tag.y !== undefined ? { x: tag.x, y: tag.y } : {}),
    }));

    const response = await metaFetch(accessToken, `${META_GRAPH_API}/${mediaId}/product_tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_tags: tagData }),
    });

    const data = await response.json();
    return data.success === true;
}

/**
 * Get shop connection with access token for Meta platforms
 */
export async function getMetaShopConnection(
    organizationId: string,
    platform: 'INSTAGRAM' | 'FACEBOOK'
): Promise<{ shop: ShopConnection; accessToken: string } | null> {
    const shop = await db.shopConnection.findUnique({
        where: { organizationId_platform: { organizationId, platform } },
    });

    if (!shop) return null;

    // Get access token from social account
    const account = await db.socialAccount.findFirst({
        where: {
            organizationId,
            platform: platform,
        },
    });

    if (!account) return null;

    return { shop, accessToken: account.accessToken };
}
