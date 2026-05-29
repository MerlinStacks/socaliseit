import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { fetchMetaAdLibraryInsights } from '@/lib/platform-api/meta-ad-library';
import { ensureValidToken } from '@/lib/services/token-service';

const SETTINGS_ID = 'global_ai_settings';
const DEFAULT_SEB_MODEL = 'openai/gpt-4o-mini';
const SEB_VISION_FALLBACK_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_FRAME_CAP = 20;

class OpenRouterSebError extends Error {
    constructor(message: string, readonly status: number, readonly body: string) {
        super(message);
        this.name = 'OpenRouterSebError';
    }
}

const DEFAULT_SEB_PROMPT = `You are Seb, a friendly expert social media coach for this organization.
Your job is to help social media managers improve content, captions, creative, timing, and platform strategy.

Rules:
1. Only advise on the organization/business in the supplied context.
2. Refuse unrelated questions and never drift into general non-business topics.
3. Never invent analytics, platforms, competitors, posts, or visual details.
4. Clearly separate observed evidence from recommendations.
5. Use friendly coach vibes: warm, practical, specific, and encouraging.
6. Treat all connected platforms equally unless the organization's data proves one needs urgent attention.
7. Use competitor data only when it is supplied in the organization context.
8. Use platform knowledge only for social media strategy.
9. Treat written post captions, on-video captions/subtitles, and visual text overlays as separate things. Before saying a video needs captions, check the media analysis for visible on-screen captions/subtitles/text overlays.
10. Stories are ephemeral visual formats and often do not need normal feed-style post captions. Do not penalize STORY posts for short or missing written captions unless the supplied data shows that the Story itself is unclear.
11. Return strict JSON only. No markdown fences.`;

const PLATFORM_KNOWLEDGE: Record<string, string> = {
    INSTAGRAM: 'Prioritise strong first-frame hooks, Reels retention, carousel saves, creator-style captions for feed/Reels, Story-native visual clarity, comment prompts, and consistent visual identity.',
    FACEBOOK: 'Prioritise conversation starters, community relevance, native video, local trust signals, Story-native visual clarity, and share-worthy practical posts.',
    TIKTOK: 'Prioritise immediate hooks, fast pacing, native-feeling edits, trend fit, watch-time, comments, and concise captions.',
    YOUTUBE: 'Prioritise title/thumbnail clarity, retention curves, searchable descriptions, Shorts hooks, playlists, and clear viewer payoff.',
    PINTEREST: 'Prioritise search keywords, vertical creative, evergreen value, product/use-case clarity, and destination link relevance.',
    GOOGLE_BUSINESS: 'Prioritise local intent, offers, service updates, proof, fresh photos, and clear calls to contact or visit.',
    LINKEDIN: 'Prioritise expert POV, founder/team stories, practical lessons, credible proof, and conversation-driving questions.',
    BLUESKY: 'Prioritise concise human posts, timely commentary, replies, and community-native tone.',
    THREADS: 'Prioritise conversational hooks, quick opinions, reply chains, and lightweight community engagement.',
    META: 'Prioritise cross-Meta creative consistency while tailoring captions and formats for each destination.',
    MANUAL: 'Use the account name and past performance to infer format needs, but avoid claiming platform-specific rules without evidence.',
};

type ReportTrigger = 'PROACTIVE' | 'MANUAL' | 'CHAT';

interface GenerateSebReportOptions {
    organizationId: string;
    userId?: string;
    trigger?: ReportTrigger;
    reportId?: string;
}

interface ChatOptions {
    organizationId: string;
    userId: string;
    sessionId?: string;
    message: string;
}

interface WebsiteScanOptions {
    organizationId: string;
    websiteUrl?: string;
}

type SebChatMediaAttachment = {
    id: string;
    postId?: string;
    title: string;
    caption?: string;
    platform?: string | null;
    status?: string;
    type: 'image' | 'video';
    mimeType: string;
    url: string;
    previewUrl: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    rationale: string;
};

interface SebAdviceResponse {
    title?: string;
    summary?: string;
    overallScore?: number;
    scoreBreakdown?: Record<string, number>;
    confidence?: number;
    recommendations?: Array<{
        title?: string;
        advice?: string;
        rationale?: string;
        category?: string;
        priority?: string;
        platform?: string | null;
        confidence?: number;
        evidence?: unknown;
        citations?: unknown;
        impactBaseline?: unknown;
    }>;
    experiments?: Array<{
        title?: string;
        hypothesis?: string;
        platform?: string | null;
        metric?: string;
        baseline?: unknown;
    }>;
    brandKnowledgeUpdates?: Record<string, unknown> | null;
    progressNotes?: string[];
}

function safeJsonParse<T>(text: string): T | null {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(cleaned.slice(start, end + 1)) as T;
            } catch {
                return null;
            }
        }
        return null;
    }
}

