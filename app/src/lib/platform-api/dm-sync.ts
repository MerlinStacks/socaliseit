/**
 * Direct Message Sync Service
 *
 * Orchestrates DM sync from Instagram Messenger and Facebook Messenger APIs.
 *
 * Why: Instagram and Facebook use the same underlying Graph API for DMs
 * via the Messenger Platform. This service centralizes the sync logic.
 *
 * API References:
 * - Instagram Messenger: https://developers.facebook.com/docs/messenger-platform/instagram
 * - Facebook Messenger: https://developers.facebook.com/docs/messenger-platform
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken, handle401Error } from '@/lib/services/token-service';
import { GRAPH_API_URL } from './constants';
import { metaFetch } from './meta-fetch';

/**
 * Platform DM message from Graph API
 */
interface PlatformMessage {
    id: string;
    created_time: string;
    from: {
        id: string;
        username?: string;
        name?: string;
    };
    to?: {
        data: Array<{ id: string; name?: string }>;
    };
    message?: string;
    attachments?: {
        data: Array<{
            id: string;
            mime_type?: string;
            file_url?: string;
            image_data?: { url: string };
            video_data?: { url: string };
        }>;
    };
}

/**
 * Platform conversation from Graph API
 */
interface PlatformConversation {
    id: string;
    participants?: {
        data: Array<{ id: string; username?: string; name?: string }>;
    };
    updated_time?: string;
    messages?: {
        data: PlatformMessage[];
    };
}

/**
 * Sync DMs for Instagram account
 *
 * Why: Uses Instagram Messenger API (requires instagram_manage_messages permission)
 */
