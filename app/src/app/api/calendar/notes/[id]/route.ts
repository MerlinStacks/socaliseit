/**
 * Calendar Notes API — update and delete individual notes
 * Why: Allows note owners (or org admins) to manage their notes
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

interface RouteContext {
    params: Promise<{ id: string }>;
}

/**
 * Verify the user can modify this note (must be creator or org admin/owner)
 */
async function authorizeNoteAccess(noteId: string, organizationId: string, userId: string) {
    const note = await db.calendarNote.findFirst({
        where: { id: noteId, organizationId },
    });

    if (!note) return { authorized: false, note: null, reason: 'Note not found' };

    if (note.createdById === userId) return { authorized: true, note, reason: null };

    // Check if user is admin/owner of the org
    const membership = await db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
    });

    const isAdmin = membership && ['OWNER', 'ADMIN'].includes(membership.role);
    if (!isAdmin) return { authorized: false, note, reason: 'Only the creator or an admin can modify this note' };

    return { authorized: true, note, reason: null };
}

/**
 * PATCH /api/calendar/notes/:id — update a note
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { authorized, reason } = await authorizeNoteAccess(
        id, session.user.currentOrganizationId, session.user.id
    );

    if (!authorized) {
        return NextResponse.json({ error: reason }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { title, description, date, color, isPrivate } = body;

        const updateData: Record<string, unknown> = {};
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (date !== undefined) updateData.date = new Date(date);
        if (color !== undefined) updateData.color = color;
        if (isPrivate !== undefined) updateData.isPrivate = isPrivate;

        const note = await db.calendarNote.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ note });
    } catch (error) {
        logger.error({ error }, 'Failed to update calendar note');
        return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    }
}

/**
 * DELETE /api/calendar/notes/:id — delete a note
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { authorized, reason } = await authorizeNoteAccess(
        id, session.user.currentOrganizationId, session.user.id
    );

    if (!authorized) {
        return NextResponse.json({ error: reason }, { status: 403 });
    }

    try {
        await db.calendarNote.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error({ error }, 'Failed to delete calendar note');
        return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }
}
