'use client';

/**
 * SPA-aware link component for dashboard navigation.
 *
 * Why: Inside the SPA shell, `<Link>` from next/link triggers a server
 * round-trip for RSC payloads. This component intercepts clicks and
 * uses `navigateTo()` for SPA-eligible routes, giving instant swaps.
 *
 * SSR-only routes (e.g. /compose) and external URLs fall through to
 * normal browser navigation via Next.js router.
 */

import { type AnchorHTMLAttributes, type MouseEvent, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSPANavigation } from '@/components/layout/dashboard-spa-shell';

/** Routes that must NOT be SPA-swapped (need full App Router lifecycle). */
const SSR_ONLY_PREFIXES = ['/compose'];

/**
 * Returns true when the href can be handled by the SPA shell.
 * External URLs and SSR-only routes return false.
 */
function isSPAEligible(href: string): boolean {
    if (href.startsWith('http') || href.startsWith('//')) return false;
    return !SSR_ONLY_PREFIXES.some((p) => href === p || href.startsWith(`${p}?`) || href.startsWith(`${p}/`));
}

interface SPALinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
    /** Target path — same format as next/link's `href`. */
    href: string;
}

/**
 * Drop-in replacement for `<Link>` inside the dashboard SPA shell.
 * Renders a plain `<a>` for accessibility / right-click / cmd-click,
 * but intercepts left-clicks to navigate via the SPA shell.
 */
export function SPALink({ href, onClick, children, ...rest }: SPALinkProps) {
    const { navigateTo } = useSPANavigation();
    const router = useRouter();

    const handleClick = useCallback(
        (e: MouseEvent<HTMLAnchorElement>) => {
            // Let modifier-clicks (new tab, etc.) pass through
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                onClick?.(e);
                return;
            }

            e.preventDefault();
            onClick?.(e);

            if (isSPAEligible(href)) {
                navigateTo(href);
            } else {
                router.push(href);
            }
        },
        [href, navigateTo, router, onClick],
    );

    return (
        <a href={href} onClick={handleClick} {...rest}>
            {children}
        </a>
    );
}
