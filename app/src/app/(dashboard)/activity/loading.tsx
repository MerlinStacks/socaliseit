import { ActivitySkeleton } from '@/components/activity/activity-timeline';

export default function ActivityLoading() {
    return <div className="mx-auto max-w-6xl p-4 md:p-8"><h1 className="mb-6 text-xl font-semibold">Activity log</h1><div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]"><ActivitySkeleton /></div></div>;
}
