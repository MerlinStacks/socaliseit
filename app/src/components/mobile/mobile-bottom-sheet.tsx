/**
 * Mobile Bottom Sheet Component
 * Draggable bottom sheet for mobile modals
 * 
 * Why: Bottom sheets are the standard mobile pattern for modals and pickers
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/use-haptic';

interface MobileBottomSheetProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Title shown in the header */
    title?: string;
    /** Snap points as percentages of viewport height */
    snapPoints?: number[];
    /** Initial snap point index */
    initialSnap?: number;
}

export function MobileBottomSheet({
    open,
    onClose,
    children,
    title,
    snapPoints = [50, 90],
    initialSnap = 0,
}: MobileBottomSheetProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    const [currentHeight, setCurrentHeight] = useState(snapPoints[initialSnap]);
    const [isDragging, setIsDragging] = useState(false);
    const [mounted, setMounted] = useState(false);
    const startY = useRef(0);
    const startHeight = useRef(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (open) {
            setCurrentHeight(snapPoints[initialSnap]);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [open, snapPoints, initialSnap]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        setIsDragging(true);
        startY.current = e.touches[0].clientY;
        startHeight.current = currentHeight;
    }, [currentHeight]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging) return;

        const deltaY = startY.current - e.touches[0].clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        const newHeight = Math.min(95, Math.max(10, startHeight.current + deltaPercent));
        setCurrentHeight(newHeight);
    }, [isDragging]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);

        // Snap to nearest snap point or close
        if (currentHeight < 20) {
            triggerHaptic('light');
            onClose();
            return;
        }

        // Find nearest snap point
        let nearestSnap = snapPoints[0];
        let minDiff = Math.abs(currentHeight - snapPoints[0]);

        for (const snap of snapPoints) {
            const diff = Math.abs(currentHeight - snap);
            if (diff < minDiff) {
                minDiff = diff;
                nearestSnap = snap;
            }
        }

        triggerHaptic('light');
        setCurrentHeight(nearestSnap);
    }, [currentHeight, snapPoints, onClose]);

    if (!mounted || !open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 transition-opacity"
                onClick={onClose}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                className={cn(
                    'absolute inset-x-0 bottom-0 rounded-t-2xl bg-[var(--bg-secondary)] shadow-2xl',
                    !isDragging && 'transition-[height] duration-300 ease-out'
                )}
                style={{
                    height: `${currentHeight}vh`,
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
            >
                {/* Drag Handle */}
                <div
                    className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className="h-1.5 w-12 rounded-full bg-[var(--border)]" />
                </div>

                {/* Header */}
                {title && (
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-4 pb-3">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="overflow-y-auto" style={{ height: `calc(100% - ${title ? '60px' : '20px'})` }}>
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
