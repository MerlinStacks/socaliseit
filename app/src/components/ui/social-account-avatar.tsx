/**
 * Social Account Avatar
 * Renders a social account's profile picture with automatic error fallback.
 *
 * Why: Facebook/Instagram/Threads CDN URLs are signed with temporary tokens.
 * Once expired they return 403 Forbidden, producing console errors and broken
 * images. This component catches the error and shows a deterministic fallback
 * (coloured circle with the account initial) instead. When `accountId` is
 * provided, it also fires a background API call to refresh the expired URL
 * so the next React Query refetch picks up a fresh CDN link.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface SocialAccountAvatarProps {
    /** CDN URL for the avatar image (may be expired) */
    src?: string | null;
    /** Display name — used for the initial fallback */
    name: string;
    /** Pixel size of the avatar circle (default 32) */
    size?: number;
    /** Extra CSS classes on the outer wrapper */
    className?: string;
    /** Background colour class applied when falling back to an initial (e.g. 'bg-pink-500') */
    fallbackColorClass?: string;
    /** Account ID — when provided, triggers a background avatar refresh on 403 */
    accountId?: string;
}

/**
 * Deterministic HSL colour from a string so each account gets a
 * consistent fallback colour without external dependencies.
 */
function nameToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
}

/**
 * Renders a social account avatar with graceful 403/error fallback.
 */
export function SocialAccountAvatar({
    src,
    name,
    size = 32,
    className,
    fallbackColorClass,
    accountId,
}: SocialAccountAvatarProps) {
    const [imgError, setImgError] = useState(false);
    // Why: Prevent duplicate refresh calls for the same error event
    const refreshedRef = useRef(false);

    // Reset error state when src changes (e.g. avatar re-fetched from API)
    useEffect(() => {
        setImgError(false);
        refreshedRef.current = false;
    }, [src]);

    const handleError = () => {
        setImgError(true);

        // Why: Fire-and-forget refresh for Meta CDN URLs.
        // The API updates the DB; the next React Query refetch will pick up the new URL.
        if (accountId && !refreshedRef.current) {
            refreshedRef.current = true;
            fetch('/api/accounts/avatar-refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId }),
            }).catch(() => { /* best effort — fallback is already showing */ });
        }
    };

    const showImage = src && !imgError;
    const initial = name.charAt(0).toUpperCase();

    return (
        <div
            className={cn(
                'rounded-full flex items-center justify-center text-white font-medium overflow-hidden',
                !showImage && (fallbackColorClass || ''),
                className,
            )}
            style={{
                width: size,
                height: size,
                fontSize: Math.max(size * 0.4, 10),
                ...(!showImage && !fallbackColorClass ? { backgroundColor: nameToColor(name) } : {}),
            }}
        >
            {showImage ? (
                <img
                    src={src}
                    alt={name}
                    className="h-full w-full rounded-full object-cover"
                    onError={handleError}
                />
            ) : (
                <span>{initial}</span>
            )}
        </div>
    );
}

