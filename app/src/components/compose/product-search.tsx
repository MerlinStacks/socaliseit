/**
 * Product Search Component
 * Search input and results for product tagging.
 */

'use client';

import React from 'react';
import { Search, Plus, Package, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Platform, PLATFORM_SPECS } from '@/lib/platform-config';
import {
    Product,
    getPlatformProductId,
    supportsVisualTagging,
} from './product-tagging-types';

interface ProductSearchProps {
    platform: Platform;
    searchQuery: string;
    isSearching: boolean;
    hasSearched: boolean;
    searchResults: Product[];
    error: string | null;
    onSearch: (query: string) => void;
    onAddProduct: (product: Product) => void;
}

/**
 * Search input and results dropdown for products.
 */
export function ProductSearch({
    platform,
    searchQuery,
    isSearching,
    hasSearched,
    searchResults,
    error,
    onSearch,
    onAddProduct,
}: ProductSearchProps) {
    const spec = PLATFORM_SPECS[platform];

    return (
        <>
            {/* Search Input */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder={supportsVisualTagging(platform) ? 'Search products to tag...' : 'Search products to link...'}
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                />
                {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
                )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 max-h-[200px] overflow-y-auto">
                    {searchResults.map((product) => {
                        const hasPlatformId = getPlatformProductId(product, platform) !== null;
                        return (
                            <button
                                key={product.id}
                                onClick={() => onAddProduct(product)}
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
                        No products found matching &quot;{searchQuery}&quot;
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Make sure products are synced to {spec.name}
                    </p>
                </div>
            )}
        </>
    );
}
