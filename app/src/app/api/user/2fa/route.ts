/**
 * Two-Factor Authentication API
 * Handles 2FA setup, verification, and management
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import {
    generateSecret,
    generateQRCodeDataUrl,
    verifyToken,
    generateBackupCodes,
    hashBackupCode,
    verifyBackupCode,
} from '@/lib/totp';

/**
 * GET /api/user/2fa
 * Returns 2FA status for current user
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            twoFactorEnabled: true,
            backupCodes: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
        enabled: user.twoFactorEnabled,
        hasBackupCodes: user.backupCodes.length > 0,
        backupCodesCount: user.backupCodes.length,
    });
}

/**
 * POST /api/user/2fa
 * Generates a new TOTP secret and QR code for setup
 */
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.twoFactorEnabled) {
        return NextResponse.json(
            { error: '2FA is already enabled' },
            { status: 400 }
        );
    }

    // Generate new secret (not saved until verified)
    const secret = generateSecret();
    const { qrCode, uri } = await generateQRCodeDataUrl(secret, user.email);

    // Store secret temporarily (will be confirmed on PUT)
    await db.user.update({
        where: { id: session.user.id },
        data: { twoFactorSecret: secret },
    });

    return NextResponse.json({
        secret,
        qrCode,
        uri,
    });
}

/**
 * PUT /api/user/2fa
 * Verifies TOTP code and enables 2FA
 */
export async function PUT(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== 'string' || token.length !== 6) {
        return NextResponse.json(
            { error: 'Invalid verification code' },
            { status: 400 }
        );
    }

    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            email: true,
            twoFactorSecret: true,
            twoFactorEnabled: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.twoFactorEnabled) {
        return NextResponse.json(
            { error: '2FA is already enabled' },
            { status: 400 }
        );
    }

    if (!user.twoFactorSecret) {
        return NextResponse.json(
            { error: 'No 2FA setup in progress. Start setup first.' },
            { status: 400 }
        );
    }

    // Verify the token
    const isValid = verifyToken(user.twoFactorSecret, token, user.email);
    if (!isValid) {
        return NextResponse.json(
            { error: 'Invalid verification code' },
            { status: 400 }
        );
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedCodes = backupCodes.map(hashBackupCode);

    // Enable 2FA
    await db.user.update({
        where: { id: session.user.id },
        data: {
            twoFactorEnabled: true,
            backupCodes: hashedCodes,
        },
    });

    return NextResponse.json({
        success: true,
        backupCodes, // Return plaintext codes once, user must save them
    });
}

/**
 * DELETE /api/user/2fa
 * Disables 2FA (requires password verification)
 */
export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
        return NextResponse.json(
            { error: 'Password is required' },
            { status: 400 }
        );
    }

    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            password: true,
            twoFactorEnabled: true,
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.twoFactorEnabled) {
        return NextResponse.json(
            { error: '2FA is not enabled' },
            { status: 400 }
        );
    }

    // Verify password (for OAuth users without password, this will fail)
    if (!user.password) {
        return NextResponse.json(
            { error: 'Cannot disable 2FA for OAuth accounts without password' },
            { status: 400 }
        );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return NextResponse.json(
            { error: 'Incorrect password' },
            { status: 400 }
        );
    }

    // Disable 2FA
    await db.user.update({
        where: { id: session.user.id },
        data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            backupCodes: [],
        },
    });

    return NextResponse.json({ success: true });
}
