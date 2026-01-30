/**
 * Product Tagging Component
 * Tag products in posts for shoppable content on Instagram, Facebook, Pinterest, etc.
 * 
 * Why: Enables users to create shoppable posts by tagging products from their
 * connected e-commerce catalog. Products must be synced to the platform's
 * catalog before they can be tagged.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, X, Package, Tag, Plus, ExternalLink, ShoppingBag, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProductTagOverlay } from './product-tag-overlay';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';
import type { ProductTagPayload } from '@/lib/platforms';
import type { MediaItem } from './platform-editor';

interface Product {
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

export interface ProductTag {
    id: string;
    product: Product;
    platformProductId: string;
    mediaIndex: number;
    positionX?: number;
    positionY?: number;
}

interface ProductTaggingProps {
    platform: Platform;
    media: MediaItem[];
    selectedTags: ProductTag[];
    onTagsChange: (tags: ProductTag[]) => void;
    className?: string;
}

/**
 * Get platform product ID from a product
 */
function getPlatformProductId(product: Product, platform: Platform): string | null {
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
function getMaxTags(platform: Platform): number {
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
function supportsVisualTagging(platform: Platform): boolean {
    return platform === 'instagram' || platform === 'facebook';
}

export function ProductTagging({
    platform,
    media,
    selectedTags,
    onTagsChange,
    className,
}: ProductTaggingProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [taggingMode, setTaggingMode] = useState(false);
    const [pendingProduct, setPendingProduct] = useState<Product | null>(null);

    const mediaCount = media.length || 1;
    const currentMediaUrl = media[activeMediaIndex]?.url;

    const spec = PLATFORM_SPECS[platform];
    const maxTags = getMaxTags(platform);
    const currentMediaTags = selectedTags.filter(t => t.mediaIndex === activeMediaIndex);
    const canAddMore = currentMediaTags.length < maxTags;

    // Search products from API
    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query);
        setError(null);

        if (query.length < 2) {
            setSearchResults([]);
            setHasSearched(false);
            return;
        }

        setIsSearching(true);
        setHasSearched(true);

        try {
            const response = await fetch(`/api/commerce/products?q=${encodeURIComponent(query)}&platform=${platform}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to search products');
            }

            // Filter out already selected products
            const selectedIds = selectedTags.map(t => t.product.id);
            setSearchResults((data.products || []).filter((p: Product) => !selectedIds.includes(p.id)));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [platform, selectedTags]);

    const handleAddProduct = useCallback((product: Product) => {
        const platformProductId = getPlatformProductId(product, platform);

        if (!platformProductId) {
            setError(`This product is not synced to ${spec.name}. Sync your catalog first.`);
            return;
        }

        // Check if platform supports visual tagging and we have media
        if (supportsVisualTagging(platform) && currentMediaUrl) {
            setPendingProduct(product);
            setTaggingMode(true);
            setSearchQuery('');
            setSearchResults([]);
            setHasSearched(false);
            return;
        }

        const newTag: ProductTag = {
            id: `tag_${Date.now()}`,
            product,
            platformProductId,
            mediaIndex: activeMediaIndex,
            // Default center position for visual tagging platforms (fallback)
            ...(supportsVisualTagging(platform) ? { positionX: 0.5, positionY: 0.5 } : {}),
        };

        onTagsChange([...selectedTags, newTag]);
        setSearchQuery('');
        setSearchResults([]);
        setHasSearched(false);
    }, [platform, spec.name, activeMediaIndex, selectedTags, onTagsChange, currentMediaUrl]);

    const handleVisualTag = useCallback((x: number, y: number) => {
        if (!pendingProduct) return;

        const platformProductId = getPlatformProductId(pendingProduct, platform);
        if (!platformProductId) return;

        const newTag: ProductTag = {
            id: `tag_${Date.now()}`,
            product: pendingProduct,
            platformProductId,
            mediaIndex: activeMediaIndex,
            positionX: x,
            positionY: y,
        };

        onTagsChange([...selectedTags, newTag]);
        setPendingProduct(null);
        setTaggingMode(false);
    }, [pendingProduct, platform, activeMediaIndex, selectedTags, onTagsChange]);

    const handleCancelTagging = useCallback(() => {
        setPendingProduct(null);
        setTaggingMode(false);
    }, []);

    const handleRemoveTag = useCallback((tagId: string) => {
        onTagsChange(selectedTags.filter(t => t.id !== tagId));
    }, [selectedTags, onTagsChange]);

    const handleUpdateTagPosition = useCallback((tagId: string, positionX: number, positionY: number) => {
        onTagsChange(selectedTags.map(t =>
            t.id === tagId ? { ...t, positionX, positionY } : t
        ));
    }, [selectedTags, onTagsChange]);

    // Convert to payload format for publishing
    const toPayload = useCallback((): ProductTagPayload[] => {
        return selectedTags.map(tag => ({
            platformProductId: tag.platformProductId,
            productName: tag.product.name,
            mediaIndex: tag.mediaIndex,
            positionX: tag.positionX,
            positionY: tag.positionY,
        }));
    }, [selectedTags]);

    // Check if product tagging is supported for this platform
    if (!spec.features.productTagging) {
        return null;
    }

    return (
        <div className={cn('space-y-4', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-[var(--accent-gold)]" />
                    <span className="text-sm font-medium">Product Tags</span>
                    <span className="text-xs text-[var(--text-muted)]">
                        ({currentMediaTags.length}/{maxTags})
                    </span>
                </div>
                {mediaCount > 1 && (
                    <div className="flex items-center gap-1">
                        {Array.from({ length: mediaCount }, (_, i) => (
                            <button
                                key={i}
                                onClick={() => setActiveMediaIndex(i)}
                                className={cn(
                                    'h-6 w-6 rounded text-xs font-medium transition-colors',
                                    activeMediaIndex === i
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:bg-[var(--bg-primary)]'
                                )}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Visual Tagging Overlay */}
            {supportsVisualTagging(platform) && currentMediaUrl && (
                <div className="space-y-2">
                    {taggingMode && pendingProduct && (
                        <div className="flex items-center justify-between rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-sm border border-[var(--accent-gold)]">
                            <span className="font-medium text-[var(--accent-gold)]">
                                Tap on image to tag "{pendingProduct.name}"
                            </span>
                            <button
                                onClick={handleCancelTagging}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    <div className="aspect-square w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] relative">
                        {currentMediaUrl.startsWith('blob:') || currentMediaUrl.startsWith('http') ? (
                            <ProductTagOverlay
                                imageUrl={currentMediaUrl}
                                tags={currentMediaTags}
                                startTaggingMode={taggingMode}
                                onAddPosition={taggingMode ? handleVisualTag : undefined}
                                onPositionChange={handleUpdateTagPosition}
                                onRemoveTag={handleRemoveTag}
                                className="h-full w-full"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                                Invalid Image URL
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] text-center">
                        {taggingMode
                            ? "Click anywhere on the image to place the tag"
                            : "Drag tags to reposition them"}
                    </p>
                </div>
            )}

            {/* Platform Note */}
            {platform === 'tiktok' && (
                <div className="flex items-start gap-2 rounded-lg bg-[var(--bg-tertiary)] p-3 text-xs text-[var(--text-muted)]">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>TikTok supports product links only, not visual product tags.</span>
                </div>
            )}

            {/* Selected Products */}
            {currentMediaTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {currentMediaTags.map((tag) => (
                        <div
                            key={tag.id}
                            className="flex items-center gap-2 rounded-full bg-[var(--accent-gold-light)] py-1 pl-1 pr-3"
                        >
                            {tag.product.imageUrl ? (
                                <img
                                    src={tag.product.imageUrl}
                                    alt=""
                                    className="h-6 w-6 rounded-full object-cover"
                                />
                            ) : (
                                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
                            )}
                            <span className="text-sm font-medium truncate max-w-[120px]">
                                {tag.product.name}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">
                                ${tag.product.price.toFixed(2)}
                            </span>
                            <button
                                onClick={() => handleRemoveTag(tag.id)}
                                className="ml-1 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--error)]"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Search Input */}
            {canAddMore && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search products to tag..."
                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                    />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
                    )}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Search Results */}
            {searchResults.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 max-h-[200px] overflow-y-auto">
                    {searchResults.map((product) => {
                        const hasPlatformId = getPlatformProductId(product, platform) !== null;
                        return (
                            <button
                                key={product.id}
                                onClick={() => handleAddProduct(product)}
                                disabled={!hasPlatformId}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                                    hasPlatformId
                                        ? 'hover:bg-[var(--bg-tertiary)]'
                                        : 'opacity-50 cursor-not-allowed'
                                )}
                            >
                                {product.imageUrl ? (
                                    <img
                                        src={product.imageUrl}
                                        alt=""
                                        className="h-10 w-10 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{product.name}</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        ${product.price.toFixed(2)} {product.currency}
                                    </p>
                                </div>
                                {hasPlatformId ? (
                                    <Plus className="h-4 w-4 text-[var(--accent-gold)]" />
                                ) : (
                                    <span className="text-xs text-[var(--text-muted)]">Not synced</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* No Results */}
            {hasSearched && !isSearching && searchResults.length === 0 && searchQuery.length >= 2 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-4 text-center">
                    <Package className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                        No products found matching "{searchQuery}"
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Make sure products are synced to {spec.name}
                    </p>
                </div>
            )}

            {/* Empty State */}
            {selectedTags.length === 0 && searchQuery.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-4 text-center">
                    <ShoppingBag className="mx-auto h-6 w-6 text-[var(--text-muted)]" />
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Tag products to make this post shoppable
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Products must be synced to {spec.name} first
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * Export function to convert component tags to publish payload
 */
export { toProductTagPayload };
function toProductTagPayload(tags: ProductTag[]): ProductTagPayload[] {
    return tags.map(tag => ({
        platformProductId: tag.platformProductId,
        productName: tag.product.name,
        mediaIndex: tag.mediaIndex,
        positionX: tag.positionX,
        positionY: tag.positionY,
    }));
}

/**
 * Product Tag Display for published posts (legacy attribution display)
 */
interface ProductTagDisplayProps {
    products: Array<{
        id: string;
        title: string;
        price: number;
        image?: string;
        handle: string;
    }>;
    className?: string;
}

export function ProductTagDisplay({
    products,
    className,
}: ProductTagDisplayProps) {
    if (products.length === 0) return null;

    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {products.map((product) => (
                <a
                    key={product.id}
                    href={`/products/${product.handle}`}
                    className="flex items-center gap-2 rounded-lg bg-[var(--bg-tertiary)] p-2 transition-colors hover:bg-[var(--bg-secondary)]"
                >
                    {product.image ? (
                        <img src={product.image} alt="" className="h-8 w-8 rounded-md object-cover" />
                    ) : (
                        <div className="h-8 w-8 rounded-md bg-gradient-to-br from-purple-400 to-pink-400" />
                    )}
                    <div>
                        <p className="text-xs font-medium">{product.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">${product.price}</p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-[var(--text-muted)]" />
                </a>
            ))}
        </div>
    );
}
