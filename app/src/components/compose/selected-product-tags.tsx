/**
 * Selected Product Tags Component
 * Displays currently tagged products as chips.
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import { ProductTag } from './product-tagging-types';

interface SelectedProductTagsProps {
    tags: ProductTag[];
    onRemove: (tagId: string) => void;
}

/**
 * Chips showing currently selected product tags.
 */
export function SelectedProductTags({
    tags,
    onRemove,
}: SelectedProductTagsProps) {
    if (tags.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
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
                        onClick={() => onRemove(tag.id)}
                        className="ml-1 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}
