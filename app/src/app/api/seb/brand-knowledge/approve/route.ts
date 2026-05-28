import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await db.sebBrandKnowledge.findUnique({ where: { organizationId } });
    if (!existing?.pendingInsights) {
        return NextResponse.json({ knowledge: existing, message: 'No pending Seb insights to approve' });
    }

    const previous = existing.learnedInsights && typeof existing.learnedInsights === 'object' ? existing.learnedInsights : {};
    const pending = existing.pendingInsights && typeof existing.pendingInsights === 'object' ? existing.pendingInsights : {};
    const pendingRecord = pending as Record<string, unknown>;
    const textField = (field: string, current?: string | null) => {
        const value = pendingRecord[field];
        return current || (typeof value === 'string' && value.trim() ? value : undefined);
    };

    const knowledge = await db.sebBrandKnowledge.update({
        where: { organizationId },
        data: {
            learnedInsights: { ...previous, ...pending },
            audience: textField('audience', existing.audience),
            positioning: textField('positioning', existing.positioning),
            products: textField('products', existing.products),
            offers: textField('offers', existing.offers),
            voiceRules: textField('voiceRules', existing.voiceRules),
            bannedTopics: textField('bannedTopics', existing.bannedTopics),
            pendingInsights: Prisma.JsonNull,
        },
    });

    return NextResponse.json({ knowledge });
}
