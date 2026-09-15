/**
 * Comment moderation helpers
 * Sentiment analysis and platform reply placeholders
 */

import { logger } from '../logger';

export interface Comment {
    id: string;
    platform: string;
    postId: string;
    authorId: string;
    authorUsername: string;
    text: string;
    sentiment: 'positive' | 'neutral' | 'negative' | 'question';
    createdAt: Date;
    isReplied: boolean;
    replyId?: string;
}

export interface CommentRule {
    id: string;
    organizationId: string;
    name: string;
    isActive: boolean;
    conditions: CommentCondition[];
    response: ResponseConfig;
    stats: {
        matched: number;
        replied: number;
    };
}

export interface CommentCondition {
    type: 'contains_keyword' | 'sentiment' | 'author_followers' | 'is_question' | 'post_age';
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
    value: string | number | boolean;
}

export interface ResponseConfig {
    type: 'template' | 'ai_generated';
    templates?: string[];
    aiPrompt?: string;
    includeEmoji?: boolean;
    mentionAuthor?: boolean;
    maxDelay?: number; // seconds
}

/**
 * Analyze comment sentiment
 */
export function analyzeComment(text: string): {
    sentiment: Comment['sentiment'];
    isQuestion: boolean;
    keywords: string[];
} {
    const lowerText = text.toLowerCase();

    // Simple sentiment analysis
    const positiveWords = ['love', 'amazing', 'great', 'awesome', 'beautiful', 'perfect', '❤️', '🔥', '😍'];
    const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'worst', 'disappointed', 'refund'];

    const hasPositive = positiveWords.some(w => lowerText.includes(w));
    const hasNegative = negativeWords.some(w => lowerText.includes(w));
    const isQuestion = text.includes('?') || lowerText.startsWith('how') || lowerText.startsWith('what') || lowerText.startsWith('where');

    let sentiment: Comment['sentiment'] = 'neutral';
    if (isQuestion) sentiment = 'question';
    else if (hasNegative) sentiment = 'negative';
    else if (hasPositive) sentiment = 'positive';

    // Extract keywords
    const keywords = text.match(/\b\w{4,}\b/g) || [];

    return { sentiment, isQuestion, keywords };
}

/**
 * Reply to a comment
 */
export async function replyToComment(
    _platform: string,
    _postId: string,
    _commentId: string,
    _replyText: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
    // Platform comment API not yet integrated — return honest failure
    logger.debug({ _commentId, _replyText }, 'Comment reply skipped (no platform API)');

    return {
        success: false,
        replyId: undefined,
        error: 'Platform comment reply API not yet implemented',
    };
}

/**
 * Get pending comments for moderation
 */
export async function getPendingComments(
    _organizationId: string,
    _options: { limit?: number; sentiment?: string }
): Promise<Comment[]> {
    // No platform API integration yet — no real pending comments to return
    return [];
}
