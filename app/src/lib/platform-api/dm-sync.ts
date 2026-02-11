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

        // Fetch conversations from Instagram Messenger API
        const conversationsUrl = `https://graph.facebook.com/v24.0/${account.platformId}/conversations?platform=instagram&fields=id,participants,updated_time,messages{id,created_time,from,to,message,attachments}&access_token=${account.accessToken}&limit=25`;

        const response = await fetch(conversationsUrl);

        if (!response.ok) {
            const errorBody = await response.json();
            const errorCode = errorBody.error?.code;

            // Why: Codes 3 (capability), 10 (permission), and 190 (expired token)
            // all indicate the app lacks instagram_manage_messages. Logging at debug
            // avoids noise since this fires every sync cycle until the permission is granted.
            const isPermissionError = errorCode === 3 || errorCode === 10 || errorCode === 190;

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
            const result = await processConversation(account, conv);
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

        // Fetch conversations from Facebook Messenger API
        const conversationsUrl = `https://graph.facebook.com/v24.0/${account.platformId}/conversations?fields=id,participants,updated_time,messages{id,created_time,from,to,message,attachments}&access_token=${account.accessToken}&limit=25`;

        const response = await fetch(conversationsUrl);

        if (!response.ok) {
            const errorBody = await response.json();
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
            const result = await processConversation(account, conv);
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
        const url = `https://graph.facebook.com/v24.0/${userId}/picture?redirect=false&type=normal&access_token=${accessToken}`;
        const response = await fetch(url);

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

        // Check if message already exists
        const existing = await db.directMessage.findUnique({
            where: {
                socialAccountId_platformMessageId: {
                    socialAccountId: account.id,
                    platformMessageId: msg.id,
                },
            },
        });

        if (existing) {
            // Update if text changed (rare but possible for edited messages)
            if (existing.text !== msg.message) {
                await db.directMessage.update({
                    where: { id: existing.id },
                    data: {
                        text: msg.message || null,
                        syncedAt: new Date(),
                    },
                });
                updated++;
            }
        } else {
            // Create new message
            await db.directMessage.create({
                data: {
                    organizationId: account.organizationId,
                    socialAccountId: account.id,
                    conversationId: conversation.id,
                    platformMessageId: msg.id,
                    direction: isFromUs ? 'outbound' : 'inbound',
                    senderId: msg.from.id,
                    senderUsername,
                    senderAvatar: isFromUs
                        ? null
                        : await fetchProfilePicture(msg.from.id, account.accessToken),
                    text: msg.message || null,
                    mediaUrl,
                    mediaType,
                    isRead: isFromUs, // Mark our own messages as read
                    createdAt: new Date(msg.created_time),
                },
            });
            added++;
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
                accessToken: true,
            },
        });

        if (!account || !['INSTAGRAM', 'FACEBOOK'].includes(account.platform)) {
            return { success: false, error: 'Account not found or unsupported platform' };
        }

        // Determine API endpoint based on platform
        const sendUrl =
            account.platform === 'INSTAGRAM'
                ? `https://graph.facebook.com/v24.0/${account.platformId}/messages`
                : `https://graph.facebook.com/v24.0/me/messages`;

        const response = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: message },
                access_token: account.accessToken,
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
