import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { type SocialAccount } from '@/components/compose/profile-selector';
import { type MediaItem } from '@/components/compose/platform-editor';
import { getDefaultPlatformSettings } from '@/components/compose/customization-panel';
import { toast } from '@/components/ui/toast';
import { showErrorToast } from '@/lib/api-error';
import { type AccountSettings } from './use-compose';

export interface UseComposeDraftProps {
    editPostId: string | null;
    initialPostData?: unknown;
    accounts: SocialAccount[];
    setEditPostStatus: (s: string | null) => void;
    setEditPostUpdatedAt: (d: Date | null) => void;
    setEditPostLatestError: (e: { message: string; suggestion: string | null } | null) => void;
    setCaption: (c: string) => void;
    setFirstComment: (c: string) => void;
    setSelectedAccountIds: (ids: string[]) => void;
    setMedia: (m: MediaItem[]) => void;
    setSelectedDate: (d: Date) => void;
    setScheduledTime: (t: string) => void;
    setAccountSettings: (s: Record<string, AccountSettings>) => void;
}

import { type ProductTag } from '@/components/compose/product-tagging';

export interface InitialPostPlatform {
    accountId: string;
    postType?: 'feed' | 'reel' | 'story' | 'carousel' | 'video';
    callToAction?: string;
    captionOverride?: string;
    customMediaIds?: string[];
    firstComment?: string;
    autoPublish?: boolean;
    location?: string;
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
    videoTitle?: string;
    youtubeCategory?: string;
    youtubePlaylist?: string;
    videoTags?: string[];
    youtubePrivacy?: 'public' | 'private' | 'unlisted';
    createFirstLike?: boolean;
    embeddable?: boolean;
    notifySubscribers?: boolean;
    madeForKids?: boolean;
    tiktokPrivacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
    tiktokContentDisclosure?: boolean;
    tiktokBrandOrganic?: boolean;
    tiktokBrandContent?: boolean;
    tiktokIsAigc?: boolean;
    tiktokComments?: boolean;
    tiktokDuets?: boolean;
    tiktokStitches?: boolean;
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
    isTrialReel?: boolean;
    notifyDeviceIds?: string[];
    productTags?: ProductTag[];
}

export interface InitialPostData {
    id: string;
    status: string;
    updatedAt?: string | null;
    caption?: string | null;
    firstComment?: string | null;
    platformAccountIds?: (string | null)[];
    media?: Array<{ id: string; url: string; thumbnailUrl?: string; type?: string; size?: number }>;
    scheduledAt?: string | null;
    platforms?: InitialPostPlatform[];
    latestError?: { message: string; suggestion: string | null } | null;
}

