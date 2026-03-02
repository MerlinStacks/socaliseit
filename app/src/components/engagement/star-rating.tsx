'use client';

/**
 * StarRating — renders 1–5 filled/empty stars, or a fallback for 0/invalid ratings.
 */

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StarRating({ rating }: { rating: number }) {
    const clampedRating = Math.max(0, Math.min(5, Math.round(rating)));
    if (clampedRating === 0) {
        return (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No rating</span>
        );
    }
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    className={cn(
                        'h-3.5 w-3.5',
                        i <= clampedRating
                            ? 'fill-current'
                            : '',
                    )}
                    style={{
                        color: i <= clampedRating ? 'var(--accent-gold)' : 'var(--text-muted)',
                        opacity: i <= clampedRating ? 1 : 0.3,
                    }}
                />
            ))}
        </div>
    );
}
