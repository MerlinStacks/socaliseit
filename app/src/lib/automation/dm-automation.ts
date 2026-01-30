/**
 * DM Automation Service
 * Automated direct message responses and lead capture
 */

export interface DMAutomation {
    id: string;
    workspaceId: string;
    name: string;
    platform: 'instagram' | 'facebook' | 'tiktok';
    trigger: DMTrigger;
    actions: DMAction[];
    isActive: boolean;
    stats: AutomationStats;
    createdAt: Date;
    updatedAt: Date;
}

export interface DMTrigger {
    type: 'keyword' | 'new_follower' | 'story_reply' | 'comment_dm' | 'manual';
    keywords?: string[];
    conditions?: TriggerCondition[];
}

export interface TriggerCondition {
    field: 'follower_count' | 'account_age' | 'bio_contains' | 'is_verified';
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
    value: string | number | boolean;
}

export interface DMAction {
    id: string;
    type: 'send_message' | 'send_media' | 'add_tag' | 'notify_team' | 'delay' | 'condition';
    order: number;
    config: ActionConfig;
}

export interface ActionConfig {
    // For send_message
    message?: string;
    useAI?: boolean;
    personalize?: boolean;

    // For send_media
    mediaUrl?: string;

    // For add_tag
    tag?: string;

    // For delay
    delaySeconds?: number;

    // For condition
    condition?: TriggerCondition;
    trueActions?: string[];
    falseActions?: string[];
}

export interface AutomationStats {
    totalTriggered: number;
    messagesDelivered: number;
    responseRate: number;
    leadsGenerated: number;
}

export interface Lead {
    id: string;
    workspaceId: string;
    platform: string;
    username: string;
    displayName: string;
    profileUrl: string;
    source: string;
    automationId?: string;
    tags: string[];
    notes: string;
    status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
    createdAt: Date;
    lastContactAt?: Date;
}

// Pre-built automation templates
export const AUTOMATION_TEMPLATES: Partial<DMAutomation>[] = [
    {
        name: 'Welcome New Followers',
        trigger: { type: 'new_follower' },
        actions: [
            {
                id: '1',
                type: 'delay',
                order: 1,
                config: { delaySeconds: 300 }, // 5 min delay to seem natural
            },
            {
                id: '2',
                type: 'send_message',
                order: 2,
                config: {
                    message: 'Hey {{first_name}}! 👋 Thanks for following! We love connecting with our community. Feel free to reach out if you have any questions!',
                    personalize: true,
                },
            },
            {
                id: '3',
                type: 'add_tag',
                order: 3,
                config: { tag: 'new-follower' },
            },
        ],
    },
    {
        name: 'Lead Magnet Delivery',
        trigger: {
            type: 'keyword',
            keywords: ['guide', 'ebook', 'free', 'download'],
        },
        actions: [
            {
                id: '1',
                type: 'send_message',
                order: 1,
                config: {
                    message: 'Here\'s your free guide! 🎉\n\nClick the link below to download:\nhttps://example.com/guide\n\nLet me know if you have any questions!',
                },
            },
            {
                id: '2',
                type: 'add_tag',
                order: 2,
                config: { tag: 'lead-magnet' },
            },
            {
                id: '3',
                type: 'notify_team',
                order: 3,
                config: {},
            },
        ],
    },
    {
        name: 'Story Reply Engagement',
        trigger: { type: 'story_reply' },
        actions: [
            {
                id: '1',
                type: 'send_message',
                order: 1,
                config: {
                    message: 'Thanks for watching! 💕 Glad you enjoyed it. Want me to send you more content like this?',
                    useAI: true,
                },
            },
        ],
    },
];

/**
 * Create a new automation
 */
export async function createAutomation(
    workspaceId: string,
    automation: Partial<DMAutomation>
): Promise<DMAutomation> {
    const newAutomation: DMAutomation = {
        id: `auto_${Date.now()}`,
        workspaceId,
        name: automation.name || 'New Automation',
        platform: automation.platform || 'instagram',
        trigger: automation.trigger || { type: 'keyword', keywords: [] },
        actions: automation.actions || [],
        isActive: false,
        stats: {
            totalTriggered: 0,
            messagesDelivered: 0,
            responseRate: 0,
            leadsGenerated: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // In production, save to database
    return newAutomation;
}

/**
 * Process incoming DM against automations
 */
export async function processIncomingDM(
    workspaceId: string,
    message: {
        platform: string;
        senderId: string;
        senderUsername: string;
        text: string;
        isNewFollower?: boolean;
        isStoryReply?: boolean;
    }
): Promise<{ matched: boolean; automationId?: string; actionsExecuted?: string[] }> {
    // In production:
    // 1. Fetch active automations for workspace
    // 2. Check if message matches any trigger
    // 3. Execute matched automation actions
    // 4. Log results

    console.log(`Processing DM from ${message.senderUsername}: ${message.text}`);

    return { matched: false };
}

/**
 * Send automated DM
 */
export async function sendAutomatedDM(
    platform: string,
    recipientId: string,
    message: string,
    options?: {
        mediaUrl?: string;
        personalization?: Record<string, string>;
    }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    // In production, call platform API

    let finalMessage = message;

    // Apply personalization
    if (options?.personalization) {
        Object.entries(options.personalization).forEach(([key, value]) => {
            finalMessage = finalMessage.replace(`{{${key}}}`, value);
        });
    }

    console.log(`Sending DM on ${platform}: ${finalMessage}`);

    return {
        success: true,
        messageId: `msg_${Date.now()}`,
    };
}

/**
 * Generate AI response for DM
 */
export async function generateAIResponse(
    context: {
        incomingMessage: string;
        senderInfo: { username: string; bio?: string };
        brandVoice?: {
            tone: string;
            guidelines: string;
        };
        previousMessages?: string[];
    }
): Promise<string> {
    // In production, call AI API with context

    const responses = [
        `Thanks for reaching out! 💕 How can I help you today?`,
        `Hey there! Great question. Let me help you with that.`,
        `Thanks for your message! We'd love to help.`,
    ];

    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Create lead from DM interaction
 */
export async function createLeadFromDM(
    workspaceId: string,
    dmData: {
        platform: string;
        username: string;
        displayName: string;
        automationId?: string;
        tags?: string[];
    }
): Promise<Lead> {
    const lead: Lead = {
        id: `lead_${Date.now()}`,
        workspaceId,
        platform: dmData.platform,
        username: dmData.username,
        displayName: dmData.displayName,
        profileUrl: `https://${dmData.platform}.com/${dmData.username}`,
        source: 'dm_automation',
        automationId: dmData.automationId,
        tags: dmData.tags || [],
        notes: '',
        status: 'new',
        createdAt: new Date(),
    };

    // In production, save to database
    return lead;
}

/**
 * Get automation analytics
 */
export async function getAutomationAnalytics(
    automationId: string,
    dateRange: { start: Date; end: Date }
): Promise<{
    triggered: number;
    delivered: number;
    opened: number;
    replied: number;
    converted: number;
    dailyStats: { date: string; triggered: number; converted: number }[];
}> {
    // Mock data
    return {
        triggered: 234,
        delivered: 228,
        opened: 189,
        replied: 67,
        converted: 12,
        dailyStats: [
            { date: '2024-01-20', triggered: 34, converted: 2 },
            { date: '2024-01-21', triggered: 45, converted: 3 },
            { date: '2024-01-22', triggered: 38, converted: 1 },
            { date: '2024-01-23', triggered: 52, converted: 4 },
            { date: '2024-01-24', triggered: 41, converted: 2 },
        ],
    };
}
