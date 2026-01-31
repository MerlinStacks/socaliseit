/**
 * Product Tagging UI Component
 * Search-integrated selection for tagging products in posts
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Search, X, Package, AlertCircle } from 'lucide-react';

export interface Product {
    id: string;
    name: string;
    price: string;
    imageUrl?: string;
    sku?: string;
}

interface ProductTaggingUIProps {
    /** Currently selected products */
    selectedProducts: Product[];
    /** Called when products are added or removed */
    onChange: (products: Product[]) => void;
    /** Function to search products, returns matching results */
    onSearch: (query: string) => Promise<Product[]>;
    /** Maximum number of products allowed (default: 5) */
    maxProducts?: number;
    className?: string;
}

const MAX_PRODUCTS_DEFAULT = 5;

/**
 * Product tagging interface with search-as-you-type and tag badges.
 * Enforces platform-specific product limits.
 */
export function ProductTaggingUI({
    selectedProducts,
    onChange,
    onSearch,
    maxProducts = MAX_PRODUCTS_DEFAULT,
    className,
}: ProductTaggingUIProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isAtLimit = selectedProducts.length >= maxProducts;

    // Debounced search
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setIsSearching(true);
            try {
                const searchResults = await onSearch(query);
                // Filter out already selected products
                const filteredResults = searchResults.filter(
                    (p) => !selectedProducts.some((sp) => sp.id === p.id)
                );
                setResults(filteredResults);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [query, onSearch, selectedProducts]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(event.target as Node)
            ) {
                setIsFocused(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (product: Product) => {
        if (isAtLimit) return;
        onChange([...selectedProducts, product]);
        setQuery('');
        setResults([]);
    };

    const handleRemove = (productId: string) => {
        onChange(selectedProducts.filter((p) => p.id !== productId));
    };

    return (
        <div className={cn('space-y-3', className)}>
            {/* Search Input */}
            <div className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        placeholder={isAtLimit ? 'Maximum products reached' : 'Search products to tag...'}
                        disabled={isAtLimit}
                        className={cn(
                            'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm',
                            'placeholder:text-[var(--text-muted)]',
                            'focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/20',
                            'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="loading-spinner loading-spinner-sm" />
                        </div>
                    )}
                </div>

                {/* Search Results Dropdown */}
                {isFocused && results.length > 0 && (
                    <div
                        ref={dropdownRef}
                        className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg animate-slide-down"
                    >
                        {results.slice(0, 5).map((product) => (
                            <button
                                key={product.id}
                                type="button"
                                onClick={() => handleSelect(product)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                                {product.imageUrl ? (
                                    <img
                                        src={product.imageUrl}
                                        alt=""
                                        className="h-10 w-10 rounded-lg object-cover"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-tertiary)]">
                                        <Package className="h-5 w-5 text-[var(--text-muted)]" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                        {product.name}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {product.price}
                                        {product.sku && ` • ${product.sku}`}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Limit Counter */}
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Tag products to make your post shoppable</span>
                <span className={cn(isAtLimit && 'text-[var(--warning)]')}>
                    {selectedProducts.length}/{maxProducts}
                </span>
            </div>

            {/* Selected Products */}
            {selectedProducts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedProducts.map((product) => (
                        <ProductTag
                            key={product.id}
                            product={product}
                            onRemove={() => handleRemove(product.id)}
                        />
                    ))}
                </div>
            )}

            {/* Warning at limit */}
            {isAtLimit && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--warning-light)] px-3 py-2 text-xs text-[var(--warning)]">
                    <AlertCircle className="h-4 w-4" />
                    Maximum of {maxProducts} products per post
                </div>
            )}
        </div>
    );
}

interface ProductTagProps {
    product: Product;
    onRemove: () => void;
}

function ProductTag({ product, onRemove }: ProductTagProps) {
    return (
        <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] pl-1 pr-2 py-1">
            {product.imageUrl ? (
                <img
                    src={product.imageUrl}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                />
            ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-tertiary)]">
                    <Package className="h-3 w-3 text-[var(--text-muted)]" />
                </div>
            )}
            <span className="text-xs font-medium text-[var(--text-primary)] max-w-[120px] truncate">
                {product.name}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
                {product.price}
            </span>
            <button
                type="button"
                onClick={onRemove}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--error-light)] hover:text-[var(--error)] transition-colors"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}