function tidySebChatText(text: string) {
    return text
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/<[^>]+>/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSebChatAnswer(text: string) {
    const parsed = safeJsonParse<{ message?: string; response?: string; content?: string }>(text);
    const parsedText = parsed?.message || parsed?.response || parsed?.content;
    if (parsedText) return tidySebChatText(parsedText);

    const looseMatch = text.trim().match(/^[{\s]*["'](?:message|response|content)["']\s*:\s*"([\s\S]*)"\s*}?\s*$/);
    if (looseMatch) {
        try {
            return tidySebChatText(JSON.parse(`"${looseMatch[1]}"`) as string);
        } catch {
            return tidySebChatText(looseMatch[1]);
        }
    }

    return tidySebChatText(text);
}

function searchTokens(text: string) {
    return Array.from(new Set(text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2 && !['the', 'and', 'for', 'this', 'that', 'with', 'from', 'what', 'how', 'why', 'you', 'seb', 'user', 'question', 'recommendation'].includes(word))
        .slice(0, 16)));
}

async function findSebChatMediaAttachments(organizationId: string, message: string, answer: string): Promise<SebChatMediaAttachment[]> {
    const tokens = searchTokens(`${message} ${answer}`);
    const visualIntent = /\b(show|see|visual|image|photo|video|preview|example|creative|design|hook|thumbnail|reel|story|ad)\b/i.test(`${message} ${answer}`);

    const posts = await db.post.findMany({
        where: { organizationId, media: { some: {} } },
        include: {
            socialAccount: { select: { platform: true, name: true } },
            media: { include: { media: true }, orderBy: { order: 'asc' }, take: 4 },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 60,
    });

    const scored = posts.flatMap((post) => post.media.map((postMedia) => {
        const media = postMedia.media;
        const haystack = [
            post.caption,
            post.platform,
            post.socialAccount?.platform,
            post.socialAccount?.name,
            media.filename,
            media.altText,
            ...media.tags,
            ...media.aiTags,
        ].filter(Boolean).join(' ').toLowerCase();
        const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0) + (visualIntent ? 0.5 : 0);
        const previewUrl = postMedia.customThumbnailUrl || media.thumbnailUrl || post.externalThumbnailUrl || media.url;

        return {
            score,
            attachment: {
                id: media.id,
                postId: post.id,
                title: media.filename,
                caption: post.caption,
                platform: post.socialAccount?.platform || post.platform,
                status: post.status,
                type: media.mimeType.startsWith('video/') ? 'video' as const : 'image' as const,
                mimeType: media.mimeType,
                url: media.transcodedUrl || media.url,
                previewUrl,
                width: media.width,
                height: media.height,
                duration: media.duration,
                rationale: score > 0 ? 'Matched Seb chat context' : 'Recent visual example',
            },
        };
    }));

    return scored
        .filter((item) => item.score > 0 || visualIntent)
        .sort((a, b) => b.score - a.score)
        .filter((item, index, all) => all.findIndex((other) => other.attachment.id === item.attachment.id) === index)
        .slice(0, visualIntent ? 6 : 3)
        .map((item) => item.attachment);
}

function fallbackSebReport(context: unknown, rawResponse?: string): SebAdviceResponse {
    const ctx = context as {
        posts?: Array<{ id: string; status: string; platform?: string | null }>;
        accounts?: Array<{ platform: string }>;
        competitors?: unknown[];
    };
    const platforms = Array.from(new Set((ctx.accounts || []).map((account) => account.platform))).filter(Boolean);
    const postCount = ctx.posts?.length || 0;

    return {
        title: 'Seb social media coaching report',
        summary: `Seb reviewed ${postCount} recent posts${platforms.length ? ` across ${platforms.join(', ')}` : ''}. The AI response needed format repair, so this report focuses on safe, evidence-based next steps from the available account data.`,
        overallScore: postCount > 0 ? 62 : 40,
        scoreBreakdown: {
            captions: postCount > 0 ? 60 : 35,
            visualHooks: postCount > 0 ? 58 : 35,
            videoQuality: postCount > 0 ? 55 : 35,
            platformFit: platforms.length > 0 ? 65 : 40,
            brandConsistency: 60,
            competitorGap: ctx.competitors?.length ? 60 : 45,
            postingRhythm: postCount > 0 ? 62 : 35,
        },
        confidence: 0.35,
        recommendations: [
            {
                title: 'Strengthen the first impression on every post',
                advice: 'Review the opening line, first frame, or thumbnail before publishing. Make the viewer benefit obvious immediately and remove any slow setup that delays the hook.',
                rationale: 'Seb could not reliably parse the model response, but hook clarity is a safe high-impact improvement across all social platforms.',
                category: 'CREATIVE',
                priority: 'HIGH',
                platform: null,
                confidence: 0.45,
                evidence: { basedOn: `${postCount} posts available in Seb context`, metrics: ['post history', 'media context'] },
                citations: [{ type: 'post', label: 'Recent organization posts', id: 'recent-posts' }],
                impactBaseline: { metric: 'engagementRate', current: 'Use current 30-day average as baseline' },
            },
            {
                title: 'Use brand knowledge to tighten advice quality',
                advice: 'Fill in Seb brand knowledge for audience, positioning, products, offers, voice rules, and topics to avoid. This gives Seb stronger boundaries and more specific recommendations.',
                rationale: 'Brand context improves caption, creative, and competitor advice while keeping Seb focused on this business only.',
                category: 'BRAND',
                priority: 'MEDIUM',
                platform: null,
                confidence: 0.5,
                evidence: { basedOn: 'Seb brand knowledge availability', metrics: ['brand context completeness'] },
                citations: [{ type: 'platform_knowledge', label: 'Seb brand knowledge', id: 'seb-brand-knowledge' }],
            },
        ],
        experiments: [
            {
                title: 'Test clearer hooks for seven days',
                hypothesis: 'Posts with a direct benefit in the first line or first frame will outperform vague openings.',
                platform: null,
                metric: 'engagementRate',
                baseline: { current: 'Current 30-day average engagement rate' },
            },
        ],
        brandKnowledgeUpdates: rawResponse ? { repairNote: 'Seb received a non-JSON model response. Review model choice or prompt if this repeats.' } : null,
        progressNotes: ['Fallback report created because the model response was not valid JSON.'],
    };
}

async function repairSebJson(settings: Awaited<ReturnType<typeof getSebSettings>>, raw: string): Promise<SebAdviceResponse | null> {
    const repaired = await callOpenRouter(settings, [
        { role: 'system', content: 'You repair malformed AI output into valid JSON only. Do not add markdown or commentary.' },
        {
            role: 'user',
            content: `Convert this response into valid JSON matching the Seb report schema. If fields are missing, infer conservative values from the text. Return JSON only.\n\n${raw.slice(0, 30000)}`,
        },
    ], 2500, true);

    return safeJsonParse<SebAdviceResponse>(repaired);
}

function clamp01(value: unknown, fallback = 0.6): number {
    const num = typeof value === 'number' ? value : fallback;
    return Math.min(Math.max(num, 0), 1);
}

function toPlatform(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.toUpperCase();
    return Object.keys(PLATFORM_KNOWLEDGE).includes(normalized) ? normalized : null;
}

function normalizeCategory(value: unknown): string {
    const normalized = typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '_') : '';
    const allowed = new Set(['CONTENT_STRATEGY', 'CAPTION', 'CREATIVE', 'VIDEO', 'TIMING', 'HASHTAG', 'PLATFORM', 'COMPETITOR', 'BRAND']);
    return allowed.has(normalized) ? normalized : 'CONTENT_STRATEGY';
}

function normalizePriority(value: unknown): string {
    const normalized = typeof value === 'string' ? value.toUpperCase() : '';
    return ['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : 'MEDIUM';
}

function mediaUrlToLocalPath(url: string | null | undefined): string | null {
    if (!url?.startsWith('/api/uploads/')) return null;
    const relative = url.replace('/api/uploads/', '');
    return path.join(process.cwd(), 'public', 'uploads', relative);
}

function publicUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    return base ? new URL(url, base).toString() : null;
}

function isImageInputUnsupportedError(error: unknown): boolean {
    return error instanceof OpenRouterSebError
        && error.status === 404
        && /No endpoints found that support image input/i.test(error.body);
}

function normalizeWebsiteUrl(input: string): URL {
    const trimmed = input.trim();
    if (!trimmed) throw new Error('Website URL is required');

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Website URL must use http or https');
    if (url.username || url.password) throw new Error('Website URL cannot include credentials');
    if (isBlockedHostname(url.hostname)) throw new Error('Website URL is not allowed');
    url.hash = '';
    return url;
}

function isBlockedHostname(hostname: string) {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
    if (host === '0.0.0.0' || host.startsWith('127.') || host === '::1' || host === '[::1]') return true;

    const parts = host.split('.').map((part) => Number(part));
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
    }

    return false;
}

function stripHtml(html: string) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function pageTitle(html: string) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 140) : null;
}

