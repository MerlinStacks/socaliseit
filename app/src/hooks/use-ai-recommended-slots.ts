
import { useState, useEffect } from 'react';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { Platform } from '@/generated/prisma/enums';
import { showErrorToast } from '@/lib/api-error';

export interface AiRecommendedSlot {
    id: string;
    date: Date;
    hour: number;
    minute: number;
    reason: string;
    reachImprovement: number;
    platform: Platform; // Added platform
}

export function useAiRecommendedSlots(weekStart: Date, organizationId: string): { slots: AiRecommendedSlot[], isLoading: boolean } {
    const [slots, setSlots] = useState<AiRecommendedSlot[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchSlots() {
            if (!organizationId) return;

            setIsLoading(true);
            try {
                // Fetch from our new API
                const res = await fetch(`/api/ai/scheduling/recommendations?organizationId=${organizationId}`);
                const data = await res.json();

                if (data.success && Array.isArray(data.data)) {
                    // Filter for current week and map to interface
                    const weekStartNormal = startOfWeek(weekStart, { weekStartsOn: 1 });
                    const weekEnd = addDays(weekStartNormal, 7);

                    const mappedSlots = data.data
                        .map((rec: Record<string, unknown>) => ({
                            ...rec,
                            date: new Date(String(rec.date)), // Ensure date object
                            reachImprovement: Math.round(Number(rec.confidence) * 100) // Convert 0-1 confidence to percentage
                        }))
                        .filter((slot: AiRecommendedSlot) =>
                            slot.date >= weekStartNormal && slot.date < weekEnd
                        );

                    setSlots(mappedSlots);
                }
            } catch (error) {
                showErrorToast(error, 'Failed to fetch AI slots');
                // Fallback or empty on error
                setSlots([]);
            } finally {
                setIsLoading(false);
            }
        }

        fetchSlots();
    }, [weekStart, organizationId]);

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
