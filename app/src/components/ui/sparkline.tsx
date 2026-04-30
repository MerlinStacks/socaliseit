/**
 * Sparkline Component
 * Minimal SVG micro-chart for inline trend visualization
 * Why: Shows historical data patterns at a glance without taking up space
 */

import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    strokeWidth?: number;
    className?: string;
    /** Use gradient stroke (gold to pink) */
    useGradient?: boolean;
}

/**
 * Minimal SVG sparkline chart.
 * Automatically scales to fit data.
 */
export function Sparkline({
    data,
    width = 80,
    height = 24,
    strokeWidth = 2,
    className,
    useGradient = true,
}: SparklineProps) {
    const gradientId = `sparkline-gradient-${useId()}`;

    // Generate SVG path from data points
    const { path, fillPath } = useMemo(() => {
        if (!data || data.length < 2) return { path: '', fillPath: '' };

        const max = Math.max(...data, 1); // Avoid division by zero
        const min = Math.min(...data, 0);
        const range = max - min || 1;

        const padding = 2;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;

        const points = data.map((value, index) => {
            const x = padding + (index / (data.length - 1)) * chartWidth;
            const y = padding + chartHeight - ((value - min) / range) * chartHeight;
            return { x, y };
        });

        // Create line path
        const linePath = points
            .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
            .join(' ');

        // Create fill path (closed area under the line)
        const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;

        return { path: linePath, fillPath: areaPath };
    }, [data, width, height]);

    if (!data || data.length < 2) {
        return (
            <div
                className={cn('flex items-center justify-center text-[var(--text-muted)]', className)}
                style={{ width, height }}
            >
                <span className="text-[10px]">No data</span>
            </div>
        );
    }

    return (
        <svg
            width={width}
            height={height}
            className={cn('overflow-visible', className)}
            viewBox={`0 0 ${width} ${height}`}
        >
            <defs>
                {useGradient && (
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--accent-gold)" />
                        <stop offset="100%" stopColor="var(--accent-pink)" />
                    </linearGradient>
                )}
                <linearGradient id={`${gradientId}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
                </linearGradient>
            </defs>

            {/* Area fill */}
            <path
                d={fillPath}
                fill={`url(#${gradientId}-fill)`}
            />

            {/* Line */}
            <path
                d={path}
                fill="none"
                stroke={useGradient ? `url(#${gradientId})` : 'var(--accent-gold)'}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
