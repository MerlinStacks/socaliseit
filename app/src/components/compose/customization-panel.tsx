/**
 * Customization Panel Component
 * Right sidebar for per-platform customization and preview
 */

'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, Image, Play, Edit3, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    PLATFORM_SPECS,
    type Platform,
    type PostType,
    formatPostType,
    getPostTypeIcon,
} from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import { ProductTagging, type ProductTag } from './product-tagging';
import type { MediaItem } from './platform-editor';
import { PlatformPreview } from './platform-previews';

export interface PlatformSettings {
    postType: PostType;
    callToAction?: string;
    captionOverride?: string;
    mediaOverride?: string[]; // Media IDs
    autoPublish: boolean;
    productTags?: ProductTag[];
}

interface CustomizationPanelProps {
    platforms: Platform[];
    activePlatform: Platform;
    onActivePlatformChange: (platform: Platform) => void;
    settings: Record<Platform, PlatformSettings>;
    onSettingsChange: (platform: Platform, settings: Partial<PlatformSettings>) => void;
    caption: string;
    media: MediaItem[];
    className?: string;
}

/**
 * Per-platform customization panel with preview
 * Why: Different platforms have different requirements and options.
 * This panel allows users to customize content for each platform individually.
 */
export function CustomizationPanel({
    platforms,
    activePlatform,
    onActivePlatformChange,
    settings,
    onSettingsChange,
    caption,
    media,
    className,
}: CustomizationPanelProps) {
    const activeSpec = PLATFORM_SPECS[activePlatform];
    const activeSettings = settings[activePlatform] || {
        postType: 'feed' as PostType,
        autoPublish: false,
    };

    const handleSettingChange = <K extends keyof PlatformSettings>(
        key: K,
        value: PlatformSettings[K]
    ) => {
        onSettingsChange(activePlatform, { [key]: value });
    };

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-secondary)]', className)}>
            {/* Platform Tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-3">
                {platforms.map((platform) => {
                    const spec = PLATFORM_SPECS[platform];
                    const isActive = platform === activePlatform;
                    return (
                        <button
                            key={platform}
                            onClick={() => onActivePlatformChange(platform)}
                            className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                                isActive
                                    ? 'bg-[var(--accent-gold-light)]'
                                    : 'hover:bg-[var(--bg-tertiary)]'
                            )}
                            style={{ color: isActive ? spec.color : 'var(--text-muted)' }}
                            title={spec.name}
                        >
                            <PlatformIcon platform={platform} size={20} />
                        </button>
                    );
                })}
            </div>

            {/* Customization Options */}
            <div className="flex-1 overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                    <h3 className="text-sm font-semibold">Customize your post</h3>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                </div>

                {/* Caption Override */}
                <SettingSection title="Caption" subtitle="Click to edit caption">
                    <CaptionOverrideEditor
                        platform={activePlatform}
                        defaultCaption={caption}
                        override={activeSettings.captionOverride}
                        onChange={(value) => handleSettingChange('captionOverride', value)}
                    />
                </SettingSection>

                {/* Media Override */}
                <SettingSection title="Media" subtitle="Click to edit media">
                    <MediaOverrideEditor
                        media={media}
                        override={activeSettings.mediaOverride}
                        onChange={(value) => handleSettingChange('mediaOverride', value)}
                    />
                </SettingSection>

                {/* Auto Publish */}
                <SettingSection title="Auto publish">
                    <ToggleSwitch
                        enabled={activeSettings.autoPublish}
                        onChange={(value) => handleSettingChange('autoPublish', value)}
                    />
                </SettingSection>

                {/* Call to Action */}
                {activeSpec.callToActions && activeSpec.callToActions.length > 0 && (
                    <SettingSection title="Select call to action">
                        <select
                            value={activeSettings.callToAction || ''}
                            onChange={(e) =>
                                handleSettingChange('callToAction', e.target.value || undefined)
                            }
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="">No CTA</option>
                            {activeSpec.callToActions.map((cta) => (
                                <option key={cta.id} value={cta.id}>
                                    {cta.label}
                                </option>
                            ))}
                        </select>
                    </SettingSection>
                )}

                {/* Post Type */}
                <SettingSection title="Select post type">
                    <div className="flex flex-wrap gap-2">
                        {activeSpec.supportedPostTypes.map((postType) => (
                            <button
                                key={postType}
                                onClick={() => handleSettingChange('postType', postType)}
                                className={cn(
                                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                    activeSettings.postType === postType
                                        ? 'bg-[var(--accent-gold)] text-white'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'
                                )}
                            >
                                <span>{getPostTypeIcon(postType)}</span>
                                {formatPostType(postType)}
                            </button>
                        ))}
                    </div>
                </SettingSection>

                {/* Product Tagging (for platforms that support it) */}
                {activeSpec.features.productTagging && (
                    <SettingSection title="Product Tags" subtitle="Tag products to make this post shoppable">
                        <ProductTagging
                            platform={activePlatform}
                            media={media}
                            selectedTags={activeSettings.productTags || []}
                            onTagsChange={(tags) => handleSettingChange('productTags', tags)}
                        />
                    </SettingSection>
                )}

                {/* Preview */}
                <div className="mt-4 px-4 pb-6">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        Preview
                    </h4>
                    <PlatformPreview
                        platform={activePlatform}
                        postType={activeSettings.postType}
                        caption={activeSettings.captionOverride || caption}
                        media={media}
                    />
                </div>
            </div>
        </div>
    );
}