export async function syncInstagramDMs(accountId: string): Promise<{
    success: boolean;
    added: number;
    updated: number;
    error?: string;
}> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                organizationId: true,
                platform: true,
                platformId: true,
                accessToken: true,
            },
        });

        if (!account || account.platform !== 'INSTAGRAM') {
            return { success: false, added: 0, updated: 0, error: 'Account not found or not Instagram' };
        }

        // Why: Raw DB token may be expired. ensureValidToken handles refresh.
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            logger.warn({ accountId }, 'Instagram DM sync skipped — token refresh failed');
            return { success: false, added: 0, updated: 0, error: tokenResult.error || 'Token refresh failed' };
        }
        const accessToken = tokenResult.accessToken;

        // Fetch conversations from Instagram Messenger API
        // Why: Access tokens in URLs leak into server logs, proxy caches, and Referer headers.
        // Use Authorization: Bearer header instead (same pattern applied to Threads GET endpoints).
        const conversationsUrl = `${GRAPH_API_URL}/${account.platformId}/conversations?platform=instagram&fields=id,participants,updated_time,messages{id,created_time,from,to,message,attachments}&limit=25`;

        const response = await fetch(conversationsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const errorBody = await response.json();
            const errorCode = errorBody.error?.code;

            // Why: Codes 3 (capability), 10 (permission), and 190 (expired token)
            // all indicate the app lacks instagram_manage_messages. Logging at debug
            // avoids noise since this fires every sync cycle until the permission is granted.
            const isPermissionError = errorCode === 3 || errorCode === 10;
            const isAuthError = errorCode === 190;

            if (isAuthError) {
                // Why: Attempt token refresh for expired tokens instead of just logging.
                const refreshResult = await handle401Error(account.id, errorBody.error?.message || 'Token expired');
                if (refreshResult.needsReconnect) {
                    logger.warn({ accountId }, 'Instagram DM sync — account needs reconnection');
                }
                return {
                    success: false,
                    added: 0,
                    updated: 0,
                    error: 'Instagram token expired. Account may need reconnection.',
                };
            }

            if (isPermissionError) {
                logger.debug(
                    { accountId, errorCode },
                    'Instagram DM sync skipped — instagram_manage_messages permission not granted'
                );
                return {
                    success: false,
                    added: 0,
                    updated: 0,
                    error: 'Instagram DM access not available. App may need instagram_manage_messages permission.',
                };
            }

            logger.warn(
                { accountId, error: errorBody },
                'Instagram DM sync failed - API error'
            );

            return {
                success: false,
                added: 0,
                updated: 0,
                error: errorBody.error?.message || 'Failed to fetch Instagram DMs',
            };
        }

        const data = await response.json();
        const conversations: PlatformConversation[] = data.data || [];

        let added = 0;
        let updated = 0;

        for (const conv of conversations) {
            const result = await processConversation({
                ...account,
                accessToken,
            }, conv);
            added += result.added;
            updated += result.updated;
        }

        logger.info(
            { accountId, conversationCount: conversations.length, added, updated },
            'Instagram DM sync completed'
        );

        return { success: true, added, updated };
    } catch (error) {
        logger.error({ error, accountId }, 'Instagram DM sync error');
        return {
            success: false,
            added: 0,
            updated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Sync DMs for Facebook Page
 *
 * Why: Uses Facebook Messenger API (requires pages_messaging permission)
 */
export async function syncFacebookDMs(accountId: string): Promise<{
    success: boolean;
    added: number;
    updated: number;
    error?: string;
}> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                organizationId: true,
                platform: true,
                platformId: true,
                accessToken: true,
            },
        });

        if (!account || account.platform !== 'FACEBOOK') {
            return { success: false, added: 0, updated: 0, error: 'Account not found or not Facebook' };
        }

        // Why: Raw DB token may be expired. ensureValidToken handles refresh.
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            logger.warn({ accountId }, 'Facebook DM sync skipped — token refresh failed');
            return { success: false, added: 0, updated: 0, error: tokenResult.error || 'Token refresh failed' };
        }
        const accessToken = tokenResult.accessToken;

        // Fetch conversations from Facebook Messenger API
        // Why: Access tokens in URLs leak into server logs, proxy caches, and Referer headers.
        const conversationsUrl = `${GRAPH_API_URL}/${account.platformId}/conversations?fields=id,participants,updated_time,messages{id,created_time,from,to,message,attachments}&limit=25`;

        const response = await fetch(conversationsUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const errorBody = await response.json();
            const errorCode = errorBody.error?.code;

            // Why: Handle expired tokens the same way as Instagram sync.
            if (errorCode === 190) {
                const refreshResult = await handle401Error(account.id, errorBody.error?.message || 'Token expired');
                if (refreshResult.needsReconnect) {
                    logger.warn({ accountId }, 'Facebook DM sync — account needs reconnection');
                }
                return {
                    success: false,
                    added: 0,
                    updated: 0,
                    error: 'Facebook token expired. Account may need reconnection.',
                };
            }

            logger.warn(
                { accountId, error: errorBody },
                'Facebook DM sync failed - API error'
            );

            return {
                success: false,
                added: 0,
                updated: 0,
                error: errorBody.error?.message || 'Failed to fetch Facebook DMs',
            };
        }

        const data = await response.json();
        const conversations: PlatformConversation[] = data.data || [];

        let added = 0;
        let updated = 0;

        for (const conv of conversations) {
            const result = await processConversation({
                ...account,
                accessToken,
            }, conv);
            added += result.added;
            updated += result.updated;
        }

        logger.info(
            { accountId, conversationCount: conversations.length, added, updated },
            'Facebook DM sync completed'
        );

        return { success: true, added, updated };
    } catch (error) {
        logger.error({ error, accountId }, 'Facebook DM sync error');
        return {
            success: false,
            added: 0,
            updated: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * In-memory cache for profile picture URLs to avoid redundant API calls
 * within a single sync run.
 * Why: A user may appear in multiple conversations; we only need to fetch once.
 */
const profilePictureCache = new Map<string, string | null>();

/**
 * Fetch a user's profile picture from the Graph API.
 * Why: The message endpoint doesn't include profile pictures,
 * so we make a separate call to /{userId}/picture?redirect=false.
 */
async function fetchProfilePicture(
    userId: string,
    accessToken: string
): Promise<string | null> {
    if (profilePictureCache.has(userId)) {
        return profilePictureCache.get(userId) ?? null;
    }

    try {
        const url = `${GRAPH_API_URL}/${userId}/picture?redirect=false&type=normal`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            profilePictureCache.set(userId, null);
            return null;
        }

        const data = await response.json();
        const pictureUrl = data?.data?.url ?? null;
        profilePictureCache.set(userId, pictureUrl);
        return pictureUrl;
    } catch {
        profilePictureCache.set(userId, null);
        return null;
    }
}

/**
 * Process a single conversation and upsert messages
 *
 * Why: Both Instagram and Facebook conversations have the same structure
 */
async function processConversation(
    account: {
        id: string;
        organizationId: string;
        platformId: string;
        accessToken: string;
    },
    conversation: PlatformConversation
): Promise<{ added: number; updated: number }> {
    let added = 0;
    let updated = 0;

    const messages = conversation.messages?.data || [];

    // Why: Pre-fetch existing message IDs for this conversation so we can
    // detect new vs existing records without relying on syncedAt (which has
    // @default(now()) in the schema and is therefore always set, even on create).
    const existingIds = new Set(
        (await db.directMessage.findMany({
            where: { socialAccountId: account.id, conversationId: conversation.id },
            select: { platformMessageId: true },
        })).map((m) => m.platformMessageId)
    );

    // Why: Fetch existing sender avatars from DB as a persistent cross-sync cache.
    // The in-memory profilePictureCache resets every sync run; checking the DB means
    // we skip the Graph API call for any sender we've already stored an avatar for.
    const inboundSenderIds = [...new Set(
        messages
            .filter((msg) => msg.from.id !== account.platformId)
            .map((msg) => msg.from.id)
    )];
    const dbAvatarRows = inboundSenderIds.length > 0
        ? await db.directMessage.findMany({
            where: {
                socialAccountId: account.id,
                senderId: { in: inboundSenderIds },
                senderAvatar: { not: null },
            },
            select: { senderId: true, senderAvatar: true },
            distinct: ['senderId'],
        })
        : [];
    const dbAvatarCache = new Map(dbAvatarRows.map((r) => [r.senderId, r.senderAvatar!]));

    for (const msg of messages) {
        // Skip messages from ourselves (outbound already sent)
        const isFromUs = msg.from.id === account.platformId;

        // Get sender info
        const senderUsername = msg.from.username || msg.from.name || msg.from.id;

        // Extract media if present
        let mediaUrl: string | null = null;
        let mediaType: string | null = null;

        if (msg.attachments?.data?.length) {
            const attachment = msg.attachments.data[0];
            if (attachment.image_data?.url) {
                mediaUrl = attachment.image_data.url;
                mediaType = 'image';
            } else if (attachment.video_data?.url) {
                mediaUrl = attachment.video_data.url;
                mediaType = 'video';
            } else if (attachment.file_url) {
                mediaUrl = attachment.file_url;
                mediaType = attachment.mime_type?.split('/')[0] || 'file';
            }
        }

        const isNew = !existingIds.has(msg.id);

        // Why: Use upsert to eliminate N+1 findUnique queries.
        // Avatar is fetched AFTER upsert only for new messages to avoid
        // wasteful API calls on every sync cycle for existing messages.
        const result = await db.directMessage.upsert({
            where: {
                socialAccountId_platformMessageId: {
                    socialAccountId: account.id,
                    platformMessageId: msg.id,
                },
            },
            create: {
                organizationId: account.organizationId,
                socialAccountId: account.id,
                conversationId: conversation.id,
                platformMessageId: msg.id,
                direction: isFromUs ? 'outbound' : 'inbound',
                senderId: msg.from.id,
                senderUsername,
                senderAvatar: null, // Populated below for new inbound messages
                text: msg.message || null,
                mediaUrl,
                mediaType,
                isRead: isFromUs,
                createdAt: new Date(msg.created_time),
            },
            update: {
                text: msg.message || null,
                syncedAt: new Date(),
            },
            select: { id: true },
        });

        if (!isNew) {
            updated++;
        } else {
            added++;
            // Why: Only fetch profile picture for NEW inbound messages.
            // This avoids a Graph API call per message on every sync cycle.
            if (!isFromUs) {
                // Check DB cache first, then in-memory cache, then Graph API
                const cachedAvatar = dbAvatarCache.get(msg.from.id) ?? profilePictureCache.get(msg.from.id);
                if (cachedAvatar !== undefined) {
                    if (cachedAvatar) {
                        await db.directMessage.update({
                            where: { id: result.id },
                            data: { senderAvatar: cachedAvatar },
                        }).catch(() => { /* best effort */ });
                    }
                } else {
                    const avatar = await fetchProfilePicture(msg.from.id, account.accessToken);
                    if (avatar) {
                        await db.directMessage.update({
                            where: { id: result.id },
                            data: { senderAvatar: avatar },
                        }).catch(() => { /* best effort */ });
                        dbAvatarCache.set(msg.from.id, avatar);
                    }
                }
            }
        }
    }

    return { added, updated };
}

/**
 * Sync DMs for all connected Instagram/Facebook accounts in an organization
 */
export async function syncOrganizationDMs(organizationId: string): Promise<{
    accountsProcessed: number;
    totalAdded: number;
    totalUpdated: number;
    errors: Array<{ accountId: string; error: string }>;
}> {
    const accounts = await db.socialAccount.findMany({
        where: {
            organizationId,
            isActive: true,
            platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
        },
        select: { id: true, platform: true },
    });

    let totalAdded = 0;
    let totalUpdated = 0;
    const errors: Array<{ accountId: string; error: string }> = [];

    for (const account of accounts) {
        const result =
            account.platform === 'INSTAGRAM'
                ? await syncInstagramDMs(account.id)
                : await syncFacebookDMs(account.id);

        if (result.success) {
            totalAdded += result.added;
            totalUpdated += result.updated;
        } else if (result.error) {
            errors.push({ accountId: account.id, error: result.error });
        }
    }

    return {
        accountsProcessed: accounts.length,
        totalAdded,
        totalUpdated,
        errors,
    };
}

/**
 * Send a DM reply via Instagram/Facebook Messenger
 *
 * Why: Uses Send API to reply within a conversation thread
 */
export async function sendDMReply(
    accountId: string,
    recipientId: string,
    message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const account = await db.socialAccount.findUnique({
            where: { id: accountId },
            select: {
                id: true,
                organizationId: true,
                platform: true,
                platformId: true,
            },
        });

        if (!account || !['INSTAGRAM', 'FACEBOOK'].includes(account.platform)) {
            return { success: false, error: 'Account not found or unsupported platform' };
        }

        // Why: Raw DB token may be encrypted or expired. ensureValidToken
        // handles decryption + proactive refresh.
        const tokenResult = await ensureValidToken(account.id);
        if (!tokenResult.success || !tokenResult.accessToken) {
            return { success: false, error: tokenResult.error || 'Token refresh failed' };
        }
        const accessToken = tokenResult.accessToken;

        // Determine API endpoint based on platform
        const sendUrl =
            account.platform === 'INSTAGRAM'
                ? `${GRAPH_API_URL}/${account.platformId}/messages`
                : `${GRAPH_API_URL}/me/messages`;

        const response = await metaFetch(accessToken, sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: message },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            logger.warn({ accountId, recipientId, error: data }, 'Failed to send DM');
            return {
                success: false,
                error: data.error?.message || 'Failed to send message',
            };
        }

        // Store the outbound message
        if (data.message_id) {
            await db.directMessage.create({
                data: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    conversationId: data.recipient_id || recipientId,
                    platformMessageId: data.message_id,
                    direction: 'outbound',
                    senderId: account.platformId,
                    senderUsername: 'You', // Will be displayed as "You" in UI
                    text: message,
                    isRead: true,
                    createdAt: new Date(),
                },
            });
        }

        return { success: true, messageId: data.message_id };
    } catch (error) {
        logger.error({ error, accountId }, 'Send DM error');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