function discoverInternalLinks(html: string, baseUrl: URL) {
    const links = new Map<string, number>();
    const priorityWords = ['about', 'services', 'products', 'shop', 'menu', 'pricing', 'contact', 'story', 'brand'];
    const regex = /href=["']([^"'#]+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(html)) !== null) {
        try {
            const url = new URL(match[1], baseUrl);
            if (url.origin !== baseUrl.origin || isBlockedHostname(url.hostname)) continue;
            if (!['http:', 'https:'].includes(url.protocol)) continue;
            url.hash = '';
            const normalized = url.toString();
            const path = `${url.pathname} ${url.search}`.toLowerCase();
            const score = priorityWords.reduce((total, word) => total + (path.includes(word) ? 2 : 0), 0) - path.length / 500;
            links.set(normalized, Math.max(links.get(normalized) ?? -Infinity, score));
        } catch {
            // Ignore malformed or unsupported links discovered in page HTML.
        }
    }

    return Array.from(links.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([url]) => url)
        .filter((url) => url !== baseUrl.toString())
        .slice(0, 4);
}

async function fetchWebsitePage(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'SebBrandCrawler/1.0 (+https://overseeksocials.com)' },
        });
        if (!response.ok) throw new Error(`Website returned ${response.status}`);

        const finalUrl = normalizeWebsiteUrl(response.url || url).toString();
        const contentType = response.headers.get('content-type') || '';
        if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain')) {
            throw new Error('Website did not return readable text or HTML');
        }

        const html = (await response.text()).slice(0, 500_000);
        return { url: finalUrl, title: pageTitle(html), html, text: stripHtml(html).slice(0, 12000) };
    } finally {
        clearTimeout(timeout);
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function runFfmpeg(args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });
    });
}

