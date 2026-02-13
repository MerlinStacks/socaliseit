/**
 * User registration API endpoint
 * Creates new user with hashed password and default workspace
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { z } from 'zod';
import { logger, createRouteLogger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';
import {
    checkRateLimit,
    AUTH_RATE_LIMIT,
    getClientIp,
    createRateLimitHeaders,
} from '@/lib/rate-limit';

const registerSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: Request) {
    try {
        // Rate limit check (10 requests per minute by IP)
        const clientIp = getClientIp(request.headers);
        const rateLimitResult = await checkRateLimit(clientIp, AUTH_RATE_LIMIT);

        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Too many registration attempts. Please try again later.' },
                {
                    status: 429,
                    headers: createRateLimitHeaders(rateLimitResult),
                }
            );
        }

        // Check if registration is enabled in platform settings
        const platformSettings = await db.platformSettings.findUnique({
            where: { id: 'platform_settings' },
            select: { registrationEnabled: true },
        });

        // If settings exist and registration is disabled, block new signups
        if (platformSettings && !platformSettings.registrationEnabled) {
            return NextResponse.json(
                { error: 'Registration is currently disabled. Please contact an administrator.' },
                { status: 403 }
            );
        }

        const body = await request.json();

        // Validate input
        const result = registerSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json(
                { error: result.error.issues[0].message },
                { status: 400 }
            );
        }

        const { name, email, password } = result.data;

        // Check if user already exists
        const existingUser = await db.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return NextResponse.json(
                { error: 'An account with this email already exists' },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        /**
         * Why: Transaction ensures the user count check and user creation
         * are atomic. Without this, two concurrent requests could both
         * see existingUserCount === 0 and both get isSuperAdmin: true.
         */
        const user = await db.$transaction(async (tx) => {
            const existingUserCount = await tx.user.count();
            const isFirstUser = existingUserCount === 0;

            return tx.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    isSuperAdmin: isFirstUser,
                    organizationMemberships: {
                        create: {
                            role: 'OWNER',
                            organization: {
                                create: {
                                    name: `${name}'s Workspace`,
                                    slug: `workspace-${Date.now().toString(36)}`,
                                },
                            },
                        },
                    },
                },
            });
        });

        return NextResponse.json(
            { message: 'Account created successfully', userId: user.id },
            { status: 201 }
        );
    } catch (error) {
        createRouteLogger('API', '/api/auth/register').error({ err: error }, 'Registration error');
        const errorMessage = sanitizeError(error, 'Registration failed');
        return NextResponse.json(
            {
                error: 'Failed to create account',
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
            },
            { status: 500 }
        );
    }
}
