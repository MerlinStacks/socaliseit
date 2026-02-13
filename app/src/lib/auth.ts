/**
 * NextAuth configuration
 * Supports Google OAuth and Email/Password authentication
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db, getPrismaClientForAdapter } from './db';

const ORG_PREFERENCE_COOKIE = 'preferred_organization_id';

// Prisma 7 driver adapters generate different client types than @auth/prisma-adapter expects.
// Type assertion is required until @auth/prisma-adapter adds Prisma 7 support.

/**
 * In-memory TTL cache for session data.
 * Why: The session callback runs on every server-side render (every page navigation).
 * Without caching, each navigation triggers a DB query. With a 5-min TTL, the DB
 * is hit once every 5 minutes per user instead.
 */
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * Why: Without a cap, the Map grows without bound as users log in.
 * 10,000 entries ≈ 5 MB — safe for a single Node.js process.
 */
const MAX_SESSION_CACHE_SIZE = 10_000;

interface CachedSessionData {
    isSuperAdmin: boolean;
    memberships: { organization: { id: string; name: string; slug: string }; role: string; joinedAt: Date }[];
    cachedAt: number;
}

const sessionCache = new Map<string, CachedSessionData>();

/** Evicts expired entries on each access to prevent memory leaks */
function getSessionCache(userId: string): CachedSessionData | undefined {
    const entry = sessionCache.get(userId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL_MS) {
        sessionCache.delete(userId);
        return undefined;
    }
    return entry;
}

/**
 * Sets a session cache entry with LRU-style eviction.
 * Why: Map iterates in insertion order, so the first key is the oldest.
 */
function setSessionCache(userId: string, data: CachedSessionData): void {
    sessionCache.set(userId, data);
    if (sessionCache.size > MAX_SESSION_CACHE_SIZE) {
        // Evict oldest entry (first key in insertion order)
        const oldestKey = sessionCache.keys().next().value;
        if (oldestKey) sessionCache.delete(oldestKey);
    }
}

/**
 * Invalidates session cache for a user.
 * Call this when org membership or admin status changes.
 */
export function invalidateSessionCache(userId: string): void {
    sessionCache.delete(userId);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(getPrismaClientForAdapter() as any),
    providers: [
        Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
        Credentials({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const email = credentials.email as string;
                const password = credentials.password as string;

                const user = await db.user.findUnique({
                    where: { email },
                });

                if (!user || !user.password) {
                    return null;
                }

                const isPasswordValid = await bcrypt.compare(password, user.password);

                if (!isPasswordValid) {
                    return null;
                }

                return {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    image: user.image,
                };
            },
        }),
    ],
    pages: {
        signIn: '/login',
        error: '/login',
    },
    events: {
        /**
         * Handle user creation events
         * - Auto-promote first user to Super Admin
         * - Create default organization
         */
        async createUser({ user }) {
            const userId = user.id!;

            /**
             * Why: Use a transaction so the count check and the conditional
             * super-admin promotion can't be interleaved with another
             * concurrent registration. Without this, two simultaneous
             * first-user registrations could both see count === 1.
             */
            await db.$transaction(async (tx) => {
                // 1. Auto-promote first user (count === 1 means this IS the first user)
                const totalUsers = await tx.user.count();
                if (totalUsers === 1) {
                    await tx.user.update({
                        where: { id: userId },
                        data: { isSuperAdmin: true },
                    });
                }

                // 2. Create default organization
                await tx.organization.create({
                    data: {
                        name: `${user.name || 'My'}'s Organization`,
                        slug: `org-${userId.slice(0, 8)}`,
                        members: {
                            create: {
                                userId,
                                role: 'OWNER',
                            },
                        },
                    },
                });
            });
        },
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            const userId = token?.id as string;

            if (session.user && userId) {
                session.user.id = userId;

                try {
                    // Check TTL cache first to avoid DB queries on every navigation
                    const cached = getSessionCache(userId);
                    let isSuperAdmin: boolean;
                    let memberships: { organization: { id: string; name: string; slug: string }; role: string; joinedAt: Date }[];

                    if (cached) {
                        isSuperAdmin = cached.isSuperAdmin;
                        memberships = cached.memberships;
                    } else {
                        // Single DB query fetching user + memberships together
                        // Why: Previously this was 2 separate queries, adding ~50-150ms per navigation
                        const userWithOrgs = await db.user.findUnique({
                            where: { id: userId },
                            select: {
                                isSuperAdmin: true,
                                organizationMemberships: {
                                    include: { organization: true },
                                    orderBy: { joinedAt: 'desc' },
                                },
                            },
                        });

                        isSuperAdmin = userWithOrgs?.isSuperAdmin ?? false;
                        memberships = userWithOrgs?.organizationMemberships ?? [];

                        // Cache for 5 minutes to avoid hitting DB on every page navigation
                        setSessionCache(userId, { isSuperAdmin, memberships, cachedAt: Date.now() });
                    }

                    session.user.isSuperAdmin = isSuperAdmin;

                    if (memberships.length > 0) {
                        session.user.organizations = memberships.map((m) => ({
                            id: m.organization.id,
                            name: m.organization.name,
                            slug: m.organization.slug,
                            role: m.role,
                        }));

                        // Check for stored organization preference
                        let preferredOrgId: string | undefined;
                        try {
                            const cookieStore = await cookies();
                            preferredOrgId = cookieStore.get(ORG_PREFERENCE_COOKIE)?.value;
                        } catch {
                            // Cookies may not be available in all contexts
                        }

                        // Validate that user is still a member of the preferred org
                        const preferredMembership = preferredOrgId
                            ? memberships.find((m) => m.organization.id === preferredOrgId)
                            : null;

                        if (preferredMembership) {
                            session.user.currentOrganizationId = preferredMembership.organization.id;
                        } else {
                            // Smart default: prioritize invited orgs (non-OWNER) over auto-created personal orgs
                            // Why: New users get a personal org on signup, but if invited to another org,
                            // they likely want to see that org's content first.
                            const sortedMemberships = [...memberships].sort((a, b) => {
                                const aIsOwner = a.role === 'OWNER' ? 1 : 0;
                                const bIsOwner = b.role === 'OWNER' ? 1 : 0;
                                if (aIsOwner !== bIsOwner) return aIsOwner - bIsOwner;
                                return b.joinedAt.getTime() - a.joinedAt.getTime();
                            });

                            session.user.currentOrganizationId = sortedMemberships[0].organization.id;
                        }
                    } else {
                        session.user.organizations = [];
                    }

                } catch (error) {
                    // Database query failed — allow auth to succeed with empty org data
                    console.error('[auth] Session callback DB error:', error); // Keep console.error: logger may not be initialized in auth callbacks
                    session.user.isSuperAdmin = false;
                    session.user.organizations = [];
                }
            }
            return session;
        },
    },
    session: {
        strategy: 'jwt',
    },
    trustHost: true,
});

/**
 * Request-scoped cached session getter.
 * React.cache() deduplicates auth() calls within a single server request —
 * when both layout.tsx and page.tsx call getSession(), only one auth() runs.
 */
export const getSession = cache(() => auth());

// Type augmentation for session
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            isSuperAdmin?: boolean;
            organizations?: {
                id: string;
                name: string;
                slug: string;
                role: string;
            }[];
            currentOrganizationId?: string;
        };
    }
}
