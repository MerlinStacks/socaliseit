/**
 * TOTP (Time-based One-Time Password) utilities for 2FA
 * Uses RFC 6238 compliant TOTP generation/verification
 */

import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';

const ISSUER = 'SocialiseIT';
const ALGORITHM = 'SHA1';
const DIGITS = 6;
const PERIOD = 30;

/**
 * Generates a random base32-encoded secret for TOTP
 */
export function generateSecret(): string {
    // Generate 20 random bytes (160 bits) for the secret
    const buffer = crypto.randomBytes(20);
    // Convert Node Buffer to ArrayBuffer for OTPAuth.Secret compatibility
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return new OTPAuth.Secret({ buffer: arrayBuffer }).base32;
}

/**
 * Creates a TOTP instance from a secret
 */
function createTOTP(secret: string, email: string): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
        issuer: ISSUER,
        label: email,
        algorithm: ALGORITHM,
        digits: DIGITS,
        period: PERIOD,
        secret: OTPAuth.Secret.fromBase32(secret),
    });
}

/**
 * Generates a QR code data URL for the TOTP secret
 * Returns the otpauth:// URI and QR code as base64 data URL
 */
export async function generateQRCodeDataUrl(
    secret: string,
    email: string
): Promise<{ uri: string; qrCode: string }> {
    const totp = createTOTP(secret, email);
    const uri = totp.toString();

    const qrCode = await QRCode.toDataURL(uri, {
        width: 256,
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff',
        },
    });

    return { uri, qrCode };
}

/**
 * Verifies a TOTP token against a secret
 * Allows for 1 period drift (30 seconds) in either direction
 */
export function verifyToken(secret: string, token: string, email: string): boolean {
    const totp = createTOTP(secret, email);

    // Delta returns null if invalid, or the time step difference if valid
    const delta = totp.validate({
        token,
        window: 1, // Allow 1 period drift in either direction
    });

    return delta !== null;
}

/**
 * Generates 8 single-use backup codes
 * Each code is 8 characters, alphanumeric
 */
export function generateBackupCodes(): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars (0, O, 1, I)

    for (let i = 0; i < 8; i++) {
        let code = '';
        for (let j = 0; j < 8; j++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // Format as XXXX-XXXX for readability
        codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }

    return codes;
}

/**
 * Hashes a backup code for storage
 */
export function hashBackupCode(code: string): string {
    // Normalize: remove hyphens and uppercase
    const normalized = code.replace(/-/g, '').toUpperCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verifies a backup code against stored hashed codes
 * Returns the index of the matching code, or -1 if not found
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
    const hashedInput = hashBackupCode(code);
    return hashedCodes.findIndex((hashed) => hashed === hashedInput);
}
