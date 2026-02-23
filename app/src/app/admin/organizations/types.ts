'use client';

/**
 * Organization Types and Constants
 * Why: Shared types for organization management UI
 */

export interface Organization {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    tier: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' | 'ADMIN';
    maxWorkspaces: number;
    maxMembers: number;
    memberCount: number;
    workspaceCount: number;
    createdAt: string;
}

export interface OrganizationDetail extends Organization {
    members: Array<{
        id: string;
        role: string;
        joinedAt: string;
        user: { id: string; name: string | null; email: string; image: string | null };
    }>;
    workspaces: Array<{
        id: string;
        name: string;
        slug: string;
        createdAt: string;
        memberCount: number;
        postCount: number;
    }>;
    billing?: {
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        stripePriceId: string | null;
        subscriptionStatus: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    };
}

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export const tierColors: Record<string, { bg: string; text: string }> = {
    FREE: { bg: 'bg-gray-500/10', text: 'text-gray-400' },
    PRO: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
    BUSINESS: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
    ENTERPRISE: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
    ADMIN: { bg: 'bg-red-500/10', text: 'text-red-400' },
};

export const TIERS = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE', 'ADMIN'] as const;
export const ORG_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
