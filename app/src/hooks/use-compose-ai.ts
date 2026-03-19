import { useState, useCallback } from 'react';
import { type Platform } from '@/lib/platform-config';
import { type MediaItem } from '@/components/compose/platform-editor';
import { toast } from '@/components/ui/toast';
import { showErrorToast } from '@/lib/api-error';

export interface UseComposeAIProps {
    caption: string;
    media: MediaItem[];
    platformCaptions: Partial<Record<Platform, string>>;
    uniquePlatforms: Platform[];
    handlePlatformCaptionChange: (platform: Platform, caption: string) => void;
    setCaption: (c: string) => void;
}

export function useComposeAI({
    caption,
    media,
    platformCaptions,
    uniquePlatforms,
    handlePlatformCaptionChange,
    setCaption
}: UseComposeAIProps) {
    const [isAIRewriting, setIsAIRewriting] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);

    const handleAIAssist = useCallback(async (activePlatform?: Platform | null) => {
        const isAllTab = !activePlatform;
        const targetPlatform = activePlatform || uniquePlatforms[0] || 'instagram';
        const displayedCaption = isAllTab ? caption : platformCaptions[activePlatform] ?? caption;

        if (!displayedCaption.trim()) {
            toast('warning', 'Add a caption first', 'Type something to rewrite.');
            return;
        }
        if (isAIRewriting) return;

        setIsAIRewriting(true);
        try {
            const mediaContext = {
                hasVideo: media.some(m => m.type === 'video'),
                hasImage: media.some(m => m.type === 'image'),
                mediaCount: media.length,
            };

            const response = await fetch('/api/ai/rewrite-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: displayedCaption, platform: targetPlatform, mediaContext }),
            });

            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Failed to rewrite caption');

            if (isAllTab) {
                setCaption(result.data.caption);
            } else {
                handlePlatformCaptionChange(activePlatform!, result.data.caption);
            }
            toast('success', 'Caption enhanced', `Caption rewritten for ${isAllTab ? 'all platforms' : targetPlatform}.`);
        } catch (error) {
            showErrorToast(error, '[AI Rewrite] Error');
            toast('error', 'Rewrite failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsAIRewriting(false);
        }
    }, [caption, platformCaptions, uniquePlatforms, media, isAIRewriting, handlePlatformCaptionChange, setCaption]);

    const handleAICaptionSelect = useCallback((newCaption: string, _hashtags: string[]) => {
        setCaption(newCaption);
        setIsAIModalOpen(false);
    }, [setCaption]);

    return {
        isAIRewriting,
        isAIModalOpen, setIsAIModalOpen,
        handleAIAssist,
        handleAICaptionSelect
    };
}
