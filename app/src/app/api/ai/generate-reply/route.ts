/**
 * AI Reply Suggestions API
 * POST /api/ai/generate-reply
 *
 * Generates contextual reply suggestions for inbox items.
 * Uses message context, sentiment, and brand voice to craft responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

const RequestSchema = z.object({
    /** Original message text */
    messageText: z.string().min(1).max(5000),
    /** Type of inbox item */
    messageType: z.enum(['comment', 'mention', 'dm', 'review']),
    /** Platform for tone calibration */
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'linkedin', 'google_business']),
    /** Detected sentiment of the message */
    sentiment: z.enum(['positive', 'negative', 'neutral', 'question']).optional(),
    /** Author username for personalization */
    authorUsername: z.string().optional(),
    /** Conversation history for context */
    conversationHistory: z.array(z.object({
        direction: z.enum(['inbound', 'outbound']),
        text: z.string(),
    })).optional(),
    /** Desired reply tone */
    tone: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'enthusiastic']).optional().default('friendly'),
    /** Number of suggestions to generate */
    suggestionCount: z.number().min(1).max(5).optional().default(3),
});

type ReplyRequest = z.infer<typeof RequestSchema>;

/**
 * Generate reply suggestions based on message context
 */
function generateReplySuggestions(data: ReplyRequest): string[] {
    const { messageText, messageType, sentiment, authorUsername, tone } = data;
    const name = authorUsername ? `@${authorUsername}` : 'there';

    // Template map based on sentiment and message type
    const templates: Record<string, Record<string, string[]>> = {
        positive: {
            comment: [
                `Thank you so much for your kind words! 🙏 We really appreciate your support!`,
                `This made our day! ${name} Thank you for being part of our community! 💛`,
                `So glad you love it! Thanks for sharing your thoughts with us! ✨`,
            ],
            mention: [
                `Thanks for the shoutout ${name}! 🎉 We're so happy you're enjoying it!`,
                `We're thrilled to see this! Thank you for sharing! 💫`,
                `This is amazing! Thanks for tagging us ${name}! 🙌`,
            ],
            dm: [
                `Hey ${name}! Thanks for reaching out! We really appreciate your kind message! 😊`,
                `Hello! Thank you so much for your message - it means a lot to us! 💛`,
                `Hi ${name}! We're so glad to hear from you! Thank you for the wonderful feedback!`,
            ],
            review: [
                `Thank you so much for your wonderful ${data.messageType === 'review' ? 'review' : 'feedback'}! We're thrilled you had a great experience! 🌟`,
                `Wow, thank you for the glowing review! Your kind words mean the world to our team! 💛`,
                `We're so grateful for your 5-star review! It's customers like you that inspire us every day! ✨`,
            ],
        },
        negative: {
            comment: [
                `We're sorry to hear about your experience. Could you DM us so we can help resolve this?`,
                `Thank you for letting us know. We'd love to make this right - please reach out via DM.`,
                `We appreciate your feedback and want to help. Can you share more details via DM?`,
            ],
            mention: [
                `We're sorry this happened. Please DM us your order details so we can help fix this ASAP.`,
                `Thank you for bringing this to our attention. We'd like to make things right - please DM us!`,
                `We hear you and want to help. Please send us a DM with more details.`,
            ],
            dm: [
                `Hi ${name}, we're really sorry about this experience. Let us look into this right away for you.`,
                `Thank you for reaching out. We apologize for the inconvenience and want to make this right.`,
                `We're sorry to hear about this issue. Can you share more details so we can help resolve it?`,
            ],
            review: [
                `We sincerely apologize for your experience. We'd love the chance to make this right — please reach out to us directly so we can help.`,
                `Thank you for your honest feedback. We take this seriously and would like to resolve this — please contact us directly.`,
                `We're sorry we fell short of your expectations. Your feedback helps us improve, and we'd love to discuss how we can make things better.`,
            ],
        },
        question: {
            comment: [
                `Great question! ${getQuestionResponse(messageText)}`,
                `Thanks for asking! We'd be happy to help - ${getQuestionResponse(messageText)}`,
                `Good question ${name}! Here's some info: ${getQuestionResponse(messageText)}`,
            ],
            mention: [
                `Thanks for reaching out! To answer your question: ${getQuestionResponse(messageText)}`,
                `Great to hear from you! Here's what you need to know: ${getQuestionResponse(messageText)}`,
                `Thanks for tagging us with your question! ${getQuestionResponse(messageText)}`,
            ],
            dm: [
                `Hi ${name}! Thanks for your question. ${getQuestionResponse(messageText)}`,
                `Hello! We're happy to help. ${getQuestionResponse(messageText)}`,
                `Hey ${name}! Great question - ${getQuestionResponse(messageText)}`,
            ],
            review: [
                `Thank you for your review and question! ${getQuestionResponse(messageText)}`,
                `We appreciate your feedback! To answer your question: ${getQuestionResponse(messageText)}`,
                `Thanks for taking the time to leave a review! ${getQuestionResponse(messageText)}`,
            ],
        },
        neutral: {
            comment: [
                `Thanks for your comment! Let us know if you have any questions. 😊`,
                `We appreciate you taking the time to share this! 🙏`,
                `Thank you for engaging with us! Feel free to reach out anytime.`,
            ],
            mention: [
                `Thanks for the tag ${name}! We hope you're having a great day! ✨`,
                `Thanks for sharing! We love seeing our community engage. 💫`,
                `Appreciate the mention ${name}! Let us know if you need anything!`,
            ],
            dm: [
                `Hi ${name}! Thanks for getting in touch. How can we help you today?`,
                `Hello! Thanks for your message. Is there anything we can assist you with?`,
                `Hey ${name}! Great to hear from you. What can we do for you?`,
            ],
            review: [
                `Thank you for taking the time to share your feedback! We truly value your input. 🙏`,
                `We appreciate your review! Your feedback helps us continue to improve our service.`,
                `Thanks for your review! We're always working to deliver the best experience possible.`,
            ],
        },
    };

    // Adjust templates based on tone
    const sentimentKey = sentiment || 'neutral';
    const typeKey = messageType;
    const baseTemplates = templates[sentimentKey]?.[typeKey] || templates.neutral[typeKey];

    // Apply tone adjustments
    return baseTemplates.slice(0, data.suggestionCount).map(template => {
        if (tone === 'professional') {
            return template
                .replace(/!\s*/g, '. ')
                .replace(/🙏|💛|✨|🎉|💫|🙌|😊|❤️/g, '')
                .trim();
        }
        if (tone === 'casual') {
            return template
                .replace(/We appreciate/g, 'We really appreciate')
                .replace(/Thank you/g, 'Thanks');
        }
        return template;
    });
}

