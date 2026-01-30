/**
 * Content Pillars & Templates Service
 * Organize content strategy with pillars and reusable templates
 */

export interface ContentPillar {
    id: string;
    workspaceId: string;
    name: string;
    description: string;
    color: string;
    icon: string;
    targetPercentage: number; // Target % of content
    templates: ContentTemplate[];
    stats: {
        totalPosts: number;
        avgEngagement: number;
        avgReach: number;
        revenue: number;
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface ContentTemplate {
    id: string;
    pillarId: string;
    name: string;
    description: string;
    captionTemplate: string;
    hashtagSets: string[][];
    mediaSpecs: MediaSpec;
    platforms: string[];
    ctaOptions: string[];
    variables: TemplateVariable[];
    usageCount: number;
    createdAt: Date;
}

export interface MediaSpec {
    type: 'image' | 'video' | 'carousel';
    aspectRatio: string;
    minDuration?: number;
    maxDuration?: number;
    guidelines: string;
}

export interface TemplateVariable {
    name: string;
    type: 'text' | 'product' | 'date' | 'number' | 'url';
    placeholder: string;
    required: boolean;
}

// Default content pillars for new workspaces
export const DEFAULT_PILLARS: Partial<ContentPillar>[] = [
    {
        name: 'Educational',
        description: 'Tips, tutorials, and how-to content',
        color: '#4F46E5',
        icon: '📚',
        targetPercentage: 30,
    },
    {
        name: 'Promotional',
        description: 'Product features, sales, and offers',
        color: '#DC2626',
        icon: '🔥',
        targetPercentage: 20,
    },
    {
        name: 'Behind the Scenes',
        description: 'Team, process, and company culture',
        color: '#F59E0B',
        icon: '🎬',
        targetPercentage: 20,
    },
    {
        name: 'User Generated',
        description: 'Customer testimonials and reposts',
        color: '#10B981',
        icon: '💬',
        targetPercentage: 15,
    },
    {
        name: 'Engagement',
        description: 'Questions, polls, and conversations',
        color: '#EC4899',
        icon: '💕',
        targetPercentage: 15,
    },
];

/**
 * Create content pillar
 */
export async function createPillar(
    workspaceId: string,
    data: Partial<ContentPillar>
): Promise<ContentPillar> {
    const pillar: ContentPillar = {
        id: `pillar_${Date.now()}`,
        workspaceId,
        name: data.name || 'New Pillar',
        description: data.description || '',
        color: data.color || '#6B7280',
        icon: data.icon || '📌',
        targetPercentage: data.targetPercentage || 20,
        templates: [],
        stats: {
            totalPosts: 0,
            avgEngagement: 0,
            avgReach: 0,
            revenue: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // In production, save to database
    return pillar;
}

/**
 * Create content template
 */
export async function createTemplate(
    pillarId: string,
    data: Partial<ContentTemplate>
): Promise<ContentTemplate> {
    const template: ContentTemplate = {
        id: `template_${Date.now()}`,
        pillarId,
        name: data.name || 'New Template',
        description: data.description || '',
        captionTemplate: data.captionTemplate || '',
        hashtagSets: data.hashtagSets || [[]],
        mediaSpecs: data.mediaSpecs || {
            type: 'image',
            aspectRatio: '1:1',
            guidelines: '',
        },
        platforms: data.platforms || ['instagram'],
        ctaOptions: data.ctaOptions || [],
        variables: data.variables || [],
        usageCount: 0,
        createdAt: new Date(),
    };

    return template;
}

/**
 * Parse template with variables
 */
export function parseTemplate(
    template: ContentTemplate,
    values: Record<string, string>
): string {
    let caption = template.captionTemplate;

    template.variables.forEach((variable) => {
        const value = values[variable.name];
        if (value) {
            caption = caption.replace(
                new RegExp(`{{${variable.name}}}`, 'g'),
                value
            );
        }
    });

    return caption;
}

/**
 * Get pillar distribution analysis
 */
export async function getPillarDistribution(
    workspaceId: string,
    dateRange: { start: Date; end: Date }
): Promise<{
    pillars: { pillar: ContentPillar; actual: number; target: number }[];
    recommendations: string[];
}> {
    // Mock data - in production fetch from database
    const pillars = DEFAULT_PILLARS.map((p, i) => ({
        pillar: {
            ...p,
            id: `pillar_${i}`,
            workspaceId,
            templates: [],
            stats: {
                totalPosts: Math.floor(Math.random() * 20) + 5,
                avgEngagement: Math.random() * 5 + 2,
                avgReach: Math.floor(Math.random() * 5000) + 1000,
                revenue: Math.floor(Math.random() * 3000),
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        } as ContentPillar,
        actual: Math.floor(Math.random() * 20) + 10,
        target: p.targetPercentage || 20,
    }));

    const recommendations: string[] = [];

    // Generate recommendations based on distribution
    pillars.forEach(({ pillar, actual, target }) => {
        const diff = target - actual;
        if (diff > 10) {
            recommendations.push(
                `Increase ${pillar.name} content by ${diff}% to hit your target`
            );
        } else if (diff < -10) {
            recommendations.push(
                `Reduce ${pillar.name} content - you're ${Math.abs(diff)}% over target`
            );
        }
    });

    return { pillars, recommendations };
}

/**
 * Get template suggestions based on pillar
 */
export function getTemplateSuggestions(
    pillarName: string
): Partial<ContentTemplate>[] {
    const suggestions: Record<string, Partial<ContentTemplate>[]> = {
        Educational: [
            {
                name: 'Quick Tip',
                captionTemplate: '💡 Quick tip: {{tip}}\n\nSave this for later! 📌\n\n{{hashtags}}',
                variables: [
                    { name: 'tip', type: 'text', placeholder: 'Enter your tip', required: true },
                    { name: 'hashtags', type: 'text', placeholder: '#tips #howto', required: false },
                ],
            },
            {
                name: 'Step-by-Step',
                captionTemplate: '📋 How to {{action}} in {{count}} easy steps:\n\n{{steps}}\n\nWhich step was most helpful? Let us know! 👇',
                variables: [
                    { name: 'action', type: 'text', placeholder: 'achieve X', required: true },
                    { name: 'count', type: 'number', placeholder: '5', required: true },
                    { name: 'steps', type: 'text', placeholder: 'Step 1: ...', required: true },
                ],
            },
        ],
        Promotional: [
            {
                name: 'Product Launch',
                captionTemplate: '🚀 Introducing: {{product_name}}\n\n{{description}}\n\n✨ {{key_benefit}}\n\n🔗 Link in bio to shop now!',
                variables: [
                    { name: 'product_name', type: 'text', placeholder: 'Product Name', required: true },
                    { name: 'description', type: 'text', placeholder: 'Short description', required: true },
                    { name: 'key_benefit', type: 'text', placeholder: 'Main benefit', required: true },
                ],
            },
            {
                name: 'Flash Sale',
                captionTemplate: '⚡ FLASH SALE ⚡\n\n{{discount}}% OFF everything!\n\nEnds {{end_time}} ⏰\n\nUse code: {{code}}\n\n👉 Link in bio',
                variables: [
                    { name: 'discount', type: 'number', placeholder: '20', required: true },
                    { name: 'end_time', type: 'text', placeholder: 'midnight', required: true },
                    { name: 'code', type: 'text', placeholder: 'FLASH20', required: true },
                ],
            },
        ],
        'Behind the Scenes': [
            {
                name: 'Day in the Life',
                captionTemplate: '📍 A day at {{location}}\n\n{{description}}\n\nWhat\'s your favorite part of your workday? 👇',
                variables: [
                    { name: 'location', type: 'text', placeholder: 'our office', required: true },
                    { name: 'description', type: 'text', placeholder: 'Description', required: true },
                ],
            },
        ],
        Engagement: [
            {
                name: 'This or That',
                captionTemplate: '🤔 {{option_a}} or {{option_b}}?\n\nComment below! 👇',
                variables: [
                    { name: 'option_a', type: 'text', placeholder: 'Option A', required: true },
                    { name: 'option_b', type: 'text', placeholder: 'Option B', required: true },
                ],
            },
            {
                name: 'Question',
                captionTemplate: '❓ {{question}}\n\nWe want to hear from you! Drop your answer below 👇',
                variables: [
                    { name: 'question', type: 'text', placeholder: 'Your question', required: true },
                ],
            },
        ],
    };

    return suggestions[pillarName] || [];
}
