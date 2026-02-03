/**
 * NextAuth configuration
 * Supports Google OAuth and Email/Password authentication
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db, getPrismaClientForAdapter } from './db';

// Prisma 7 driver adapters generate different client types than @auth/prisma-adapter expects.
// Type assertion is required until @auth/prisma-adapter adds Prisma 7 support.

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
         * - Create default workspace
         */
        async createUser({ user }) {
            const userId = user.id!;

            // 1. Auto-promote first user
            const totalUsers = await db.user.count();
            if (totalUsers === 1) {
                await db.user.update({
                    where: { id: userId },
                    data: { isSuperAdmin: true },
                });
            }

            // 2. Create default workspace
            await db.workspace.create({
                data: {
                    name: `${user.name || 'My'}'s Workspace`,
                    slug: `workspace-${userId.slice(0, 8)}`,
                    members: {
                        create: {
                            userId,
                            role: 'OWNER',
                        },
                    },
                },
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

                // Fetch real workspaces from database
                const memberships = await db.workspaceMember.findMany({
                    where: { userId },
                    include: { workspace: true },
                });

                // Fetch user's super admin status
                const userRecord = await db.user.findUnique({
                    where: { id: userId },
                    select: { isSuperAdmin: true },
                });

                session.user.isSuperAdmin = userRecord?.isSuperAdmin ?? false;

                if (memberships.length > 0) {
                    session.user.workspaces = memberships.map((m) => ({
                        id: m.workspace.id,
                        name: m.workspace.name,
                        slug: m.workspace.slug,
                        role: m.role,
                    }));
                    session.user.currentWorkspaceId = memberships[0].workspace.id;
                } else {
                    // Fallback if no workspaces found (should be handled by createUser event, 
                    // but safe fallback for legacy users or errors)
                    session.user.workspaces = [];
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

// Type augmentation for session
declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            isSuperAdmin?: boolean;
            workspaces?: {
                id: string;
                name: string;
                slug: string;
                role: string;
            }[];
            currentWorkspaceId?: string;
        };
    }
}
