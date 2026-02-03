/**
 * User registration API endpoint
 * Creates new user with hashed password and default workspace
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { z } from 'zod';
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

        // Create user with default workspace
        const user = await db.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                memberships: {
                    create: {
                        role: 'OWNER',
                        workspace: {
                            create: {
                                name: `${name}'s Workspace`,
                                slug: `workspace-${Date.now().toString(36)}`,
                            },
                        },
                    },
                },
            },
        });

        return NextResponse.json(
            { message: 'Account created successfully', userId: user.id },
            { status: 201 }
        );
    } catch (error) {
        console.error('Registration error:', error);
        // Provide more detailed error info in development
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error('Registration error details:', { message: errorMessage, stack: errorStack });
        return NextResponse.json(
            {
                error: 'Failed to create account',
                details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
            },
            { status: 500 }
        );
    }
}
