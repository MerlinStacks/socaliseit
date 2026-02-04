/**
 * Product Tagging Types and Utilities
 * Shared types and helper functions for product tagging.
 */

import { type Platform, PLATFORM_SPECS } from '@/lib/platform-config';

/**
 * Core Product type from the database
 */
export interface Product {
    id: string;
    externalId: string;
    name: string;
    description?: string | null;
    price: number;
    currency: string;
    imageUrl?: string | null;
    productUrl?: string | null;
    instagramProductId?: string | null;
    facebookProductId?: string | null;
    pinterestProductId?: string | null;
    tiktokProductId?: string | null;
    youtubeProductId?: string | null;
}

/**
 * Product tag attached to media
 */
export interface ProductTag {
    id: string;
    product: Product;
    platformProductId: string;
    mediaIndex: number;
    positionX?: number;
    positionY?: number;
}

/**
 * Get platform product ID from a product
 */
export function getPlatformProductId(product: Product, platform: Platform): string | null {
    switch (platform) {
        case 'instagram':
            return product.instagramProductId ?? null;
        case 'facebook':
            return product.facebookProductId ?? null;
        case 'pinterest':
            return product.pinterestProductId ?? null;
        case 'tiktok':
            return product.tiktokProductId ?? null;
        case 'youtube':
            return product.youtubeProductId ?? null;
        default:
            return null;
    }
}

/**
 * Get max product tags allowed for a platform
 */
export function getMaxTags(platform: Platform): number {
    switch (platform) {
        case 'instagram':
            return 5;  // Per media item
        case 'facebook':
            return 5;  // Per media item
        case 'pinterest':
            return 6;  // Per pin
        case 'tiktok':
            return 1;  // Product link only
        case 'youtube':
            return 20; // Product shelf
        default:
            return 5;
    }
}

/**
 * Check if platform supports visual positioning
 */
export function supportsVisualTagging(platform: Platform): boolean {
    return platform === 'instagram' || platform === 'facebook';
}
