/**
 * Team Management API Route
 * CRUD operations for workspace members
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/team - List team members for workspace
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;

    const members = await db.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true
                }
            }
        },
        orderBy: { joinedAt: 'asc' }
    });

    const formattedMembers = members.map(member => ({
        id: member.id,
        userId: member.user.id,
        name: member.user.name || 'Unknown',
        email: member.user.email,
        avatar: member.user.image,
        role: member.role.toLowerCase() as 'owner' | 'admin' | 'member' | 'viewer',
        status: 'active' as const,
        joinedAt: member.joinedAt.toISOString()
    }));

    return NextResponse.json({
        members: formattedMembers,
        total: members.length
    });
}

/**
 * POST /api/team - Invite a new team member
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Check if user has permission (owner or admin)
    const currentMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });

    if (!currentMember || !['OWNER', 'ADMIN'].includes(currentMember.role)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== 'string') {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Check if user exists
    const invitedUser = await db.user.findUnique({
        where: { email: email.toLowerCase() }
    });

    if (!invitedUser) {
        // In a full implementation, we would send an invite email here
        // For now, return a message indicating the user needs to register first
        return NextResponse.json({
            error: 'User not found. They need to register first.',
            invite_email_sent: false
        }, { status: 404 });
    }

    // Check if already a member
    const existingMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: invitedUser.id } }
    });

    if (existingMember) {
        return NextResponse.json({ error: 'User is already a member' }, { status: 400 });
    }

    // Add member
    const validRole = ['ADMIN', 'MEMBER', 'VIEWER'].includes(role?.toUpperCase())
        ? role.toUpperCase()
        : 'MEMBER';

    const member = await db.workspaceMember.create({
        data: {
            workspaceId,
            userId: invitedUser.id,
            role: validRole
        },
        include: {
            user: { select: { name: true, email: true, image: true } }
        }
    });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'invited',
            resourceType: 'team',
            resourceId: member.id,
            resourceName: invitedUser.email,
            details: `Role: ${validRole}`
        }
    });

    return NextResponse.json({
        id: member.id,
        name: member.user.name,
        email: member.user.email,
        avatar: member.user.image,
        role: member.role.toLowerCase(),
        status: 'active'
    }, { status: 201 });
}

/**
 * PATCH /api/team - Update member role
 */
export async function PATCH(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;

    // Check if user has permission
    const currentMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });

    if (!currentMember || !['OWNER', 'ADMIN'].includes(currentMember.role)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
        return NextResponse.json({ error: 'Member ID and role are required' }, { status: 400 });
    }

    // Verify member belongs to workspace
    const member = await db.workspaceMember.findFirst({
        where: { id: memberId, workspaceId }
    });

    if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Can't change owner role
    if (member.role === 'OWNER') {
        return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 });
    }

    const validRole = ['ADMIN', 'MEMBER', 'VIEWER'].includes(role.toUpperCase())
        ? role.toUpperCase()
        : member.role;

    await db.workspaceMember.update({
        where: { id: memberId },
        data: { role: validRole }
    });

    return NextResponse.json({ success: true, role: validRole.toLowerCase() });
}

/**
 * DELETE /api/team - Remove team member
 */
export async function DELETE(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    // Check if user has permission
    const currentMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } }
    });

    if (!currentMember || !['OWNER', 'ADMIN'].includes(currentMember.role)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('id');

    if (!memberId) {
        return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    // Verify member belongs to workspace
    const member = await db.workspaceMember.findFirst({
        where: { id: memberId, workspaceId },
        include: { user: { select: { email: true } } }
    });

    if (!member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Can't remove owner
    if (member.role === 'OWNER') {
        return NextResponse.json({ error: 'Cannot remove workspace owner' }, { status: 400 });
    }

    await db.workspaceMember.delete({ where: { id: memberId } });

    // Log activity
    await db.activity.create({
        data: {
            workspaceId,
            userId,
            userName,
            action: 'removed',
            resourceType: 'team',
            resourceId: memberId,
            resourceName: member.user.email
        }
    });

    return NextResponse.json({ success: true });
}
