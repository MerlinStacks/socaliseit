/**
 * Dashboard home page
 * Why: The header and quick-action buttons need zero data — they render
 * instantly from session data alone. Only the data-heavy cards
 * (posts, stats, activity) are deferred behind Suspense.
 *
 * Before: Everything behind one Suspense → user sees skeleton for header + data
 * After:  Header + buttons render INSTANTLY → data streams in below
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardData } from './dashboard-data';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, Sparkles } from 'lucide-react';
import { SkeletonCard } from '@/components/ui/skeleton';

/**
 * Skeleton for the data sections only (shown below the instant header).
 * Why: The header and buttons are already visible, so this skeleton
 * only covers the cards/stats area.
 */
function DashboardDataSkeleton() {
    return (
        <>
            {/* Platform Activity Banner skeleton */}
            <div className="skeleton h-16 w-full rounded-xl mb-6" />

            {/* Main Grid */}
            <div className="grid grid-cols-2 gap-5">
                <SkeletonCard />
                <SkeletonCard />
            </div>

            {/* Two Column */}
            <div className="grid grid-cols-3 gap-5 mt-6">
                <div className="col-span-2">
                    <SkeletonCard className="h-48" />
                </div>
                <div>
                    <SkeletonCard className="h-48" />
                </div>
            </div>
        </>
    );
}

export default async function DashboardPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;
    const userName = session.user.name?.split(' ')[0] || 'there';

    return (
        <div className="p-8">
            {/* ── Instant Shell (no data needed) ─────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Welcome back, {userName}!</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Here&apos;s what&apos;s happening with your social media
                    </p>
                </div>
            </div>

            <div className="flex gap-3 mb-6">
                <Link href="/compose">
                    <Button>
                        <Plus className="h-4 w-4" />
                        New Post
                    </Button>
                </Link>
                <Link href="/calendar">
                    <Button variant="secondary">
                        <Calendar className="h-4 w-4" />
                        View Calendar
                    </Button>
                </Link>
                <Link href="/compose?ai=true">
                    <Button variant="secondary">
                        <Sparkles className="h-4 w-4" />
                        AI Generate
                    </Button>
                </Link>
            </div>

            {/* ── Streamed Data (DB queries deferred via Suspense) ──── */}
            <Suspense fallback={<DashboardDataSkeleton />}>
                <DashboardData
                    organizationId={organizationId}
                    userName={userName}
                />
            </Suspense>
        </div>
    );
}
