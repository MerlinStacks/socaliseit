import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/auth/with-permission';
import { analyzeListeningContent, matchTerms } from './listening-analysis';

/** Every ingestion, opt-in transition and flush takes this same tenant-scoped lock. */
export async function lockListeningMonitor(tx: Prisma.TransactionClient, organizationId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM "SocialListeningMonitor" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
    return tx.socialListeningMonitor.findFirst({ where: { id, organizationId } });
}

export async function ingestListeningItem(args: Prisma.SocialListeningItemUpsertArgs, publishedAt?: Date, relevanceText?: string) {
    const organizationId = args.create.organizationId!;
    const monitorId = args.create.monitorId!;
    return db.$transaction(async (tx) => {
        const monitor = await lockListeningMonitor(tx, organizationId, monitorId);
        if (!monitor?.isActive) return;
        if (monitor.platforms.length && !monitor.platforms.includes(args.create.platform)) return;
        const content = args.create.content;
        const matchedKeywords = matchTerms(relevanceText ?? content, monitor.keywords, monitor.excludedTerms, monitor.matchMode);
        if (!matchedKeywords.length) return;
        const analysis = analyzeListeningContent(content);
        const alertPending = !!(monitor.alertsEnabled && monitor.alertsEnabledAt &&
            (analysis.sentiment === 'negative' || analysis.isQuestion) &&
            (!publishedAt || publishedAt >= monitor.alertsEnabledAt));
        // The parent row lock serializes competing upserts, avoiding Prisma's
        // emulated-upsert create conflict. Updates may cancel eligibility, but
        // can never re-arm an item that was ineligible or already consumed.
        return tx.socialListeningItem.upsert({ ...args,
            create: { ...args.create, ...analysis, matchedKeywords, alertPending },
            update: { ...args.update, ...analysis, matchedKeywords, ...(!alertPending && { alertPending: false }) },
        });
    });
}

export async function flushListeningAlerts(organizationId: string) {
    const monitors = await db.socialListeningMonitor.findMany({ where: { organizationId, alertsEnabled: true, isActive: true }, select: { id: true } });
    let notifications = 0;
    for (const { id } of monitors) {
        notifications += await db.$transaction(async (tx) => {
            const monitor = await lockListeningMonitor(tx, organizationId, id);
            const now = new Date();
            if (!monitor?.isActive || !monitor.alertsEnabled || !monitor.alertsEnabledAt || (monitor.nextAlertAt && monitor.nextAlertAt > now)) return 0;
            const where = { organizationId, monitorId: id, alertPending: true };
            // Delivery uses current stored analysis, not the original signal.
            // Also discard markers left by older overly broad ingestion code.
            const count = await tx.socialListeningItem.count({ where: {
                ...where, OR: [{ sentiment: 'negative' }, { isQuestion: true }],
            } });
            if (!count) {
                await tx.socialListeningItem.updateMany({ where, data: { alertPending: false } });
                return 0;
            }
            const members = await tx.organizationMember.findMany({ where: { organizationId }, include: {
                customRole: { include: { permissions: { include: { permission: true } } } },
            } });
            const vetoes = await tx.notificationSettings.findMany({ where: { organizationId, listeningAlerts: false }, select: { userId: true } });
            const veto = new Set(vetoes.map((setting) => setting.userId));
            const recipients = members.filter((member) => !veto.has(member.userId) && (member.role === 'CUSTOM'
                ? member.customRole?.permissions.some((entry) => entry.permission.code === PERMISSIONS.DISCOVERY_VIEW)
                : DEFAULT_ROLE_PERMISSIONS[member.role].includes(PERMISSIONS.DISCOVERY_VIEW)));
            if (recipients.length) await tx.notification.createMany({ data: recipients.map(({ userId }) => ({
                organizationId, userId, type: 'info', title: 'New listening matches',
                message: `${count} new ${count === 1 ? 'match' : 'matches'} for ${monitor.name}.`,
                link: `/listening?monitorId=${encodeURIComponent(id)}`,
            })) });
            // No eligible recipients is a consumed batch, never a future replay.
            await tx.socialListeningItem.updateMany({ where, data: { alertPending: false } });
            await tx.socialListeningMonitor.update({ where: { id, organizationId }, data: {
                nextAlertAt: new Date(now.getTime() + monitor.alertCooldownMinutes * 60_000),
            } });
            return recipients.length;
        });
    }
    return { notifications };
}
