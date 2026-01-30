/**
 * NextAuth configuration
 * Supports Google OAuth and Email/Password authentication
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { db } from './db';

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(db),
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
            /**
             * Validate user credentials against database
             */
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
    callbacks: {
        /**
         * Add user info to JWT token for credentials auth
         */
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        },
        /**
         * Add user info to session
         */
        async session({ session, token, user }) {
            // For credentials auth, user comes from token
            // For OAuth, user comes from database
            const userId = user?.id || (token?.id as string);

            if (session.user && userId) {
                session.user.id = userId;

                // Fetch real workspaces from database
                const memberships = await db.workspaceMember.findMany({
                    where: { userId },
                    include: { workspace: true },
                });

                if (memberships.length === 0) {
                    // Create default workspace for new users
                    const workspace = await db.workspace.create({
                        data: {
                            name: `${session.user.name || 'My'}'s Workspace`,
                            slug: `workspace-${userId.slice(0, 8)}`,
                            members: {
                                create: {
                                    userId,
                                    role: 'OWNER',
                                },
                            },
                        },
                    });

                    session.user.workspaces = [{
                        id: workspace.id,
                        name: workspace.name,
                        slug: workspace.slug,
                        role: 'OWNER',
                    }];
                    session.user.currentWorkspaceId = workspace.id;
                } else {
                    session.user.workspaces = memberships.map((m) => ({
                        id: m.workspace.id,
                        name: m.workspace.name,
                        slug: m.workspace.slug,
                        role: m.role,
                    }));
                    session.user.currentWorkspaceId = memberships[0].workspace.id;
                }
            }
            return session;
        },
    },
    session: {
        strategy: 'jwt', // Use JWT for credentials support
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