interface SettingSectionProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}

function SettingSection({ title, subtitle, children }: SettingSectionProps) {
    return (
        <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                enabled ? 'bg-[var(--accent-gold)]' : 'bg-[var(--bg-tertiary)]'
            )}
        >
            <span
                className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                )}
            />
        </button>
    );
}

interface CaptionOverrideEditorProps {
    platform: Platform;
    defaultCaption: string;
    override?: string;
    onChange: (value?: string) => void;
}

function CaptionOverrideEditor({
    platform,
    defaultCaption,
    override,
    onChange,
}: CaptionOverrideEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(override || '');
    const spec = PLATFORM_SPECS[platform];
    const displayCaption = override || defaultCaption;
    const charCount = displayCaption.length;
    const limit = spec.characterLimits.caption.max;

    if (isEditing) {
        return (
            <div className="space-y-2">
                <textarea
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    placeholder={defaultCaption || 'Enter caption...'}
                    className="min-h-[100px] w-full resize-none rounded-lg border border-[var(--accent-gold)] bg-[var(--bg-tertiary)] p-3 text-sm outline-none"
                />
                <div className="flex items-center justify-between">
                    <span
                        className={cn(
                            'text-xs',
                            charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                        )}
                    >
                        {localValue.length} / {limit.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setLocalValue('');
                                setIsEditing(false);
                            }}
                            className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onChange(localValue || undefined);
                                setIsEditing(false);
                            }}
                            className="flex items-center gap-1 rounded bg-[var(--accent-gold)] px-2 py-1 text-xs text-white"
                        >
                            <Check className="h-3 w-3" />
                            Save
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                setLocalValue(override || defaultCaption);
                setIsEditing(true);
            }}
            className="group flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-left hover:border-[var(--accent-gold)]"
        >
            <Edit3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)]" />
            <div className="flex-1 min-w-0">
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {displayCaption || 'No caption'}
                </p>
                <p
                    className={cn(
                        'mt-1 text-xs',
                        charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                    )}
                >
                    {charCount} / {limit.toLocaleString()}
                </p>
            </div>
        </button>
    );
}

interface MediaOverrideEditorProps {
    media: MediaItem[];
    override?: string[];
    onChange: (value?: string[]) => void;
}

function MediaOverrideEditor({ media, override, onChange }: MediaOverrideEditorProps) {
    const displayMedia = override
        ? media.filter((m) => override.includes(m.id))
        : media;

    if (displayMedia.length === 0) {
        return (
            <button className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-transparent p-4 text-[var(--text-muted)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]">
                <Image className="h-5 w-5" />
                <span className="text-sm">Add media for this platform</span>
            </button>
        );
    }

    return (
        <div className="flex gap-2">
            {displayMedia.slice(0, 4).map((item) => (
                <div
                    key={item.id}
                    className="relative h-14 w-14 overflow-hidden rounded-lg"
                >
                    <img
                        src={item.thumbnailUrl || item.url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                    {item.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="h-4 w-4 text-white" fill="white" />
                        </div>
                    )}
                </div>
            ))}
            {displayMedia.length > 4 && (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-sm font-medium text-[var(--text-muted)]">
                    +{displayMedia.length - 4}
                </div>
            )}
        </div>
    );
}

// PlatformPreview is now imported from './platform-previews'

/**
 * Get default settings for a platform
 */
export function getDefaultPlatformSettings(platform: Platform): PlatformSettings {
    const spec = PLATFORM_SPECS[platform];
    return {
        postType: spec.supportedPostTypes[0] || 'feed',
        autoPublish: false,
    };
}
