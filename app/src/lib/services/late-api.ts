/**
 * Late.dev API Service
 *
 * Why: Late.dev is a third-party API that provides access to social media platforms
 * including Google Business Profile without requiring direct API approval from each platform.
 *
 * This service wraps the Late API for posting, account management, and location listing.
 */

import { logger } from '@/lib/logger';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

export interface LateAccount {
    _id: string;
    platform: string;
    username: string;
    displayName: string;
    profilePicture?: string;
    isActive: boolean;
}

export interface LateLocation {
    id: string;
    name: string;
    address?: string;
}

export interface LatePostPlatform {
    platform: string;
    accountId: string;
    platformSpecificData?: {
        locationId?: string;
        pageId?: string;
        organizationUrn?: string;
        contentType?: 'standard' | 'story';
    };
    customContent?: string;
}

export interface LatePostRequest {
    content?: string;
    title?: string;
    platforms: LatePostPlatform[];
    mediaItems?: Array<{
        url: string;
        type: 'image' | 'video';
        thumbnail?: string;
    }>;
    publishNow?: boolean;
    scheduledFor?: string; // ISO date
    timezone?: string;
}

export interface LatePostResponse {
    post: {
        _id: string;
        status: 'draft' | 'scheduled' | 'pending' | 'published' | 'failed' | 'partial';
        platforms: Array<{
            platform: string;
            status: string;
            platformPostUrl?: string;
            error?: string;
        }>;
        scheduledFor?: string;
    };
    message?: string;
}

export interface LateError {
    error: string;
    details?: Record<string, unknown>;
}

/**
 * Late.dev API Client
 */
export class LateApiService {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${LATE_API_BASE}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error({ status: response.status, data, endpoint }, 'Late API request failed');
            throw new LateApiError(
                (data as LateError).error || 'Late API request failed',
                response.status,
                (data as LateError).details
            );
        }

        return data as T;
    }

    /**
     * List all connected accounts
     */
    async listAccounts(): Promise<{ accounts: LateAccount[] }> {
        return this.request<{ accounts: LateAccount[] }>('/accounts');
    }

    /**
     * List Google Business locations for an account
     */
    async listGmbLocations(accountId: string): Promise<{ locations: LateLocation[] }> {
        return this.request<{ locations: LateLocation[] }>(`/accounts/${accountId}/gmb-locations`);
    }

    /**
     * Create and optionally publish a post
     */
    async createPost(post: LatePostRequest): Promise<LatePostResponse> {
        return this.request<LatePostResponse>('/posts', {
            method: 'POST',
            body: JSON.stringify(post),
        });
    }

    /**
     * Get a post by ID
     */
    async getPost(postId: string): Promise<{ post: LatePostResponse['post'] }> {
        return this.request<{ post: LatePostResponse['post'] }>(`/posts/${postId}`);
    }

    /**
     * Delete a post
     */
    async deletePost(postId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/posts/${postId}`, {
            method: 'DELETE',
        });
    }

    /**
     * Generate the OAuth URL for connecting a platform
     */
    getConnectUrl(
        platform: 'googlebusiness' | 'facebook' | 'linkedin' | 'tiktok',
        profileId: string,
        redirectUrl: string,
        headless: boolean = true
    ): string {
        const params = new URLSearchParams({
            profileId,
            redirect_url: redirectUrl,
            ...(headless && { headless: 'true' }),
        });
        return `${LATE_API_BASE}/connect/${platform}?${params.toString()}`;
    }
}

/**
 * Custom error class for Late API errors
 */
export class LateApiError extends Error {
    status: number;
    details?: Record<string, unknown>;

    constructor(message: string, status: number, details?: Record<string, unknown>) {
        super(message);
        this.name = 'LateApiError';
        this.status = status;
        this.details = details;
    }
}

/**
 * Helper to create a Late API service from global settings (super admin configured)
 */
export async function getLateApiService(): Promise<LateApiService | null> {
    // Dynamic import to avoid circular dependencies
    const { db } = await import('@/lib/db');

    const settings = await db.globalIntegrationSettings.findUnique({
        where: { id: 'global_integration_settings' },
    });

    if (!settings?.lateApiKey) {
        return null;
    }

    // Decrypt the API key
    const { decrypt } = await import('@/lib/crypto');
    const apiKey = decrypt(settings.lateApiKey);

    return new LateApiService(apiKey);
}