async function extractVideoFrames(mediaId: string, mediaUrl: string, duration: number | null, frameCap: number): Promise<string[]> {
    const localPath = mediaUrlToLocalPath(mediaUrl);
    if (!localPath || !(await fileExists(localPath))) return [];

    const outputDir = path.join(process.cwd(), 'public', 'uploads', 'seb-frames', mediaId);
    await fs.mkdir(outputDir, { recursive: true });

    const usableDuration = Math.max(duration ?? 0, 1);
    const frameCount = Math.min(Math.max(frameCap, 1), DEFAULT_FRAME_CAP);
    const timestamps = Array.from({ length: frameCount }, (_, index) => {
        if (frameCount === 1) return 0;
        return Math.max(0, Math.min(usableDuration - 0.1, (usableDuration * index) / (frameCount - 1)));
    });

    const urls: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
        const filename = `frame-${String(i + 1).padStart(2, '0')}.jpg`;
        const outputPath = path.join(outputDir, filename);
        try {
            await runFfmpeg(['-y', '-ss', String(timestamps[i]), '-i', localPath, '-frames:v', '1', '-q:v', '3', outputPath]);
            urls.push(`/api/uploads/seb-frames/${mediaId}/${filename}`);
        } catch (error) {
            logger.warn({ err: error, mediaId, frame: i + 1 }, 'Seb frame extraction failed for frame');
        }
    }

    return urls;
}

async function getSebSettings() {
    const settings = await db.globalAISettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!settings?.isConfigured) throw new Error('OpenRouter is not configured');
    if (!settings.sebEnabled) throw new Error('Seb is disabled');
    return {
        apiKey: decrypt(settings.apiKey),
        model: settings.sebModel || settings.selectedModel || DEFAULT_SEB_MODEL,
        systemPrompt: `${DEFAULT_SEB_PROMPT}\n\n${settings.sebSystemPrompt || ''}`.trim(),
        temperature: settings.sebTemperature ?? 0.55,
        maxVideoFrames: Math.min(Math.max(settings.sebMaxVideoFrames ?? DEFAULT_FRAME_CAP, 1), DEFAULT_FRAME_CAP),
        maxReportsPerDay: settings.sebMaxReportsPerDay ?? 3,
        maxChatsPerDay: settings.sebMaxChatsPerDay ?? 30,
        maxVideosPerReport: settings.sebMaxVideosPerReport ?? 10,
    };
}

export async function getSebUsageLimits() {
    const settings = await db.globalAISettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
        maxReportsPerDay: settings?.sebMaxReportsPerDay ?? 3,
        maxChatsPerDay: settings?.sebMaxChatsPerDay ?? 30,
    };
}

async function getMediaAnalysis(media: {
    id: string;
    url: string;
    thumbnailUrl: string | null;
    mimeType: string;
    duration: number | null;
    contentHash: string | null;
    transcodedUrl?: string | null;
}, organizationId: string, settings: Awaited<ReturnType<typeof getSebSettings>>) {
    const mediaHash = media.contentHash || crypto.createHash('sha256').update(`${media.url}:${media.thumbnailUrl}:${media.duration}`).digest('hex');
    const cached = await db.sebMediaAnalysis.findUnique({ where: { mediaId_mediaHash: { mediaId: media.id, mediaHash } } });
    if (cached?.model === settings.model || cached?.model === SEB_VISION_FALLBACK_MODEL) return cached.analysis;

    const imageUrls: string[] = [];
    if (media.mimeType.startsWith('video/')) {
        const frames = await extractVideoFrames(media.id, media.transcodedUrl ?? media.url, media.duration, settings.maxVideoFrames);
        imageUrls.push(...frames.map(publicUrl).filter(Boolean) as string[]);
        const thumbnail = publicUrl(media.thumbnailUrl);
        if (thumbnail && imageUrls.length === 0) imageUrls.push(thumbnail);
    } else {
        const image = publicUrl(media.thumbnailUrl || media.url);
        if (image) imageUrls.push(image);
    }

    let analysis: unknown;
    let modelUsed = settings.model;
    if (imageUrls.length > 0) {
        try {
            analysis = await callSebVision(settings, imageUrls, `Analyze this ${media.mimeType.startsWith('video/') ? 'video frame sequence' : 'image'} for social media performance. Focus on hook clarity, product/brand visibility, pacing clues, visible on-screen captions/subtitles/text overlays, text readability, emotional appeal, likely format fit such as Story/Reel/feed, and concrete improvements. If readable captions or subtitles are visible, say so clearly and do not recommend adding captions as if they are missing. Return concise JSON with strengths, issues, recommendations, hasOnScreenCaptions, captionEvidence, likelyFormat, and confidence.`);
        } catch (error) {
            if (!isImageInputUnsupportedError(error)) throw error;
            if (settings.model !== SEB_VISION_FALLBACK_MODEL) {
                try {
                    logger.warn({ mediaId: media.id, model: settings.model, fallbackModel: SEB_VISION_FALLBACK_MODEL }, 'Seb model does not support image input; retrying with vision fallback');
                    analysis = await callSebVision({ ...settings, model: SEB_VISION_FALLBACK_MODEL }, imageUrls, `Analyze this ${media.mimeType.startsWith('video/') ? 'video frame sequence' : 'image'} for social media performance. Focus on hook clarity, product/brand visibility, pacing clues, visible on-screen captions/subtitles/text overlays, text readability, emotional appeal, likely format fit such as Story/Reel/feed, and concrete improvements. If readable captions or subtitles are visible, say so clearly and do not recommend adding captions as if they are missing. Return concise JSON with strengths, issues, recommendations, hasOnScreenCaptions, captionEvidence, likelyFormat, and confidence.`);
                    modelUsed = SEB_VISION_FALLBACK_MODEL;
                } catch (fallbackError) {
                    if (!isImageInputUnsupportedError(fallbackError)) throw fallbackError;
                    logger.warn({ mediaId: media.id, model: settings.model, fallbackModel: SEB_VISION_FALLBACK_MODEL }, 'Seb media analysis skipped because no configured or fallback model supports image input');
                    analysis = {
                        note: 'Seb could not find an OpenRouter endpoint with image input support, so visual media analysis was skipped.',
                        model: settings.model,
                        fallbackModel: SEB_VISION_FALLBACK_MODEL,
                        recommendations: ['Choose an OpenRouter model with image input support for Seb to review video frames and thumbnails.'],
                    };
                }
            } else {
                logger.warn({ mediaId: media.id, model: settings.model }, 'Seb media analysis skipped because configured model does not support image input');
                analysis = {
                    note: 'The configured Seb model does not support image input, so visual media analysis was skipped.',
                    model: settings.model,
                    recommendations: ['Choose an OpenRouter model with image input support for Seb to review video frames and thumbnails.'],
                };
            }
        }
    } else {
        analysis = { note: 'No accessible image or extracted frame URLs were available for multimodal analysis.' };
    }

    await db.sebMediaAnalysis.upsert({
        where: { mediaId_mediaHash: { mediaId: media.id, mediaHash } },
        update: {
            model: modelUsed,
            frameCount: imageUrls.length,
            analysis: analysis as object,
        },
        create: {
            organizationId,
            mediaId: media.id,
            mediaHash,
            model: modelUsed,
            frameCount: imageUrls.length,
            analysis: analysis as object,
        },
    });

    return analysis;
}

