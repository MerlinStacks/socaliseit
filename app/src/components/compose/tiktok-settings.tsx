/**
 * TikTok-specific settings for customization panel
 * Why: TikTok Content Sharing Guidelines require specific UX elements:
 * - Creator info display, privacy dropdown, interaction toggles (off by default),
 * - Content disclosure with branded content rules, Music Usage Confirmation.
 * - Video duration validation, post-publish processing notice.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { SettingSection, ToggleSwitch } from './customization-ui';
import type { PlatformSettings } from './customization-panel';
import type { MediaItem } from './platform-editor';
import type { PostType } from '@/lib/platform-config';
import type { TikTokCreatorInfo, TikTokPrivacyLevel } from '@/lib/platform-api/tiktok-creator-info';
import { clientLogger } from '@/lib/client-logger';

interface TikTokSettingsProps {
    settings: PlatformSettings;
    onSettingChange: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
    /** TikTok account ID — used to fetch creator info */
    accountId?: string;
    /** Current post type — hides Duet/Stitch for photo posts */
    postType?: PostType;
    /** Currently selected media — used for video duration validation */
    media?: MediaItem[];
    /** Why: Parent needs to know when TikTok-specific constraints block publishing (Point 1b, 1c) */
    onPublishBlock?: (blocked: boolean, reason?: string) => void;
}

/** Map TikTok privacy levels to user-friendly labels */
const PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
    PUBLIC_TO_EVERYONE: 'Everyone',
    MUTUAL_FOLLOW_FRIENDS: 'Friends',
    FOLLOWER_OF_CREATOR: 'Followers',
    SELF_ONLY: 'Only me',
};

/**
 * TikTok-specific settings section
 * Why: Implements all required UX per TikTok Content Sharing Guidelines.
 */
