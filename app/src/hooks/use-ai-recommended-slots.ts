
import { useState, useEffect } from 'react';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { Platform } from '@/generated/prisma/enums';

export interface AiRecommendedSlot {
    id: string;
    date: Date;
    hour: number;
    minute: number;
    reason: string;
    reachImprovement: number;
    platform: Platform; // Added platform
}

export function useAiRecommendedSlots(weekStart: Date, workspaceId: string): { slots: AiRecommendedSlot[], isLoading: boolean } {
    const [slots, setSlots] = useState<AiRecommendedSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchSlots() {
            if (!workspaceId) return;

            setIsLoading(true);
            try {
                // Fetch from our new API
                const res = await fetch(`/api/ai/scheduling/recommendations?workspaceId=${workspaceId}`);
                const data = await res.json();

                if (data.success && Array.isArray(data.data)) {
                    // Filter for current week and map to interface
                    const weekStartNormal = startOfWeek(weekStart, { weekStartsOn: 1 });
                    const weekEnd = addDays(weekStartNormal, 7);

                    const mappedSlots = data.data
                        .map((rec: any) => ({
                            ...rec,
                            date: new Date(rec.date), // Ensure date object
                            reachImprovement: Math.round(rec.confidence * 100) // Convert 0-1 confidence to percentage
                        }))
                        .filter((slot: AiRecommendedSlot) =>
                            slot.date >= weekStartNormal && slot.date < weekEnd
                        );

                    setSlots(mappedSlots);
                }
            } catch (error) {
                console.error('Failed to fetch AI slots:', error);
                // Fallback or empty on error
                setSlots([]);
            } finally {
                setIsLoading(false);
            }
        }

        fetchSlots();
    }, [weekStart, workspaceId]);

    return { slots, isLoading };
}

export function isAiRecommendedSlot(
    slots: AiRecommendedSlot[],
    date: Date,
    hour: number
): AiRecommendedSlot | null {
    return slots.find(slot =>
        isSameDay(slot.date, date) && slot.hour === hour
    ) || null;
}
