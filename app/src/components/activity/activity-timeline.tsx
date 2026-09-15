import { Activity, FileText, ImageIcon, Users, Link2, Layers, Zap } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { activityLabel, type ActivityItem } from './activity-utils';

/** Group by the viewer's local calendar day, including across pagination boundaries. */
export function ActivityTimeline({ activities }: { activities: ActivityItem[] }) {
    const groups = new Map<string, ActivityItem[]>();
    for (const item of activities) {
        const key = format(new Date(item.createdAt), 'yyyy-MM-dd');
        groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const icons: Record<string, typeof Activity> = { post: FileText, media: ImageIcon, account: Link2, team: Users, pillar: Layers, automation: Zap };
    return <div className="px-4 pb-2 sm:px-6">
        {[...groups.entries()].map(([day, items]) => {
            const date = new Date(items[0].createdAt);
            const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, d MMMM yyyy');
            return <section key={day} aria-label={label}>
                <h4 className="flex items-center gap-3 py-5 text-xs font-semibold text-[var(--text-muted)]">{label}<span className="h-px flex-1 bg-[var(--border)]" /><span className="tabular-nums">{items.length}</span></h4>
                <ol>
                    {items.map(item => {
                        const Icon = icons[item.resourceType] ?? Activity;
                        const action = item.action.split('.').pop()?.replace(/[_-]/g, ' ');
                        return <li key={item.id} className="group relative flex gap-3 pb-6 last:pb-2 sm:gap-4">
                            <div className="absolute bottom-0 left-[17px] top-10 w-px bg-[var(--border)] group-last:hidden" />
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]"><Icon aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" /></div>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <p className="min-w-0 break-words text-sm"><span className="font-semibold">{item.user.name}</span> <span className="text-[var(--text-secondary)]">{action}</span></p>
                                    <time dateTime={item.createdAt} title={format(new Date(item.createdAt), 'PPpp')} className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{format(new Date(item.createdAt), 'p')}</time>
                                </div>
                                <p className="mt-1 break-words text-sm text-[var(--text-secondary)]">{item.resourceName || 'Unnamed resource'}</p>
                                {item.details && <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-[var(--border)] pl-3 text-xs leading-relaxed text-[var(--text-muted)]">{item.details}</p>}
                                <span className="mt-2 inline-block rounded-md bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{activityLabel(item.resourceType)}</span>
                            </div>
                        </li>;
                    })}
                </ol>
            </section>;
        })}
    </div>;
}

export function ActivitySkeleton() {
    return <div role="status" aria-label="Loading activity" className="space-y-6 p-6 motion-safe:animate-pulse">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex gap-4"><div className="h-9 w-9 shrink-0 rounded-xl bg-[var(--bg-tertiary)]" /><div className="flex-1 space-y-3"><div className="h-3 w-2/5 rounded bg-[var(--bg-tertiary)]" /><div className="h-3 w-3/4 rounded bg-[var(--bg-tertiary)]" /><div className="h-2 w-20 rounded bg-[var(--bg-tertiary)]" /></div></div>)}
    </div>;
}
