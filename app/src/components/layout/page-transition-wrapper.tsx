'use client';

/**
 * Client-side wrapper for page transitions
 * Why: Layout is a server component, but framer-motion needs client context
 */

import { PageTransition } from '@/components/ui/page-transition';
import { type ReactNode } from 'react';

interface PageTransitionWrapperProps {
    children: ReactNode;
}

export function PageTransitionWrapper({ children }: PageTransitionWrapperProps) {
    return <PageTransition>{children}</PageTransition>;
}
