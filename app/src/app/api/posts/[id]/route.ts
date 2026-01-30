/**
 * Single Post API Routes
 * GET, PUT, DELETE for individual posts
 */

import { NextRequest, NextResponse } from 'next/server';

// GET /api/posts/[id] - Get single post
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // Mock data
    const post = {
        id,
        caption: 'New summer collection just dropped! 🌴',
        platforms: ['instagram', 'tiktok'],
        mediaIds: ['media_1', 'media_2'],
        status: 'scheduled',
        scheduledAt: '2024-01-25T10:00:00Z',
        pillar: 'Promotional',
        hashtags: ['summer', 'newcollection', 'fashion'],
        createdAt: '2024-01-20T12:00:00Z',
        updatedAt: '2024-01-20T12:00:00Z',
        analytics: {
            reach: 0,
            engagement: 0,
            clicks: 0,
        },
    };

    return NextResponse.json(post);
}

// PUT /api/posts/[id] - Update post
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    const { caption, platforms, mediaIds, scheduledAt, pillar, hashtags, status } = body;

    // Validate
    if (status === 'published') {
        return NextResponse.json(
            { error: 'Cannot update published posts' },
            { status: 400 }
        );
    }

    // Update post
    const updatedPost = {
        id,
        caption,
        platforms,
        mediaIds,
        scheduledAt,
        pillar,
        hashtags,
        status,
        updatedAt: new Date().toISOString(),
    };

    // In production, update database

    return NextResponse.json(updatedPost);
}

// DELETE /api/posts/[id] - Delete post
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // In production:
    // 1. Check if post is published (maybe prevent deletion)
    // 2. Delete from database
    // 3. Log activity

    return NextResponse.json({ success: true, deletedId: id });
}