export async function scanWebsiteForSebBrandKnowledge({ organizationId, websiteUrl }: WebsiteScanOptions) {
    const settings = await getSebSettings();
    const existing = await db.sebBrandKnowledge.findUnique({ where: { organizationId } });
    const target = normalizeWebsiteUrl(websiteUrl || existing?.websiteUrl || '');
    const homepage = await fetchWebsitePage(target.toString());
    const pages = [homepage];

    for (const link of discoverInternalLinks(homepage.html, new URL(homepage.url))) {
        if (pages.length >= 5) break;
        try {
            pages.push(await fetchWebsitePage(link));
        } catch (error) {
            logger.warn({ err: error, organizationId, url: link }, 'Seb website crawl skipped page');
        }
    }

    const sourceText = pages
        .filter((page) => page.text.length > 100)
        .map((page, index) => `Page ${index + 1}: ${page.title || page.url}\nURL: ${page.url}\n${page.text}`)
        .join('\n\n---\n\n')
        .slice(0, 50000);

    if (!sourceText) throw new Error('Seb could not find readable brand text on this website');

    const raw = await callOpenRouter(settings, [
        { role: 'system', content: 'You extract brand knowledge for a social media advisor. Use only supplied website text. Return strict JSON only.' },
        {
            role: 'user',
            content: `Extract useful business and brand details from this website crawl. Return JSON with this exact shape: {"audience":"string|null","positioning":"string|null","products":"string|null","offers":"string|null","voiceRules":"string|null","bannedTopics":"string|null","learnedInsights":["string"],"crawlSummary":"string","confidence":0.0}. Do not invent details that are not supported by the source text. Keep each string concise but specific.\n\nWebsite: ${target.toString()}\n\n${sourceText}`,
        },
    ], 1800, true);

    const parsed = safeJsonParse<Record<string, unknown>>(raw) || {};
    const pendingInsights = {
        source: 'website_crawl',
        websiteUrl: target.toString(),
        scannedAt: new Date().toISOString(),
        pages: pages.map((page) => ({ url: page.url, title: page.title })),
        audience: typeof parsed.audience === 'string' ? parsed.audience : null,
        positioning: typeof parsed.positioning === 'string' ? parsed.positioning : null,
        products: typeof parsed.products === 'string' ? parsed.products : null,
        offers: typeof parsed.offers === 'string' ? parsed.offers : null,
        voiceRules: typeof parsed.voiceRules === 'string' ? parsed.voiceRules : null,
        bannedTopics: typeof parsed.bannedTopics === 'string' ? parsed.bannedTopics : null,
        learnedInsights: Array.isArray(parsed.learnedInsights) ? parsed.learnedInsights.filter((item) => typeof item === 'string').slice(0, 12) : [],
        crawlSummary: typeof parsed.crawlSummary === 'string' ? parsed.crawlSummary : 'Seb scanned the website and found brand context.',
        confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
    };

    const knowledge = await db.sebBrandKnowledge.upsert({
        where: { organizationId },
        update: {
            websiteUrl: target.toString(),
            pendingInsights,
            websiteScanSummary: { pages: pendingInsights.pages, crawlSummary: pendingInsights.crawlSummary, confidence: pendingInsights.confidence },
            websiteScannedAt: new Date(),
            updatedBySebAt: new Date(),
        },
        create: {
            organizationId,
            websiteUrl: target.toString(),
            pendingInsights,
            websiteScanSummary: { pages: pendingInsights.pages, crawlSummary: pendingInsights.crawlSummary, confidence: pendingInsights.confidence },
            websiteScannedAt: new Date(),
            updatedBySebAt: new Date(),
        },
    });

    return { knowledge, pages: pendingInsights.pages, pendingInsights };
}

