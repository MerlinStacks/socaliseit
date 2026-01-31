/**
 * Comment Auto-Responder Service
 * AI-powered comment moderation and response
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
    workspaceId: string;
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

// Pre-built response templates
export const RESPONSE_TEMPLATES: Record<string, string[]> = {
    positive: [
        'Thank you so much! 💕',
        'We appreciate you! 🙏',
        'Thanks for your support! ❤️',
        'So glad you love it! 😍',
    ],
    neutral: [
        'Thanks for sharing! 🙏',
        'We appreciate your thoughts! 💭',
    ],
    question: [
        'Great question! DM us for more details 💬',
        'We\'d love to help! Check our bio for more info 👆',
        'Thanks for asking! We\'ll DM you 📩',
    ],
    negative: [
        'We\'re sorry to hear that. Please DM us so we can help 💙',
        'Thanks for sharing your feedback. We\'ll reach out via DM to resolve this.',
    ],
    engagement: [
        'Love this! 🔥',
        'YES! 👏',
        'Couldn\'t agree more! 💯',
        'This made our day! ❤️',
    ],
};

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
 * Generate AI response for comment
 */
export async function generateCommentResponse(
    comment: Comment,
    context: {
        postCaption: string;
        brandVoice?: string;
        customPrompt?: string;
    }
): Promise<string> {
    // In production, call AI API

    // Mock responses based on sentiment
    const templates = RESPONSE_TEMPLATES[comment.sentiment] || RESPONSE_TEMPLATES.engagement;
    const response = templates[Math.floor(Math.random() * templates.length)];

    // Add @mention if appropriate
    if (comment.sentiment === 'question' || comment.sentiment === 'negative') {
        return `@${comment.authorUsername} ${response}`;
    }

    return response;
}

/**
 * Process incoming comments against rules
 */
export async function processComment(
    workspaceId: string,
    comment: Comment,
    rules: CommentRule[]
): Promise<{ matched: boolean; ruleId?: string; response?: string }> {
    for (const rule of rules) {
        if (!rule.isActive) continue;

        const matches = rule.conditions.every((condition) => {
            switch (condition.type) {
                case 'sentiment':
                    return comment.sentiment === condition.value;
                case 'is_question':
                    return analyzeComment(comment.text).isQuestion === condition.value;
                case 'contains_keyword':
                    return comment.text.toLowerCase().includes(String(condition.value).toLowerCase());
                default:
                    return false;
            }
        });

        if (matches) {
            let response: string;

            if (rule.response.type === 'template' && rule.response.templates) {
                response = rule.response.templates[
                    Math.floor(Math.random() * rule.response.templates.length)
                ];
            } else {
                response = await generateCommentResponse(comment, {
                    postCaption: '',
                    customPrompt: rule.response.aiPrompt,
                });
            }

            if (rule.response.mentionAuthor) {
                response = `@${comment.authorUsername} ${response}`;
            }

            return { matched: true, ruleId: rule.id, response };
        }
    }

    return { matched: false };
}

/**
 * Reply to a comment
 */
export async function replyToComment(
    platform: string,
    postId: string,
    commentId: string,
    replyText: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
    // In production, call platform API

    // TODO: Implement actual platform comment API\n    logger.debug({ commentId, replyText }, 'Replying to comment');

    return {
        success: true,
        replyId: `reply_${Date.now()}`,
    };
}

/**
 * Get pending comments for moderation
 */
export async function getPendingComments(
    workspaceId: string,
    options: { limit?: number; sentiment?: string }
): Promise<Comment[]> {
    // Mock data
    return [
        {
            id: 'c1',
            platform: 'instagram',
            postId: 'post_1',
            authorId: 'user_1',
            authorUsername: 'fashionlover',
            text: 'Love this outfit! Where can I buy? 😍',
            sentiment: 'question',
            createdAt: new Date(),
            isReplied: false,
        },
        {
            id: 'c2',
            platform: 'instagram',
            postId: 'post_1',
            authorId: 'user_2',
            authorUsername: 'styleinspo',
            text: 'Absolutely stunning! 🔥',
            sentiment: 'positive',
            createdAt: new Date(),
            isReplied: false,
        },
    ];
}
