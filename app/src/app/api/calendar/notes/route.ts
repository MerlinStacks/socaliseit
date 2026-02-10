/**
 * Calendar Notes API — list and create
 * Why: Provides CRUD for calendar day notes alongside scheduled posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfDay, endOfDay, addDays } from 'date-fns';
import { logger } from '@/lib/logger';

/**
 * GET /api/calendar/notes — fetch notes for a date range
 * Filters out private notes not owned by the requesting user
 */
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);

    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const start = startParam ? startOfDay(new Date(startParam)) : startOfDay(new Date());
    const end = endParam ? endOfDay(new Date(endParam)) : endOfDay(addDays(start, 6));

    const notes = await db.calendarNote.findMany({
        where: {
            organizationId,
            date: { gte: start, lte: end },
            OR: [
                { isPrivate: false },
                { isPrivate: true, createdById: userId },
            ],
        },
        orderBy: { date: 'asc' },
    });

    // Group notes by date for calendar rendering
    const userTimezone = searchParams.get('timezone') || 'UTC';
    const notesByDate: Record<string, Array<{
        id: string;
        title: string;
        description: string | null;
        date: string;
        color: string;
        isPrivate: boolean;
        createdById: string;
    }>> = {};

    notes.forEach(note => {
        const dateStr = note.date.toLocaleDateString('en-CA', { timeZone: userTimezone });
        if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
        notesByDate[dateStr].push({
            id: note.id,
            title: note.title,
            description: note.description,
            date: note.date.toISOString(),
            color: note.color,
            isPrivate: note.isPrivate,
            createdById: note.createdById,
        });
    });

    return NextResponse.json({ notes: notesByDate });
}

/**
 * POST /api/calendar/notes — create a new calendar note
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, description, date, color, isPrivate } = body;

        if (!title?.trim()) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        const note = await db.calendarNote.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                createdById: session.user.id,
                title: title.trim(),
                description: description?.trim() || null,
                date: new Date(date),
                color: color || '#D4A574',
                isPrivate: isPrivate ?? false,
            },
        });

        return NextResponse.json({ note }, { status: 201 });
    } catch (error) {
        logger.error({ error }, 'Failed to create calendar note');
        return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }
}