/**
 * Generate contextual response to questions
 */
function getQuestionResponse(messageText: string): string {
    const lowerText = messageText.toLowerCase();

    if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('how much')) {
        return 'Check out our website for the latest pricing information, or DM us for personalized quotes!';
    }
    if (lowerText.includes('ship') || lowerText.includes('delivery')) {
        return 'We typically ship within 2-3 business days. Feel free to DM us for tracking updates!';
    }
    if (lowerText.includes('return') || lowerText.includes('refund')) {
        return 'We have a hassle-free return policy. DM us with your order details and we\'ll help you out!';
    }
    if (lowerText.includes('available') || lowerText.includes('stock') || lowerText.includes('restock')) {
        return 'DM us with the specific item you\'re looking for and we\'ll check availability for you!';
    }
    if (lowerText.includes('size') || lowerText.includes('fit')) {
        return 'We have a size guide on our website! For personalized sizing help, feel free to DM us.';
    }
    if (lowerText.includes('discount') || lowerText.includes('code') || lowerText.includes('coupon')) {
        return 'Sign up for our newsletter for exclusive deals! You can also follow us for flash sale announcements.';
    }
    if (lowerText.includes('how') || lowerText.includes('what') || lowerText.includes('when') || lowerText.includes('where')) {
        return 'Great question! For more details, please check our FAQ or DM us directly.';
    }

    return 'Please feel free to DM us for more details and we\'ll be happy to help!';
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const data = RequestSchema.parse(body);

        // Generate reply suggestions
        const suggestions = generateReplySuggestions(data);

        // Simulate AI processing time (in production, this would call actual AI API)
        await new Promise((r) => setTimeout(r, 500));

        logger.debug(
            { messageType: data.messageType, sentiment: data.sentiment },
            'Generated reply suggestions'
        );

        return NextResponse.json({
            success: true,
            data: {
                suggestions,
                metadata: {
                    sentiment: data.sentiment || 'neutral',
                    tone: data.tone,
                    platform: data.platform,
                    generatedAt: new Date().toISOString(),
                },
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        logger.error({ error }, 'Reply suggestion generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate suggestions' },
            { status: 500 }
        );
    }
}
