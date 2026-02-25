/**
 * Content Type Breakdown Chart
 * Horizontal bar chart showing avg engagement rate by post type (Feed, Reel, etc.)
 *
 * Why: Users need to know which content format drives the best engagement
 * so they can double-down on what works.
 */

'use client';

import { Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ContentTypeStats } from '@/app/(dashboard)/analytics/analytics-data';

interface ContentTypeChartProps {
    data: ContentTypeStats[];
}

/** Map post type names to colours */
const TYPE_COLORS: Record<string, string> = {
    Feed: 'bg-blue-500',
    Reel: 'bg-pink-500',
    Story: 'bg-amber-500',
    Carousel: 'bg-purple-500',
    Video: 'bg-red-500',
    Article: 'bg-cyan-500',
    Short: 'bg-green-500',
};

/**
 * Renders a horizontal bar chart of avg engagement by content type.
 */
export function ContentTypeChart({ data }: ContentTypeChartProps) {
    if (data.length === 0) {
        return (
            <div className="card p-5">
                <h3 className="font-semibold mb-1">Content Type Performance</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">Avg engagement by format</p>
                <div className="flex h-32 items-center justify-center">
                    <div className="text-center">
                        <Layers className="h-8 w-8 mx-auto text-[var(--text-muted)] mb-2" />
                        <p className="text-sm text-[var(--text-muted)]">No published posts yet</p>
                    </div>
                </div>
            </div>
        );
    }

    const maxEngagement = Math.max(...data.map(d => d.avgEngagement), 0.01);

    return (
        <div className="card p-5">
            <h3 className="font-semibold mb-1">Content Type Performance</h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">Avg engagement by format</p>

            <div className="space-y-4">
                {data.map(item => {
                    const barWidth = Math.max((item.avgEngagement / maxEngagement) * 100, 4);
                    const colorClass = TYPE_COLORS[item.postType] || 'bg-gray-500';

                    return (
                        <motion.div
                            key={item.postType}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: item.postType.length * 0.05 }}
                            whileHover={{ scale: 1.02, x: 5 }}
                            className="group p-2 rounded-lg hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                        >
                            <div className="flex items-center justify-between text-sm mb-1.5">
                                <div className="flex items-center gap-2">
                                    <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                                    <span className="font-medium">{item.postType}</span>
                                    <span className="text-[var(--text-muted)]">({item.count})</span>
                                </div>
                                <span className="font-bold">{item.avgEngagement.toFixed(2)}%</span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                                <div
                                    className={`h-full rounded-full ${colorClass} transition-all duration-500`}
                                    style={{ width: `${barWidth}%` }}
                                />
                            </div>
                            <div className="mt-1 flex gap-3 text-xs text-[var(--text-muted)]">
                                <span>❤ {item.totalLikes.toLocaleString()}</span>
                                <span>💬 {item.totalComments.toLocaleString()}</span>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
