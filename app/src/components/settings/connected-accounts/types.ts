/**
 * Connected Accounts Types
 * Why: Shared type definitions for the connected accounts module.
 */

export interface SocialAccount {
    id: string;
    platform: string;
    name: string;
    username: string | null;
    tokenExpiry: string | null;
    isActive: boolean;
    organizationId: string | null;
    organization: { id: string; name: string; logo: string | null } | null;
}

export interface Organization {
    id: string;
    name: string;
    logo: string | null;
}

export interface GbpLocation {
    name: string;
    title: string;
    locationId: string;
}

export interface GbpPendingData {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    accountId: string;
    accountName: string;
}
