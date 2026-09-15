/** Workspace-scoped content pillars and one-time starter-set lifecycle. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { safeParseJson } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

const fields = z.object({
    name: z.string().trim().min(1).max(100).transform(name => name.replace(/\s+/g, ' ')),
    description: z.string().trim().max(2000).nullable().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    icon: z.string().trim().max(100).nullable().optional(),
}).strict();
const patchFields = fields.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one field');
const pillarIdSchema = z.string().trim().min(1).max(200);

class MutationError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

/** GET /api/pillars - Statistics and lifecycle eligibility (not context readiness). */
export async function GET() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;
    const [pillars, organization] = await Promise.all([
        db.contentPillar.findMany({
            where: { organizationId },
            orderBy: { name: 'asc' },
            include: { _count: { select: { posts: true } } },
        }),
        db.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { pillarsInitializedAt: true },
        }),
    ]);
    const totalPosts = pillars.reduce((sum, pillar) => sum + pillar._count.posts, 0);
    return NextResponse.json({
        pillars: pillars.map(pillar => ({
            id: pillar.id,
            name: pillar.name,
            description: pillar.description,
            color: pillar.color,
            icon: pillar.icon,
            createdBySeb: pillar.createdBySeb,
            posts: pillar._count.posts,
            percentage: totalPosts > 0 ? Math.round((pillar._count.posts / totalPosts) * 100) : 0,
        })),
        total: pillars.length,
        initialization: {
            initializedAt: organization.pillarsInitializedAt,
            eligibleForStarterSet: organization.pillarsInitializedAt === null && pillars.length === 0,
        },
    });
}

/** Manual writes claim the organization row before reading or mutating pillars. */
async function mutate(request: NextRequest, operation: 'create' | 'update' | 'delete') {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;
    let pillarId: string | undefined;
    if (operation !== 'create') {
        const parsedId = pillarIdSchema.safeParse(new URL(request.url).searchParams.get('id'));
        if (!parsedId.success) {
            return NextResponse.json({ error: 'Pillar ID is required' }, { status: 400 });
        }
        pillarId = parsedId.data;
    }
    let data: z.infer<typeof fields> | z.infer<typeof patchFields> = {};
    if (operation !== 'delete') {
        const body = await safeParseJson(request);
        if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
        const parsed = (operation === 'create' ? fields : patchFields).safeParse(body.data);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        data = parsed.data;
    }

    try {
        const pillar = await db.$transaction(async tx => {
            // Unconditional update locks the same row as Seb's CAS, including after deletion.
            // Throwing below rolls this marker back alongside any failed pillar mutation.
            await tx.organization.update({
                where: { id: organizationId },
                data: { pillarsInitializedAt: new Date() },
            });
            const existing = operation === 'create' ? null : await tx.contentPillar.findFirst({
                where: { id: pillarId, organizationId },
            });
            if (operation !== 'create' && !existing) throw new MutationError('Pillar not found', 404);

            if (data.name !== undefined) {
                // Normalize legacy whitespace too; all manual writers serialize on the org row.
                const siblings = await tx.contentPillar.findMany({ where: { organizationId }, select: { id: true, name: true } });
                const normalized = data.name.toLowerCase();
                if (siblings.some(p => p.id !== pillarId && p.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalized)) {
                    throw new MutationError('A pillar with this name already exists', 400);
                }
            }

            const result = operation === 'create'
                ? await tx.contentPillar.create({ data: {
                    ...data, organizationId, name: data.name!, color: data.color ?? '#D4A574', createdBySeb: false,
                } })
                : operation === 'update'
                    ? await tx.contentPillar.update({ where: { id: pillarId, organizationId }, data })
                    : await tx.contentPillar.delete({ where: { id: pillarId, organizationId } });

            await tx.activity.create({ data: {
                organizationId,
                userId: session.user.id,
                userName: session.user.name || 'Unknown',
                action: operation === 'create' ? 'created' : operation === 'update' ? 'updated' : 'deleted',
                resourceType: 'pillar',
                resourceId: result.id,
                resourceName: result.name,
            } });
            return result;
        });
        return NextResponse.json(operation === 'delete' ? { success: true } : pillar, { status: operation === 'create' ? 201 : 200 });
    } catch (error) {
        if (error instanceof MutationError) return NextResponse.json({ error: error.message }, { status: error.status });
        throw error;
    }
}

export async function POST(request: NextRequest) { return mutate(request, 'create'); }
/** PATCH /api/pillars?id=... - Edit an existing workspace pillar without replacing its identity. */
export async function PATCH(request: NextRequest) { return mutate(request, 'update'); }
export async function DELETE(request: NextRequest) { return mutate(request, 'delete'); }
