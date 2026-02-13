/**
 * Transcription API Route
 * Server-side OpenAI Whisper integration for speech-to-text.
 * 
 * Why server-side: API key security, larger file handling, and caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logger } from '@/lib/logger';
import { auth } from '@/lib/auth';
import { validateExternalUrl } from '@/lib/validate-url';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { sanitizeError } from '@/lib/sanitize-error';

// ============================================================================
// TYPES
// ============================================================================

interface TranscriptionRequest {
    url?: string;
    language?: string;
    wordTimestamps?: boolean;
    prompt?: string;
}

// ============================================================================
// OPENAI CLIENT (Lazy initialization to prevent build-time failures)
// ============================================================================

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
        }
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
}

// ============================================================================
// POST - Transcribe audio/video
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        // Auth check — this endpoint was previously unprotected
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit: 5 requests per minute for expensive AI operations
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:transcribe`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const contentType = request.headers.get('content-type') || '';

        let audioFile: File | null = null;
        let options: TranscriptionRequest = {};

        if (contentType.includes('multipart/form-data')) {
            // File upload
            const formData = await request.formData();
            audioFile = formData.get('file') as File | null;
            options = {
                language: formData.get('language') as string | null || undefined,
                wordTimestamps: formData.get('wordTimestamps') === 'true',
                prompt: formData.get('prompt') as string | null || undefined,
            };
        } else {
            // JSON request with URL
            const body = await request.json() as TranscriptionRequest;
            options = body;

            if (body.url) {
                // SSRF protection: validate URL before fetching
                const urlCheck = await validateExternalUrl(body.url);
                if (!urlCheck.valid) {
                    return NextResponse.json(
                        { error: `Invalid URL: ${urlCheck.reason}` },
                        { status: 400 }
                    );
                }

                // Fetch file from validated URL
                const response = await fetch(body.url);
                if (!response.ok) {
                    return NextResponse.json(
                        { error: 'Failed to fetch audio from URL' },
                        { status: 400 }
                    );
                }
                const blob = await response.blob();
                audioFile = new File([blob], 'audio.mp3', { type: blob.type });
            }
        }

        if (!audioFile) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        // Check API key
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { error: 'OpenAI API key not configured' },
                { status: 500 }
            );
        }

        // Check file size (max 25MB for Whisper)
        if (audioFile.size > 25 * 1024 * 1024) {
            return NextResponse.json(
                { error: 'File size exceeds 25MB limit' },
                { status: 400 }
            );
        }

        // Call OpenAI Whisper API with verbose_json for detailed output
        // Note: verbose_json returns segments with timestamps
        const openai = getOpenAIClient();

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            language: options.language || undefined,
            response_format: 'verbose_json',
            prompt: options.prompt,
        } as any);

        // Type assertion for verbose_json response
        const verboseResponse = transcription as {
            text: string;
            language?: string;
            duration?: number;
            segments?: Array<{
                text: string;
                start: number;
                end: number;
            }>;
            words?: Array<{
                word: string;
                start: number;
                end: number;
            }>;
        };

        // Transform response to our format
        const result = {
            text: verboseResponse.text,
            language: verboseResponse.language || 'en',
            duration: verboseResponse.duration || 0,
            segments: (verboseResponse.segments || []).map((segment, index) => ({
                id: index,
                text: segment.text.trim(),
                startTime: segment.start,
                endTime: segment.end,
                words: (verboseResponse.words || [])
                    .filter(w => w.start >= segment.start && w.end <= segment.end)
                    .map(w => ({
                        word: w.word,
                        start: w.start,
                        end: w.end,
                    })),
            })),
        };

        logger.info({
            duration: result.duration,
            segments: result.segments.length,
        }, '[Transcription] Completed');

        return NextResponse.json(result);

    } catch (error) {
        logger.error({ error }, '[Transcription] Error');

        if (error instanceof OpenAI.APIError) {
            return NextResponse.json(
                { error: `OpenAI API error: ${error.message}` },
                { status: error.status || 500 }
            );
        }

        return NextResponse.json(
            { error: 'Transcription failed' },
            { status: 500 }
        );
    }
}
