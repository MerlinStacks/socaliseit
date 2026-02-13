/**
 * Settings loading skeleton
 */
import { SkeletonCard } from '@/components/ui/skeleton';

export default function SettingsLoading() {
    return (
        <div className="p-8 animate-in fade-in duration-150">
            <div className="skeleton h-8 w-28 mb-6" />
            <div className="space-y-6">
                <SkeletonCard className="h-32" />
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-32" />
            </div>
        </div>
    );
}
