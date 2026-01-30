/**
 * E-commerce Integration Service
 * Shopify and WooCommerce product sync
 */

export type EcommercePlatform = 'shopify' | 'woocommerce';

export interface Product {
    id: string;
    externalId: string;
    platform: EcommercePlatform;
    title: string;
    description: string;
    handle: string;
    price: number;
    compareAtPrice?: number;
    currency: string;
    images: ProductImage[];
    variants: ProductVariant[];
    tags: string[];
    status: 'active' | 'draft' | 'archived';
    syncedAt: Date;
}

export interface ProductImage {
    id: string;
    src: string;
    alt?: string;
    position: number;
}

export interface ProductVariant {
    id: string;
    title: string;
    price: number;
    sku: string;
    inventory: number;
}

export interface EcommerceConnection {
    id: string;
    workspaceId: string;
    platform: EcommercePlatform;
    storeUrl: string;
    accessToken: string;
    isActive: boolean;
    lastSyncAt?: Date;
    productCount: number;
}

/**
 * Shopify API client
 */
export class ShopifyClient {
    private storeUrl: string;
    private accessToken: string;

    constructor(storeUrl: string, accessToken: string) {
        this.storeUrl = storeUrl;
        this.accessToken = accessToken;
    }

    private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `https://${this.storeUrl}/admin/api/2024-01/${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`Shopify API error: ${response.statusText}`);
        }

        return response.json();
    }

    async getProducts(limit: number = 50): Promise<Product[]> {
        // In production, make actual API call
        // Mock data for demo
        return [
            {
                id: 'prod_1',
                externalId: 'shopify_123',
                platform: 'shopify',
                title: 'Summer Dress - Floral Print',
                description: 'Beautiful floral print summer dress perfect for any occasion.',
                handle: 'summer-dress-floral',
                price: 89.99,
                compareAtPrice: 119.99,
                currency: 'USD',
                images: [
                    { id: 'img_1', src: '/products/dress-1.jpg', alt: 'Summer Dress', position: 1 },
                ],
                variants: [
                    { id: 'var_1', title: 'Small', price: 89.99, sku: 'SD-FL-S', inventory: 25 },
                    { id: 'var_2', title: 'Medium', price: 89.99, sku: 'SD-FL-M', inventory: 18 },
                ],
                tags: ['summer', 'dress', 'floral'],
                status: 'active',
                syncedAt: new Date(),
            },
            {
                id: 'prod_2',
                externalId: 'shopify_456',
                platform: 'shopify',
                title: 'Linen Blazer - Beige',
                description: 'Classic linen blazer in a neutral beige tone.',
                handle: 'linen-blazer-beige',
                price: 149.99,
                currency: 'USD',
                images: [
                    { id: 'img_2', src: '/products/blazer-1.jpg', alt: 'Linen Blazer', position: 1 },
                ],
                variants: [
                    { id: 'var_3', title: 'S', price: 149.99, sku: 'LB-BG-S', inventory: 12 },
                ],
                tags: ['blazer', 'linen', 'professional'],
                status: 'active',
                syncedAt: new Date(),
            },
        ];
    }

    async getProduct(productId: string): Promise<Product | null> {
        const products = await this.getProducts();
        return products.find(p => p.id === productId) || null;
    }
}

/**
 * WooCommerce API client
 */
export class WooCommerceClient {
    private storeUrl: string;
    private consumerKey: string;
    private consumerSecret: string;

    constructor(storeUrl: string, consumerKey: string, consumerSecret: string) {
        this.storeUrl = storeUrl;
        this.consumerKey = consumerKey;
        this.consumerSecret = consumerSecret;
    }

    async getProducts(limit: number = 50): Promise<Product[]> {
        // Mock implementation
        return [];
    }
}

/**
 * Sync products from e-commerce platform
 */
export async function syncProducts(
    connection: EcommerceConnection
): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
        let products: Product[] = [];

        if (connection.platform === 'shopify') {
            const client = new ShopifyClient(connection.storeUrl, connection.accessToken);
            products = await client.getProducts();
        }

        // In production, save to database
        synced = products.length;
        console.log(`Synced ${synced} products from ${connection.platform}`);
    } catch (error) {
        errors.push(`Sync failed: ${error}`);
    }

    return { synced, errors };
}

/**
 * Search products for tagging
 */
export async function searchProducts(
    workspaceId: string,
    query: string
): Promise<Product[]> {
    // In production, search database
    const mockProducts = await new ShopifyClient('', '').getProducts();
    return mockProducts.filter(
        p => p.title.toLowerCase().includes(query.toLowerCase()) ||
            p.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
}
