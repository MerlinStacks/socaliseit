/**
 * Schedule Actions — Date parsing and schedule confirmation handlers.
 * Why: Extracted from compose-actions.ts (565→~350 lines) to isolate
 * scheduling-specific logic from draft/publish/delete flows.
 */

import { type MediaItem } from '@/components/compose/platform-editor';
import { toast } from '@/components/ui/toast';
import { deleteDraft } from '@/lib/offline-queue';
import { type AccountSettings } from '@/hooks/use-compose';
import { broadcastSync } from '@/lib/cross-tab-sync';
import { buildPostPayload, submitPost } from '@/lib/compose-actions';

/**
 * Parse a wall-clock date/time into a UTC Date, respecting the user's IANA timezone.
 *
 * Why (BUG-11 FIX): Previously used `new Date(year, month, day, hours, minutes)`
 * which resolves in the browser's system timezone. If the user travels (VPN) or
 * has a different system clock, posts schedule at wrong times. Now we detect the
 * IANA timezone via Intl and calculate the UTC offset explicitly, consistent
 * with the server-side `scheduleForWallClockTime()` in timezone-utils.ts.
 */
export function parseDateTimeLocal(date: string, time: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);

    // Why (BUG-48): Empty or malformed inputs produce NaN, which causes
    // `new Date()` to return Invalid Date and `toISOString()` to throw.
    if ([year, month, day, hours, minutes].some(isNaN)) {
        throw new Error('Invalid date or time input. Please select a valid date and time.');
    }

    // Why (BUG-AUDIT-7): Bounds validation — NaN check above only catches
    // non-numeric inputs. Values like month=15 or hours=25 are valid numbers
    // but produce unpredictable Date behaviour.
    if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Date or time values are out of range. Please select a valid date and time.');
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Build an ISO-like string for the target wall-clock time
    const pad = (n: number) => n.toString().padStart(2, '0');
    const targetStr = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;

    // Why (BUG-38): Parse as UTC first to avoid the browser silently shifting
    // non-existent DST gap times (e.g., 2:30 AM during spring-forward).
    // Then compute the TZ offset at this specific UTC instant.
    const asUtc = new Date(targetStr + 'Z');
    const utcStr = asUtc.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = asUtc.toLocaleString('en-US', { timeZone: timezone });
    const offsetMs = new Date(tzStr).getTime() - new Date(utcStr).getTime();

    return new Date(asUtc.getTime() - offsetMs);
}

/**
 * Handle schedule confirmation from the calendar modal
 * Supports both unified scheduling (all same time) and per-platform scheduling
 */
