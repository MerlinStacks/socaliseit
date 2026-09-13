import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PRESENCE_TTL_SECONDS = 45;
export const MAX_PRESENCE_LEASES = 200;
export const presenceStateSchema = z.enum(['viewing', 'replying', 'noting']);
const identifier = z.string().trim().min(1).max(256);
export const presenceItemSchema = z.object({
    id: identifier,
    type: z.enum(['comment', 'mention', 'dm', 'review']),
    socialAccountId: identifier,
}).strict();
export const presenceReleaseSchema = presenceItemSchema.extend({ tabId: z.string().uuid().transform((v) => v.toLowerCase()) });
export const presenceHeartbeatSchema = presenceReleaseSchema.extend({ state: presenceStateSchema });
export type PresenceState = z.infer<typeof presenceStateSchema>;
export type PresenceKey = { organizationId: string; socialAccountId: string; type: string; entityId: string };
export type PresenceOperation = { kind: 'get' } | { kind: 'put'; tabId: string; state: PresenceState } | { kind: 'delete'; tabId: string };

/** Length-safe tuple hashing and a shared Redis Cluster slot for both keys. */
export function presenceKeys(key: PresenceKey) {
    const digest = createHash('sha256').update(JSON.stringify([
        key.organizationId, key.socialAccountId, key.type, key.entityId,
    ])).digest('hex');
    return [`inbox:presence:v1:{${digest}}:leases`, `inbox:presence:v1:{${digest}}:expiry`] as const;
}

export function presenceLeaseId(userId: string, tabId: string) {
    return JSON.stringify([userId, tabId]);
}

const storedLeaseSchema = z.object({
    userId: z.string().min(1).max(256), name: z.string().max(256), state: presenceStateSchema,
    updatedAt: z.number().int().nonnegative(),
}).strict();
export type PresenceLease = z.infer<typeof storedLeaseSchema>;
export type PresenceParticipant = { userId: string; name: string; state: PresenceState; updatedAt: string };
const priority: Record<PresenceState, number> = { viewing: 0, noting: 1, replying: 2 };

/** Highest activity wins; updatedAt/name come from the newest lease at that priority. */
export function groupPresence(leases: PresenceLease[], currentUserId: string, now: number): PresenceParticipant[] {
    const users = new Map<string, PresenceLease>();
    for (const lease of leases) {
        if (lease.userId === currentUserId || lease.updatedAt + PRESENCE_TTL_SECONDS * 1000 <= now) continue;
        const previous = users.get(lease.userId);
        if (!previous || priority[lease.state] > priority[previous.state]
            || (lease.state === previous.state && lease.updatedAt > previous.updatedAt)) users.set(lease.userId, lease);
    }
    return [...users.values()].sort((a, b) => a.userId.localeCompare(b.userId)).map((lease) => ({
        ...lease, updatedAt: new Date(lease.updatedAt).toISOString(),
    }));
}

/** Corrupt/unexpected Redis responses must fail explicitly, never look like an empty inbox. */
export function decodePresence(result: unknown, currentUserId: string) {
    const [now, ...rows] = z.array(z.string()).min(1).max(MAX_PRESENCE_LEASES + 1).parse(result);
    const timestamp = z.number().int().nonnegative().parse(Number(now));
    const leases = rows.map((row) => storedLeaseSchema.parse(JSON.parse(row)));
    return { participants: groupPresence(leases, currentUserId, timestamp), ttlSeconds: PRESENCE_TTL_SECONDS };
}