async function collectContext(organizationId: string, settings: Awaited<ReturnType<typeof getSebSettings>>) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [organization, brandVoice, sebBrandKnowledge, accounts, posts, platformAnalytics, competitors, platformKnowledge, previousRecommendations] = await Promise.all([
        db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, timezone: true, tier: true } }),
        db.brandVoice.findUnique({ where: { organizationId } }),
        db.sebBrandKnowledge.findUnique({ where: { organizationId } }),
        db.socialAccount.findMany({ where: { organizationId, isActive: true }, select: { id: true, platform: true, name: true, username: true } }),
        db.post.findMany({
            where: {
                organizationId,
                OR: [
                    { publishedAt: { gte: ninetyDaysAgo } },
                    { status: { in: ['DRAFT', 'SCHEDULED'] } },
                ],
            },
            include: {
                socialAccount: { select: { platform: true, name: true, username: true } },
                analytics: true,
                hashtags: { include: { hashtag: true } },
                media: { include: { media: true }, take: 3, orderBy: { order: 'asc' } },
            },
            orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
            take: 80,
        }),
        db.platformAnalytics.findMany({
            where: { organizationId, date: { gte: ninetyDaysAgo } },
            include: { socialAccount: { select: { platform: true, name: true } } },
            orderBy: { date: 'desc' },
            take: 120,
        }),
        db.competitor.findMany({
            where: { organizationId },
            include: { posts: { orderBy: { postedAt: 'desc' }, take: 10 } },
            take: 20,
        }),
        db.sebPlatformKnowledge.findMany({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, take: 50 }),
        db.sebRecommendation.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 30 }),
    ]);

    const competitorSearchTerms = competitors.flatMap((competitor) => [
        competitor.displayName,
        competitor.username,
    ]).filter((term): term is string => Boolean(term));

    const metaAccount = accounts.find((account) => account.platform === 'FACEBOOK')
        || accounts.find((account) => account.platform === 'INSTAGRAM');
    const metaToken = metaAccount ? await ensureValidToken(metaAccount.id) : null;
    const metaAdLibrary = await fetchMetaAdLibraryInsights(
        competitorSearchTerms,
        metaToken?.success ? metaToken.accessToken : undefined,
    );
    const candidateMedia = posts
        .flatMap((post) => post.media.map((pm) => ({
            postId: post.id,
            postType: post.postType,
            platform: post.socialAccount?.platform || post.platform,
            media: pm.media,
        })))
        .filter((item, index, all) => all.findIndex((other) => other.media.id === item.media.id) === index)
        .slice(0, settings.maxVideosPerReport);

    const mediaAnalyses = [];
    for (const item of candidateMedia) {
        try {
            mediaAnalyses.push({
                postId: item.postId,
                postType: item.postType,
                platform: item.platform,
                mediaId: item.media.id,
                analysis: await getMediaAnalysis(item.media, organizationId, settings),
            });
        } catch (error) {
            logger.warn({ err: error, mediaId: item.media.id }, 'Seb media analysis skipped');
        }
    }

    const connectedPlatformKnowledge = accounts.map((account) => ({
        platform: account.platform,
        guidance: PLATFORM_KNOWLEDGE[account.platform] || '',
    }));

    return {
        organization,
        brandVoice,
        sebBrandKnowledge,
        accounts,
        posts: posts.map((post) => ({
            id: post.id,
            caption: post.caption,
            status: post.status,
            postType: post.postType,
            platform: post.socialAccount?.platform || post.platform,
            accountName: post.socialAccount?.name,
            publishedAt: post.publishedAt,
            scheduledAt: post.scheduledAt,
            hashtags: post.hashtags.map((h) => h.hashtag.tag),
            analytics: post.analytics,
            media: post.media.map((pm) => ({
                id: pm.media.id,
                mimeType: pm.media.mimeType,
                duration: pm.media.duration,
                width: pm.media.width,
                height: pm.media.height,
                thumbnailUrl: pm.media.thumbnailUrl,
                url: pm.media.url,
            })),
        })),
        platformAnalytics,
        competitors,
        metaAdLibrary,
        platformKnowledge: [...connectedPlatformKnowledge, ...platformKnowledge.map((item) => ({ platform: item.platform, title: item.title, guidance: item.content, sourceUrl: item.sourceUrl }))],
        previousRecommendations,
        mediaAnalyses,
    };
}

async function callOpenRouter(settings: Awaited<ReturnType<typeof getSebSettings>>, messages: unknown[], maxTokens = 3500, jsonMode = false): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${settings.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://localhost:3000',
            'X-Title': 'Overseek Socials Seb',
        },
        body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: settings.temperature,
            max_tokens: maxTokens,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new OpenRouterSebError(`OpenRouter Seb request failed: ${response.status} ${text.slice(0, 200)}`, response.status, text);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned empty Seb response');
    return content;
}