export function TikTokSettings({
    settings,
    onSettingChange,
    accountId,
    postType,
    media,
    onPublishBlock,
}: TikTokSettingsProps) {
    const [creatorInfo, setCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
    const [creatorInfoError, setCreatorInfoError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    /** Whether this is a photo post (Duet/Stitch don't apply) */
    const isPhotoPost = postType === 'carousel' || postType === 'feed';

    /** Whether branded content privacy constraint is active */
    const isBrandedContentSelected = settings.tiktokContentDisclosure && settings.tiktokBrandContentToggle;
    const isSelfOnly = settings.tiktokPrivacyLevel === 'SELF_ONLY';

    /** Whether privacy has been selected — required by TikTok guidelines (Point 2b) */
    const isPrivacyNotSelected = !settings.tiktokPrivacyLevel;

    /** Dynamic media label — TikTok guidelines use "photo/video" phrasing */
    const mediaLabel = isPhotoPost ? 'photo' : 'video';

    /** Whether publish should be blocked due to disclosure without selection */
    const isDisclosureIncomplete = settings.tiktokContentDisclosure
        && !settings.tiktokBrandOrganicToggle
        && !settings.tiktokBrandContentToggle;

    /**
     * Point 1c — Video duration validation against max_video_post_duration_sec.
     * Why: TikTok requires that the to-be-posted video follows the max duration.
     */
    const videoDurationExceeded = useMemo(() => {
        if (!creatorInfo || isPhotoPost || !media?.length) return false;
        const video = media.find(m => m.type === 'video');
        if (!video?.duration) return false;
        return video.duration > creatorInfo.maxVideoPostDurationSec;
    }, [creatorInfo, isPhotoPost, media]);

    /** Point 1b + 1c — Notify parent when TikTok live API constraints block publishing */
    useEffect(() => {
        if (!onPublishBlock) return;
        if (creatorInfo && !creatorInfo.canPost) {
            onPublishBlock(true, 'TikTok posting limit reached. Please try again later.');
        } else if (videoDurationExceeded) {
            onPublishBlock(true, `Video exceeds TikTok max duration (${creatorInfo?.maxVideoPostDurationSec}s).`);
        } else {
            onPublishBlock(false);
        }
    }, [creatorInfo?.canPost, videoDurationExceeded, onPublishBlock, creatorInfo?.maxVideoPostDurationSec]);

    /** Build the correct Music Usage Confirmation text based on commercial content state */
    const legalDeclaration = useMemo(() => {
        const musicLink = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
        const bcLink = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

        if (settings.tiktokContentDisclosure && settings.tiktokBrandContentToggle) {
            return {
                text: "By posting, you agree to TikTok's", links: [
                    { label: 'Branded Content Policy', url: bcLink },
                    { label: 'Music Usage Confirmation', url: musicLink },
                ]
            };
        }
        return {
            text: "By posting, you agree to TikTok's", links: [
                { label: 'Music Usage Confirmation', url: musicLink },
            ]
        };
    }, [settings.tiktokContentDisclosure, settings.tiktokBrandContentToggle]);

    // Fetch creator info when accountId changes
    useEffect(() => {
        if (!accountId) return;

        const controller = new AbortController();
        const fetchCreatorInfo = async () => {
            setIsLoading(true);
            setCreatorInfoError(null);
            try {
                const res = await fetch(
                    `/api/platforms/tiktok/creator-info?accountId=${accountId}`,
                    { signal: controller.signal }
                );
                const data = await res.json();

                if (!res.ok) {
                    setCreatorInfoError(data.error || 'Failed to load TikTok creator info');
                    return;
                }

                setCreatorInfo(data.creatorInfo);

                // Why: TikTok Point 2b requires no default privacy value —
                // the user must manually select one from the dropdown.
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                clientLogger.error({ err: String(err) }, 'Failed to fetch TikTok creator info');
                setCreatorInfoError('Failed to load TikTok creator info');
            } finally {
                setIsLoading(false);
            }
        };

        fetchCreatorInfo();
        return () => controller.abort();
        // Why: Only re-fetch when the account changes, not on every settings change
         
    }, [accountId]);

    // Why: TikTok Point 3b — bidirectional privacy/branded-content constraint.
    // If branded content is selected and user picks 'Only me', auto-deselect branded content.
    // If privacy is 'Only me' and user tries to enable branded content, the checkbox is disabled (below).
    useEffect(() => {
        if (isBrandedContentSelected && isSelfOnly) {
            onSettingChange('tiktokBrandContentToggle', false);
        }
         
    }, [isSelfOnly]);

    const privacyOptions = creatorInfo?.privacyLevelOptions || [
        'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'
    ];

    return (
        <>
            {/* Point 1b — Rate limit warning: block publishing */}
            {creatorInfo && !creatorInfo.canPost && (
                <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-400">
                        Posting limit reached. Publishing is blocked — please try again later.
                    </p>
                </div>
            )}

            {/* Point 1c — Video duration exceeds max */}
            {videoDurationExceeded && creatorInfo && (
                <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-400">
                        Video exceeds TikTok&apos;s maximum duration of {creatorInfo.maxVideoPostDurationSec} seconds for this creator.
                    </p>
                </div>
            )}

            {/* Creator nickname — required by TikTok guidelines */}
            {creatorInfo && (
                <div className="border-b border-[var(--border)] px-4 py-2">
                    <p className="text-xs text-[var(--text-muted)]">
                        Posting as <span className="font-semibold text-[var(--text-primary)]">@{creatorInfo.creatorNickname}</span>
                    </p>
                </div>
            )}

            {/* Error state */}
            {creatorInfoError && (
                <div className="mx-4 mb-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                    <p className="text-xs text-red-400">{creatorInfoError}</p>
                </div>
            )}

            {/* Privacy Level Dropdown — no default per TikTok Point 2b */}
            <SettingSection title="Privacy" subtitle="Who can view this post">
                <select
                    value={settings.tiktokPrivacyLevel || ''}
                    onChange={(e) => onSettingChange('tiktokPrivacyLevel', e.target.value as TikTokPrivacyLevel)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] ${isPrivacyNotSelected
                        ? 'border-amber-500/50 bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                        : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
                        }`}
                    disabled={isLoading}
                >
                    {/* Why: TikTok Point 2b — "there should be no default value" */}
                    {isPrivacyNotSelected && (
                        <option value="" disabled>
                            Select privacy level…
                        </option>
                    )}
                    {/* Why: Point 3b — "Only me" must be disabled with explanation when branded content is active */}
                    {privacyOptions.map((level) => {
                        const isOptionDisabled = isBrandedContentSelected && level === 'SELF_ONLY';
                        return (
                            <option
                                key={level}
                                value={level}
                                disabled={isOptionDisabled}
                                title={isOptionDisabled ? 'Branded content visibility cannot be set to private.' : undefined}
                            >
                                {PRIVACY_LABELS[level] || level}{isOptionDisabled ? ' (unavailable)' : ''}
                            </option>
                        );
                    })}
                </select>
                {isPrivacyNotSelected && (
                    <p className="mt-1 text-xs text-amber-500">
                        Please select a privacy level before publishing.
                    </p>
                )}
                {isBrandedContentSelected && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Branded content visibility cannot be set to private.
                    </p>
                )}
            </SettingSection>

            {/* Point 2c — Interaction Toggles: default OFF, greyed-out when disabled by creator */}
            <SettingSection title="Allow comments">
                <ToggleSwitch
                    enabled={creatorInfo?.commentDisabled ? false : (settings.tiktokCommentsEnabled !== false)}
                    onChange={(value) => onSettingChange('tiktokCommentsEnabled', value)}
                    disabled={!!creatorInfo?.commentDisabled}
                />
                {creatorInfo?.commentDisabled && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">Disabled in creator&apos;s TikTok settings</p>
                )}
            </SettingSection>

            {/* Duet/Stitch — hidden for photo posts per TikTok guidelines */}
            {/* Point 2c — Duet/Stitch hidden for photo posts, greyed-out when disabled by creator */}
            {!isPhotoPost && (
                <>
                    <SettingSection title="Allow duets">
                        <ToggleSwitch
                            enabled={creatorInfo?.duetDisabled ? false : (settings.tiktokDuetsEnabled !== false)}
                            onChange={(value) => onSettingChange('tiktokDuetsEnabled', value)}
                            disabled={!!creatorInfo?.duetDisabled}
                        />
                        {creatorInfo?.duetDisabled && (
                            <p className="text-xs text-[var(--text-muted)] mt-1">Disabled in creator&apos;s TikTok settings</p>
                        )}
                    </SettingSection>

                    <SettingSection title="Allow stitches">
                        <ToggleSwitch
                            enabled={creatorInfo?.stitchDisabled ? false : (settings.tiktokStitchesEnabled !== false)}
                            onChange={(value) => onSettingChange('tiktokStitchesEnabled', value)}
                            disabled={!!creatorInfo?.stitchDisabled}
                        />
                        {creatorInfo?.stitchDisabled && (
                            <p className="text-xs text-[var(--text-muted)] mt-1">Disabled in creator&apos;s TikTok settings</p>
                        )}
                    </SettingSection>
                </>
            )}

            {/* Content Disclosure — master toggle, off by default */}
            <SettingSection title="Content disclosure" subtitle="Commercial content settings">
                <ToggleSwitch
                    enabled={settings.tiktokContentDisclosure || false}
                    onChange={(value) => {
                        onSettingChange('tiktokContentDisclosure', value);
                        // Clear sub-options when turning off
                        if (!value) {
                            onSettingChange('tiktokBrandOrganicToggle', false);
                            onSettingChange('tiktokBrandContentToggle', false);
                        }
                    }}
                />
            </SettingSection>

            {settings.tiktokContentDisclosure && (
                <div className="border-b border-[var(--border)] px-4 py-3 space-y-3">
                    {/* Your Brand */}
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.tiktokBrandOrganicToggle || false}
                            onChange={(e) => onSettingChange('tiktokBrandOrganicToggle', e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent-gold)]"
                        />
                        <div>
                            <div className="text-sm font-medium">Your brand</div>
                            <div className="text-xs text-[var(--text-muted)]">Promoting yourself or your own business</div>
                            {settings.tiktokBrandOrganicToggle && !settings.tiktokBrandContentToggle && (
                                <div className="text-xs text-amber-500 mt-1">
                                    Your {mediaLabel} will be labeled as &quot;Promotional content&quot;
                                </div>
                            )}
                        </div>
                    </label>

                    {/* Branded Content — disabled when privacy is 'Only me' per Point 3b */}
                    <label className={`flex items-start gap-3 ${isSelfOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input
                            type="checkbox"
                            checked={settings.tiktokBrandContentToggle || false}
                            onChange={(e) => onSettingChange('tiktokBrandContentToggle', e.target.checked)}
                            disabled={isSelfOnly}
                            className="mt-0.5 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent-gold)]"
                        />
                        <div>
                            <div className="text-sm font-medium">Branded content</div>
                            <div className="text-xs text-[var(--text-muted)]">Promoting another brand or third party</div>
                            {isSelfOnly && (
                                <div className="text-xs text-amber-500 mt-1">
                                    Branded content visibility cannot be set to private.
                                </div>
                            )}
                            {settings.tiktokBrandContentToggle && !isSelfOnly && (
                                <div className="text-xs text-amber-500 mt-1">
                                    Your {mediaLabel} will be labeled as &quot;Paid partnership&quot;
                                </div>
                            )}
                        </div>
                    </label>

                    {/* Disclosure incomplete warning */}
                    {isDisclosureIncomplete && (
                        <p className="text-xs text-red-400">
                            You need to indicate if your content promotes yourself, a third party, or both.
                        </p>
                    )}
                </div>
            )}

            {/* AI Generated */}
            <SettingSection title="AI generated" subtitle="Content created with AI">
                <ToggleSwitch
                    enabled={settings.tiktokIsAigc || false}
                    onChange={(value) => onSettingChange('tiktokIsAigc', value)}
                />
            </SettingSection>

            {/* Point 4 — Music Usage Confirmation: required consent before publish */}
            <div className="border-b border-[var(--border)] px-4 py-3">
                <p className="text-xs text-[var(--text-muted)]">
                    {legalDeclaration.text}{' '}
                    {legalDeclaration.links.map((link, i) => (
                        <span key={link.url}>
                            {i > 0 && ' and '}
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--accent-gold)] hover:underline inline-flex items-center gap-0.5"
                            >
                                {link.label}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </span>
                    ))}
                    .
                </p>
            </div>

            {/* Point 5d — Post-publish processing notice */}
            <div className="px-4 py-3 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[var(--text-muted)]">
                    After publishing, it may take a few minutes for your content to process and become visible on your TikTok profile.
                </p>
            </div>
        </>
    );
}

export default TikTokSettings;
