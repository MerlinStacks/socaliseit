/**
 * Utility for merging Tailwind classes with clsx
 * @see https://ui.shadcn.com/docs/installation/manual
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