async function callSebVision(settings: Awaited<ReturnType<typeof getSebSettings>>, imageUrls: string[], prompt: string) {
    const content = await callOpenRouter(settings, [
        { role: 'system', content: settings.systemPrompt },
        {
            role: 'user',
            content: [
                { type: 'text', text: `${prompt}\nReturn JSON only: {"strengths":[],"issues":[],"recommendations":[],"hasOnScreenCaptions":false,"captionEvidence":"string|null","likelyFormat":"STORY|REEL|FEED|UNKNOWN","confidence":0.0}` },
                ...imageUrls.slice(0, settings.maxVideoFrames).map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
        },
    ], 1200, true);
    return safeJsonParse(content) || { raw: content.slice(0, 2000) };
}

export async function generateSebReport({ organizationId, userId, trigger = 'MANUAL', reportId }: GenerateSebReportOptions) {
    const settings = await getSebSettings();
    try {
        const context = await collectContext(organizationId, settings);
        const inputHash = crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');

    const content = await callOpenRouter(settings, [
        { role: 'system', content: settings.systemPrompt },
        {
            role: 'user',
            content: `Create a proactive Seb social media coaching report for this organization. Use all supplied data, include competitor opportunities, Meta Ad Library patterns when available, progress tracking, confidence, citations, impact baselines, and advice for all connected platforms equally. Treat active ads as evidence of what competitors are currently testing, not proof of performance unless duration or repetition supports that caveat. When scoring captions, separate written post captions from visible on-video captions/subtitles/text overlays. Do not recommend adding video captions if media analysis says captions/subtitles/text overlays are already visible. Do not penalize STORY posts for short or missing written captions because Stories often rely on visual text and stickers instead. Return strict JSON with this shape: {"title":"string","summary":"string","overallScore":0-100,"scoreBreakdown":{"captions":0-100,"visualHooks":0-100,"videoQuality":0-100,"platformFit":0-100,"brandConsistency":0-100,"competitorGap":0-100,"postingRhythm":0-100},"confidence":0-1,"recommendations":[{"title":"string","advice":"string","rationale":"string","category":"CONTENT_STRATEGY|CAPTION|CREATIVE|VIDEO|TIMING|HASHTAG|PLATFORM|COMPETITOR|BRAND","priority":"LOW|MEDIUM|HIGH","platform":"INSTAGRAM|FACEBOOK|TIKTOK|YOUTUBE|PINTEREST|GOOGLE_BUSINESS|LINKEDIN|BLUESKY|THREADS|META|MANUAL|null","confidence":0-1,"evidence":{"basedOn":"string","postIds":["id"],"metrics":["string"]},"citations":[{"type":"post|analytics|competitor|platform_knowledge|media_analysis|meta_ad_library","label":"string","id":"string"}],"impactBaseline":{"metric":"string","current":"string"}}],"experiments":[{"title":"string","hypothesis":"string","platform":"INSTAGRAM|FACEBOOK|TIKTOK|YOUTUBE|PINTEREST|GOOGLE_BUSINESS|LINKEDIN|BLUESKY|THREADS|META|MANUAL|null","metric":"string","baseline":{"current":"string"}}],"brandKnowledgeUpdates":{"learnedInsights":[]},"progressNotes":["string"]}.\n\nContext:\n${JSON.stringify(context).slice(0, 90000)}`,
        },
    ], 3500, true);

    let parsed = safeJsonParse<SebAdviceResponse>(content);
    if (!parsed) {
        logger.warn({ organizationId, reportId, preview: content.slice(0, 500) }, 'Seb returned invalid JSON, attempting repair');
        try {
            parsed = await repairSebJson(settings, content);
        } catch (error) {
            logger.warn({ err: error, organizationId, reportId }, 'Seb JSON repair request failed');
        }
    }
    if (!parsed) {
        logger.warn({ organizationId, reportId }, 'Seb JSON repair failed, using fallback report');
        parsed = fallbackSebReport(context, content);
    }

    const reportData = {
            organizationId,
            trigger,
            status: 'COMPLETED' as const,
            title: parsed.title || 'Seb daily social media coaching report',
            summary: parsed.summary || 'Seb reviewed your recent content and analytics.',
            overallScore: typeof parsed.overallScore === 'number' ? Math.min(Math.max(parsed.overallScore, 0), 100) : null,
            scoreBreakdown: (parsed.scoreBreakdown || {}) as object,
            confidence: clamp01(parsed.confidence),
            model: settings.model,
            inputHash,
            generatedById: userId,
            dataStartDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            dataEndDate: new Date(),
            metadata: { progressNotes: parsed.progressNotes || [] },
    };

    const report = reportId ? await db.sebReport.update({
        where: { id: reportId },
        data: {
            ...reportData,
            recommendations: {
                create: (parsed.recommendations || []).slice(0, 20).map((rec) => ({
                    organization: { connect: { id: organizationId } },
                    title: rec.title || 'Improve content performance',
                    advice: rec.advice || '',
                    rationale: rec.rationale || null,
                    category: normalizeCategory(rec.category) as never,
                    priority: normalizePriority(rec.priority) as never,
                    platform: toPlatform(rec.platform) as never,
                    confidence: clamp01(rec.confidence),
                    evidence: (rec.evidence || {}) as object,
                    citations: (rec.citations || []) as object,
                    impactBaseline: (rec.impactBaseline || undefined) as object | undefined,
                })),
            },
            experiments: {
                create: (parsed.experiments || []).slice(0, 8).map((experiment) => ({
                    organization: { connect: { id: organizationId } },
                    title: experiment.title || 'Seb content experiment',
                    hypothesis: experiment.hypothesis || 'Testing this idea may improve social performance.',
                    platform: toPlatform(experiment.platform) as never,
                    metric: experiment.metric || 'engagementRate',
                    baseline: (experiment.baseline || {}) as object,
                })),
            },
        },
        include: { recommendations: true, experiments: true },
    }) : await db.sebReport.create({
        data: {
            ...reportData,
            recommendations: {
                create: (parsed.recommendations || []).slice(0, 20).map((rec) => ({
                    organization: { connect: { id: organizationId } },
                    title: rec.title || 'Improve content performance',
                    advice: rec.advice || '',
                    rationale: rec.rationale || null,
                    category: normalizeCategory(rec.category) as never,
                    priority: normalizePriority(rec.priority) as never,
                    platform: toPlatform(rec.platform) as never,
                    confidence: clamp01(rec.confidence),
                    evidence: (rec.evidence || {}) as object,
                    citations: (rec.citations || []) as object,
                    impactBaseline: (rec.impactBaseline || undefined) as object | undefined,
                })),
            },
            experiments: {
                create: (parsed.experiments || []).slice(0, 8).map((experiment) => ({
                    organization: { connect: { id: organizationId } },
                    title: experiment.title || 'Seb content experiment',
                    hypothesis: experiment.hypothesis || 'Testing this idea may improve social performance.',
                    platform: toPlatform(experiment.platform) as never,
                    metric: experiment.metric || 'engagementRate',
                    baseline: (experiment.baseline || {}) as object,
                })),
            },
        },
        include: { recommendations: true, experiments: true },
    });

    if (parsed.brandKnowledgeUpdates) {
        await db.sebBrandKnowledge.upsert({
            where: { organizationId },
            update: {
                pendingInsights: parsed.brandKnowledgeUpdates as object,
                updatedBySebAt: new Date(),
            },
            create: {
                organizationId,
                pendingInsights: parsed.brandKnowledgeUpdates as object,
                updatedBySebAt: new Date(),
            },
        });
    }

    await db.notification.create({
        data: {
            organizationId,
            title: 'Seb report is ready',
            message: 'Seb has finished your latest social media coaching report.',
            type: 'success',
            link: '/seb',
        },
    });

    const reportRecommendations = 'recommendations' in report ? report.recommendations as Array<{ priority: string }> : [];
    if (reportRecommendations.some((item) => item.priority === 'HIGH')) {
        await db.notification.create({
            data: {
                organizationId,
                title: 'Seb found high-priority advice',
                message: 'A new Seb report includes high-priority social media recommendations.',
                type: 'warning',
                link: '/seb',
            },
        });
    }

    return report;
    } catch (error) {
        if (reportId) {
            await db.sebReport.update({
                where: { id: reportId },
                data: { status: 'FAILED', summary: error instanceof Error ? error.message : 'Seb report generation failed' },
            }).catch(() => undefined);
        }
        throw error;
    }
}

export async function chatWithSeb({ organizationId, userId, sessionId, message }: ChatOptions) {
    const settings = await getSebSettings();
    const session = sessionId
        ? await db.sebChatSession.findFirst({ where: { id: sessionId, organizationId } })
        : await db.sebChatSession.create({ data: { organizationId, userId, title: message.slice(0, 60) || 'Seb chat' } });

    if (!session) throw new Error('Seb chat session not found');

    const [context, history] = await Promise.all([
        collectContext(organizationId, settings),
        db.sebChatMessage.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: 'asc' }, take: 20 }),
    ]);

    await db.sebChatMessage.create({ data: { sessionId: session.id, role: 'USER', content: message } });

    const answer = await callOpenRouter(settings, [
        { role: 'system', content: `${settings.systemPrompt}\nYou are in chat mode. Ignore any report-mode JSON-only instruction for this reply. Return clean plain text only, with short paragraphs or simple numbered lists. Do not wrap the answer in JSON, markdown fences, or a response/message/content object. Answer conversationally but stay strictly scoped to this organization's social media. If asked unrelated questions, kindly redirect back to social media advice. When visual examples would help, say what to look at and Seb will attach matching image or video previews separately. If discussing captions, separate written post captions from on-video captions/subtitles/text overlays, and remember STORY posts often do not need normal feed-style captions.` },
        { role: 'user', content: `Organization context for Seb chat:\n${JSON.stringify(context).slice(0, 65000)}` },
        ...history.map((item) => ({ role: item.role === 'USER' ? 'user' : 'assistant', content: item.content })),
        { role: 'user', content: message },
    ], 1800);

    const normalizedAnswer = normalizeSebChatAnswer(answer);
    const attachments = await findSebChatMediaAttachments(organizationId, message, normalizedAnswer);
    const saved = await db.sebChatMessage.create({ data: { sessionId: session.id, role: 'ASSISTANT', content: normalizedAnswer, metadata: { attachments } } });
    await db.sebChatSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });

    return { session, message: saved };
}

export async function generateDueSebReports() {
    const settings = await db.globalAISettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!settings?.isConfigured || !settings.sebEnabled || !settings.sebProactiveEnabled) return { generated: 0, skipped: 0 };

    const orgs = await db.organization.findMany({ select: { id: true } });
    let generated = 0;
    let skipped = 0;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const org of orgs) {
        const latest = await db.sebReport.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        if (latest && latest.createdAt > oneDayAgo) {
            skipped += 1;
            continue;
        }
        try {
            await generateSebReport({ organizationId: org.id, trigger: 'PROACTIVE' });
            generated += 1;
        } catch (error) {
            skipped += 1;
            logger.error({ err: error, organizationId: org.id }, 'Seb proactive report failed');
        }
    }

    return { generated, skipped };
}
