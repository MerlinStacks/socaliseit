import { useState, useCallback } from 'react';
import { toast } from '@/components/ui/toast';
import { showErrorToast } from '@/lib/api-error';

export function useComposeSubmission(editPostId: string | null, setEditPostStatus: (status: string) => void) {
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;

    /** Retry publishing a failed or stuck post */
    const retryPublish = useCallback(async () => {
        if (!editPostId || isRetrying) return;
        setIsRetrying(true);
        try {
            const response = await fetch(`/api/posts/${editPostId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry' }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to retry post');
            setEditPostStatus('publishing');
            toast('success', 'Retry queued', 'Your post is being published again.');
        } catch (error) {
            showErrorToast(error, 'Failed to retry post');
        } finally {
            setIsRetrying(false);
        }
    }, [editPostId, isRetrying, setEditPostStatus]);

    return {
        isSaving, setIsSaving,
        isScheduling, setIsScheduling,
        isPublishing, setIsPublishing,
        isRetrying, retryPublish,
        isSubmitting,
    };
}
