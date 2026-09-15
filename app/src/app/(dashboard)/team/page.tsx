'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Compatibility route for existing Team links. */
export default function TeamPage() {
    const router = useRouter();

    useEffect(() => {
        // The SPA provider follows Next's pathname change as well.
        router.replace('/settings?tab=team', { scroll: false });
    }, [router]);

    return null;
}
