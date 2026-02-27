/**
 * FocalPointPicker Component
 * Why: When images are displayed with `object-cover` in platform previews,
 * the default crop centers on 50/50. This lets users drag a pin to choose
 * which part of the image is the focal point, so the important subject
 * isn't cropped out.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, RotateCcw, Check, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaItem } from './platform-editor';

interface FocalPointPickerProps {
    /** The media item to set the focal point on */
    media: MediaItem;
    /** Called when the user confirms the focal point */
    onConfirm: (focalPoint: { x: number; y: number }) => void;
    /** Called when the user cancels */
    onClose: () => void;
}

/**
 * Modal overlay that shows the full image with a draggable focal point crosshair.
 * A live preview pane shows how the image will appear with `object-cover` at
 * the chosen position.
 */
export function FocalPointPicker({ media, onConfirm, onClose }: FocalPointPickerProps) {
    const [point, setPoint] = useState<{ x: number; y: number }>(
        media.focalPoint ?? { x: 50, y: 50 }
    );
    const [isDragging, setIsDragging] = useState(false);
    const imageRef = useRef<HTMLDivElement>(null);

    /**
     * Convert a mouse/touch event to focal point percentages
     * Why: Map pointer position relative to the image container to 0–100 range
     */
    const eventToPoint = useCallback((clientX: number, clientY: number) => {
        const rect = imageRef.current?.getBoundingClientRect();
        if (!rect) return null;

        const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        const p = eventToPoint(e.clientX, e.clientY);
        if (p) setPoint(p);
    }, [eventToPoint]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        const p = eventToPoint(e.clientX, e.clientY);
        if (p) setPoint(p);
    }, [isDragging, eventToPoint]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    /** Close on Escape */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isDefault = point.x === 50 && point.y === 50;
    const imgSrc = media.thumbnailUrl || media.url;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative flex w-full max-w-2xl flex-col gap-4 rounded-2xl bg-[var(--bg-primary)] p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Crosshair className="h-4 w-4 text-[var(--accent-gold)]" />
                        <h3 className="text-sm font-semibold">Set Focal Point</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <p className="text-xs text-[var(--text-muted)]">
                    Click or drag on the image to set where the focal point should be. This controls which part of the image stays visible when cropped in previews.
                </p>

                <div className="flex gap-4 flex-col sm:flex-row">
                    {/* Full image with crosshair */}
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                            Original Image
                        </div>
                        <div
                            ref={imageRef}
                            className={cn(
                                'relative overflow-hidden rounded-xl bg-[var(--bg-tertiary)] select-none',
                                isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
                            )}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            style={{ touchAction: 'none' }}
                        >
                            <img
                                src={imgSrc}
                                alt="Set focal point"
                                className="w-full h-auto block"
                                draggable={false}
                            />

                            {/* Dimmed overlay with cutout effect */}
                            <div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    background: `radial-gradient(circle 40px at ${point.x}% ${point.y}%, transparent 0%, rgba(0,0,0,0.4) 100%)`,
                                }}
                            />

                            {/* Crosshair pin */}
                            <div
                                className="absolute pointer-events-none"
                                style={{
                                    left: `${point.x}%`,
                                    top: `${point.y}%`,
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                {/* Outer ring */}
                                <div className="h-8 w-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                                    {/* Inner dot */}
                                    <div className="h-2 w-2 rounded-full bg-white shadow-sm" />
                                </div>
                                {/* Crosshair lines */}
                                <div className="absolute top-1/2 left-[-8px] w-[calc(100%+16px)] h-px bg-white/60" />
                                <div className="absolute left-1/2 top-[-8px] h-[calc(100%+16px)] w-px bg-white/60" />
                            </div>
                        </div>
                    </div>

                    {/* Live crop preview */}
                    <div className="w-full sm:w-[160px] flex-shrink-0">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                            Crop Preview
                        </div>
                        <div className="space-y-2">
                            {/* Square preview (Instagram feed) */}
                            <div className="relative">
                                <div className="aspect-square w-full overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                                    <img
                                        src={imgSrc}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        style={{ objectPosition: `${point.x}% ${point.y}%` }}
                                        draggable={false}
                                    />
                                </div>
                                <span className="mt-0.5 block text-center text-[9px] text-[var(--text-muted)]">1:1</span>
                            </div>
                            {/* 16:9 preview (Facebook/LinkedIn) */}
                            <div className="relative">
                                <div className="aspect-video w-full overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                                    <img
                                        src={imgSrc}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        style={{ objectPosition: `${point.x}% ${point.y}%` }}
                                        draggable={false}
                                    />
                                </div>
                                <span className="mt-0.5 block text-center text-[9px] text-[var(--text-muted)]">16:9</span>
                            </div>
                            {/* 9:16 preview (Stories/Reels) */}
                            <div className="relative">
                                <div className="aspect-[9/16] w-[60%] mx-auto overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                                    <img
                                        src={imgSrc}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        style={{ objectPosition: `${point.x}% ${point.y}%` }}
                                        draggable={false}
                                    />
                                </div>
                                <span className="mt-0.5 block text-center text-[9px] text-[var(--text-muted)]">9:16</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Coordinate display */}
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>
                        Position: {point.x.toFixed(0)}% × {point.y.toFixed(0)}%
                        {isDefault && ' (center)'}
                    </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setPoint({ x: 50, y: 50 })}
                        disabled={isDefault}
                        className={cn(
                            'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                            isDefault
                                ? 'text-[var(--text-muted)] cursor-not-allowed opacity-50'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                        )}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Center
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(point)}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110"
                        >
                            <Check className="h-3.5 w-3.5" />
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
