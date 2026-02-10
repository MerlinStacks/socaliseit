'use client';

/**
 * Sentiment Sparkline
 * Tiny inline SVG area chart showing comment sentiment distribution over 7 days.
 * No external chart library — pure SVG for zero-cost bundle impact.
 */

import { useQuery } from '@tanstack/react-query';

interface DayData {
    date: string;
    positive: number;
    neutral: number;
    negative: number;
}

const WIDTH = 200;
const HEIGHT = 40;
const PADDING = 2;

/** Map raw data points to SVG Y coordinates */
function toPath(data: number[], maxVal: number): string {
    if (data.length === 0) return '';
    const stepX = (WIDTH - PADDING * 2) / Math.max(data.length - 1, 1);
    const points = data.map((val, i) => {
        const x = PADDING + i * stepX;
        const y = HEIGHT - PADDING - ((val / Math.max(maxVal, 1)) * (HEIGHT - PADDING * 2));
        return `${x},${y}`;
    });
    // Create closed area path: line across top, then back along bottom
    const bottomRight = `${PADDING + (data.length - 1) * stepX},${HEIGHT - PADDING}`;
    const bottomLeft = `${PADDING},${HEIGHT - PADDING}`;
    return `M${bottomLeft} L${points.join(' L')} L${bottomRight} Z`;
}

export function SentimentSparkline() {
    const { data, isLoading } = useQuery({
        queryKey: ['sentiment-trend'],
        queryFn: async () => {
            const res = await fetch('/api/comments/sentiment-trend');
            if (!res.ok) return [];
            const json = await res.json();
            return json.data as DayData[];
        },
        staleTime: 5 * 60_000, // 5 minutes
    });

    if (isLoading) {
        return (
            <div
                className="rounded-md animate-pulse"
                style={{ width: WIDTH, height: HEIGHT, background: 'var(--bg-tertiary)' }}
            />
        );
    }

    if (!data || data.length === 0) return null;

    const positive = data.map(d => d.positive);
    const negative = data.map(d => d.negative);
    const totals = data.map(d => d.positive + d.neutral + d.negative);
    const maxVal = Math.max(...totals, 1);
    const totalComments = totals.reduce((a, b) => a + b, 0);

    if (totalComments === 0) return null;

    return (
        <div className="flex items-center gap-3">
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                width={WIDTH}
                height={HEIGHT}
                className="shrink-0"
                style={{ borderRadius: 6 }}
            >
                {/* Positive area — green */}
                <path
                    d={toPath(positive, maxVal)}
                    fill="var(--success)"
                    opacity={0.35}
                />
                {/* Negative area — red */}
                <path
                    d={toPath(negative, maxVal)}
                    fill="var(--error)"
                    opacity={0.35}
                />
            </svg>
            <div className="flex gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                    {positive.reduce((a, b) => a + b, 0)}
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--error)' }} />
                    {negative.reduce((a, b) => a + b, 0)}
                </span>
            </div>
        </div>
    );
}