export async function handleScheduleConfirm(options: {
    schedules: Record<string, { date: string; time: string }> | null;
    unifiedDate: string;
    unifiedTime: string;
    caption: string;
    selectedAccountIds: string[];
    media: MediaItem[];
    firstComment: string;
    effectiveAccountSettings: Record<string, AccountSettings>;
    organizationId?: string;
    editPostId?: string | null;
    /** Why: Resized media per-account so each platform gets correctly sized images */
    resizedMediaMap?: Record<string, MediaItem[]>;
    setIsScheduleModalOpen: (value: boolean) => void;
    setIsScheduling: (value: boolean) => void;
    onMutate?: () => void;
    onSuccess: () => void;
}) {
    const {
        schedules,
        unifiedDate,
        unifiedTime,
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        organizationId,
        editPostId,
        resizedMediaMap,
        setIsScheduleModalOpen,
        setIsScheduling,
        onSuccess,
    } = options;

    setIsScheduleModalOpen(false);
    setIsScheduling(true);

    try {
        if (schedules === null) {
            // Unified scheduling: all platforms get the same time
            const scheduledDate = parseDateTimeLocal(unifiedDate, unifiedTime);
            const scheduledAt = scheduledDate.toISOString();

            const payload = buildPostPayload({
                caption,
                selectedAccountIds,
                media,
                firstComment,
                effectiveAccountSettings,
                scheduledAt,
                resizedMediaMap,
                // Why: autoPublish lives on per-platform settings; unified post is auto-publish
                // only when every selected account has the toggle enabled.
                autoPublish: selectedAccountIds.every(
                    id => effectiveAccountSettings[id]?.autoPublish !== false
                ),
            });

            const response = await submitPost(payload, editPostId);

            if (!response.ok) {
                // Why (BUG-39): Safe JSON parse — server may return non-JSON
                let errorMsg = `Failed to schedule post (HTTP ${response.status})`;
                try {
                    const error = await response.json();
                    errorMsg = error.error || errorMsg;
                } catch { /* non-JSON response body */ }
                throw new Error(errorMsg);
            }

            if (organizationId) {
                await deleteDraft(`draft-${organizationId}`);
            }

            const successMsg = editPostId ? 'Post updated' : 'Post scheduled';
            toast('success', successMsg, 'Your post will be published at the scheduled time.');
            broadcastSync(editPostId ? 'post:updated' : 'post:created');
            options.onMutate?.();
            onSuccess();
        } else {
            // Per-platform scheduling: each account gets individual time
            // Why: Per-platform scheduling creates new individual posts.
            // In edit mode this would leave the original post unchanged AND create
            // duplicates, which is never the user's intent.
            if (editPostId) {
                toast('error', 'Not supported', 'Per-platform scheduling is not available when editing a post. Use unified scheduling instead.');
                setIsScheduling(false);
                return;
            }
            const results = await Promise.allSettled(
                selectedAccountIds.map(async (accountId) => {
                    const schedule = schedules[accountId];
                    // Why (BUG-03): Previously returned undefined, which Promise.allSettled
                    // counted as fulfilled — inflating the success count in the toast.
                    if (!schedule) throw new Error(`No schedule set for account ${accountId}`);

                    const scheduledDate = parseDateTimeLocal(schedule.date, schedule.time);
                    const scheduledAt = scheduledDate.toISOString();

                    // Why (BUG-12): Previously this built an inline payload that skipped
                    // resizedMediaMap. Now uses buildPostPayload for consistency, ensuring
                    // each per-platform post gets its platform-specific resized media IDs.
                    const payload = buildPostPayload({
                        caption,
                        selectedAccountIds: [accountId],
                        media,
                        firstComment,
                        effectiveAccountSettings,
                        scheduledAt,
                        resizedMediaMap,
                        autoPublish: effectiveAccountSettings[accountId]?.autoPublish !== false,
                    });

                    const response = await fetch('/api/posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        // Why (BUG-39): Safe JSON parse — server may return non-JSON
                        let errorMsg = `Failed to schedule for account ${accountId} (HTTP ${response.status})`;
                        try {
                            const error = await response.json();
                            errorMsg = error.error || errorMsg;
                        } catch { /* non-JSON response body */ }
                        throw new Error(errorMsg);
                    }

                    return accountId;
                })
            );

            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                const successCount = results.length - failures.length;
                // Why (BUG-AUDIT-8): Include failed account details so the user
                // knows which ones to retry instead of a generic count.
                const failedReasons = failures
                    .map(f => (f as PromiseRejectedResult).reason?.message || 'Unknown error')
                    .join('; ');
                toast('warning', 'Partial success', `${successCount} of ${results.length} posts scheduled. Failed: ${failedReasons}`);
                // Why (BUG-33): Don't call onSuccess/onMutate here — navigating
                // away loses the user's draft for the failed platforms.
            } else {
                if (organizationId) {
                    await deleteDraft(`draft-${organizationId}`);
                }
                toast('success', 'Posts scheduled', `${results.length} posts scheduled with individual times.`);
                broadcastSync('post:created');
                options.onMutate?.();
                onSuccess();
            }
        }
    } catch (error) {
        toast('error', 'Schedule failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsScheduling(false);
    }
}