export function useComposeDraft({
    editPostId,
    initialPostData,
    accounts,
    setEditPostStatus,
    setEditPostUpdatedAt,
    setEditPostLatestError,
    setCaption,
    setFirstComment,
    setSelectedAccountIds,
    setMedia,
    setSelectedDate,
    setScheduledTime,
    setAccountSettings
}: UseComposeDraftProps) {
    const [isLoadingEditPost, setIsLoadingEditPost] = useState(false);
    const [editPostError, setEditPostError] = useState<string | null>(null);

    const editPostLoadedRef = useRef(false);

    useEffect(() => {
        if (!editPostId || accounts.length === 0) return;
        if (editPostLoadedRef.current) return;

        async function loadEditPost() {
            try {
                let post = initialPostData as InitialPostData | undefined;

                if (!post || post.id !== editPostId) {
                    setIsLoadingEditPost(true);
                    setEditPostError(null);

                    const response = await fetch(`/api/posts/${editPostId}`);
                    if (!response.ok) throw new Error('Failed to load post');
                    post = await response.json() as InitialPostData;
                }

                editPostLoadedRef.current = true;

                setEditPostStatus(post.status);
                setEditPostUpdatedAt(post.updatedAt ? new Date(post.updatedAt) : null);
                setEditPostLatestError(post.latestError || null);
                setCaption(post.caption || '');
                setFirstComment(post.firstComment || '');

                if (post.platformAccountIds && Array.isArray(post.platformAccountIds)) {
                    const validIds = post.platformAccountIds.filter((id: string | null) => id != null);
                    setSelectedAccountIds(validIds);
                }

                if (post.media && Array.isArray(post.media)) {
                    setMedia(post.media.map((m: { id: string; url: string; thumbnailUrl?: string; type?: string; size?: number; transcodeStatus?: string | null }) => ({
                        id: m.id,
                        url: m.url,
                        thumbnailUrl: m.thumbnailUrl,
                        type: m.type === 'video' ? 'video' : 'image',
                        size: m.size || 0,
                        transcodeStatus: m.transcodeStatus ?? null,
                    })));
                }

                if (post.scheduledAt) {
                    const scheduledDate = new Date(post.scheduledAt);
                    setSelectedDate(scheduledDate);
                    setScheduledTime(format(scheduledDate, 'HH:mm'));
                }

                if (post.platforms && Array.isArray(post.platforms)) {
                    const newAccountSettings: Record<string, AccountSettings> = {};
                    for (const platform of post.platforms) {
                        const account = accounts.find(a => a.id === platform.accountId);
                        if (account) {
                            newAccountSettings[platform.accountId] = {
                                ...getDefaultPlatformSettings(account.platform),
                                accountId: platform.accountId,
                                postType: platform.postType || 'feed',
                                callToAction: platform.callToAction || '',
                                captionOverride: platform.captionOverride || undefined,
                                mediaOverride: platform.customMediaIds?.length ? platform.customMediaIds : undefined,
                                firstCommentOverride: platform.firstComment || undefined,
                                autoPublish: platform.autoPublish ?? true,
                                location: platform.location || undefined,
                                pinTitle: platform.pinTitle || undefined,
                                pinLink: platform.pinLink || undefined,
                                boardId: platform.boardId || undefined,
                                videoTitle: platform.videoTitle || undefined,
                                category: platform.youtubeCategory || undefined,
                                playlist: platform.youtubePlaylist || undefined,
                                videoTags: platform.videoTags?.length ? platform.videoTags : undefined,
                                privacy: platform.youtubePrivacy || undefined,
                                createFirstLike: platform.createFirstLike ?? undefined,
                                embeddable: platform.embeddable ?? undefined,
                                notifySubscribers: platform.notifySubscribers ?? undefined,
                                madeForKids: platform.madeForKids ?? undefined,
                                tiktokPrivacyLevel: platform.tiktokPrivacyLevel ?? undefined,
                                tiktokContentDisclosure: platform.tiktokContentDisclosure ?? undefined,
                                tiktokBrandOrganicToggle: platform.tiktokBrandOrganic ?? undefined,
                                tiktokBrandContentToggle: platform.tiktokBrandContent ?? undefined,
                                tiktokIsAigc: platform.tiktokIsAigc ?? undefined,
                                tiktokCommentsEnabled: platform.tiktokComments ?? undefined,
                                tiktokDuetsEnabled: platform.tiktokDuets ?? undefined,
                                tiktokStitchesEnabled: platform.tiktokStitches ?? undefined,
                                instagramShareToFeed: platform.instagramShareToFeed ?? undefined,
                                instagramComments: platform.instagramComments ?? undefined,
                                isTrialReel: platform.isTrialReel ?? undefined,
                                notifyDeviceIds: platform.notifyDeviceIds?.length ? platform.notifyDeviceIds : undefined,
                                productTags: platform.productTags?.length ? platform.productTags : undefined,
                            };
                        }
                    }
                    setAccountSettings(newAccountSettings);
                }

                toast('success', 'Post loaded for editing');
            } catch (error) {
                showErrorToast(error, 'Error loading post for edit');
                setEditPostError(error instanceof Error ? error.message : 'Failed to load post');
                toast('error', 'Failed to load post for editing');
            } finally {
                setIsLoadingEditPost(false);
            }
        }

        loadEditPost();
    }, [
        editPostId, accounts, initialPostData, setEditPostStatus, setEditPostUpdatedAt,
        setCaption, setFirstComment, setSelectedAccountIds, setMedia, setSelectedDate,
        setScheduledTime, setAccountSettings
    ]);

    return { isLoadingEditPost, editPostError };
}
