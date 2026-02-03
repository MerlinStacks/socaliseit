/**
 * Optimal Posting Times API Route
 * Calculates best posting times based on historical analytics
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { subDays } from 'date-fns';

interface TimeSuggestion {
    time: string;      // "HH:MM" format
    label: string;     // "7:30 PM"
    lift: number;      // % lift vs average
}

interface OptimalTimesResponse {
    suggestions: TimeSuggestion[];
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Format 24-hour time to 12-hour label
 */
function formatTimeLabel(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const minuteStr = minute.toString().padStart(2, '0');
    return `${hour12}:${minuteStr} ${period}`;
}

/**
 * GET /api/analytics/optimal-times
 * Returns AI-suggested optimal posting times based on historical data
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    // Get published posts from the last 30 days
    const thirtyDaysAgo = subDays(new Date(), 30);

    const publishedPosts = await db.post.findMany({
        where: {
            workspaceId,
            status: 'PUBLISHED',
            publishedAt: {
                gte: thirtyDaysAgo,
            },
        },
        select: {
            id: true,
            publishedAt: true,
        },
    });

    const dataPoints = publishedPosts.length;

    // Determine confidence based on data volume
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (dataPoints >= 30) {
        confidence = 'high';
    } else if (dataPoints >= 10) {
        confidence = 'medium';
    }

    // If not enough data, return empty suggestions
    if (dataPoints < 5) {
        return NextResponse.json({
            suggestions: [],
            dataPoints,
            confidence: 'low',
        } as OptimalTimesResponse);
    }

    // Group posts by hour of day (rounded to 30-min slots)
    const hourSlots: Record<string, number> = {};
    let totalPosts = 0;

    for (const post of publishedPosts) {
        if (!post.publishedAt) continue;

        const hour = post.publishedAt.getHours();
        const minute = post.publishedAt.getMinutes() < 30 ? 0 : 30;
        const slotKey = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

        hourSlots[slotKey] = (hourSlots[slotKey] || 0) + 1;
        totalPosts++;
    }

    // Calculate average posts per slot
    const slotCount = Object.keys(hourSlots).length;
    const averagePerSlot = totalPosts / Math.max(slotCount, 1);

    // Find top performing time slots
    const sortedSlots = Object.entries(hourSlots)
        .map(([time, count]) => ({
            time,
            count,
            lift: Math.round(((count - averagePerSlot) / Math.max(averagePerSlot, 1)) * 100),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

    // Format suggestions
    const suggestions: TimeSuggestion[] = sortedSlots
        .filter((slot) => slot.lift > 0) // Only show slots with positive lift
        .map((slot) => {
            const [hourStr, minuteStr] = slot.time.split(':');
            const hour = parseInt(hourStr, 10);
            const minute = parseInt(minuteStr, 10);

            return {
                time: slot.time,
                label: formatTimeLabel(hour, minute),
                lift: Math.min(slot.lift, 100), // Cap at 100%
            };
        });

    // If no slots have positive lift, suggest common best times
    if (suggestions.length === 0 && dataPoints >= 5) {
        suggestions.push({
            time: '19:30',
            label: '7:30 PM',
            lift: 0,
        });
    }

    return NextResponse.json({
        suggestions,
        dataPoints,
        confidence,
    } as OptimalTimesResponse);
}
