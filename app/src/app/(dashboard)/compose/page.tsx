/**
 * Compose page for creating new posts
 * 3-column layout: Profile Selector | Platform Editor | Customization Panel
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Save, Clock, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileSelector, type SocialAccount } from '@/components/compose/profile-selector';
import { PlatformEditor, type MediaItem } from '@/components/compose/platform-editor';
import {
    CustomizationPanel,
    getDefaultPlatformSettings,
    type PlatformSettings,
} from '@/components/compose/customization-panel';
import { AICaptionGenerator } from '@/components/compose/ai-caption-generator';
import { TemplatePicker } from '@/components/compose/template-picker';
import { FirstCommentInput } from '@/components/compose/first-comment-input';
import { type Platform } from '@/lib/platform-config';

/**
 * Per-account settings that override the base post settings
 * Why: Each account may need different captions, post types, or CTAs
 */
export interface AccountSettings extends PlatformSettings {
    accountId: string;
    captionOverride?: string;
    mediaOverride?: string[];
}

export default function ComposePage() {
    // Account fetching state
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    // Post state
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);

    // Per-account settings (keyed by accountId, not platform)
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});

    // Active account for customization panel
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    // AI Caption Generator modal state
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);

    // Template Picker modal state
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

    // First Comment state
    const [firstComment, setFirstComment] = useState('');

    const [scheduledDate, setScheduledDate] = useState<string>('tomorrow');
    const [scheduledTime, setScheduledTime] = useState<string>('09:00');


    // Fetch connected social accounts
    useEffect(() => {
        async function fetchAccounts() {
            try {
                setIsLoadingAccounts(true);
                const response = await fetch('/api/accounts');
                if (!response.ok) {
                    throw new Error('Failed to fetch accounts');
                }
                const data = await response.json();

                // Transform API response to SocialAccount format
                const transformedAccounts: SocialAccount[] = data.accounts.map((account: {
                    id: string;
                    platform: string;
                    name: string;
                    username?: string;
                    avatar?: string;
                    isActive?: boolean;
                }) => ({
                    id: account.id,
                    platform: account.platform.toLowerCase() as Platform,
                    name: account.name,
                    username: account.username,
                    avatar: account.avatar,
                    isActive: account.isActive !== false,
                }));

                setAccounts(transformedAccounts);
            } catch (error) {
                console.error('Error fetching accounts:', error);
                setAccountsError(error instanceof Error ? error.message : 'Failed to load accounts');
            } finally {
                setIsLoadingAccounts(false);
            }
        }

        fetchAccounts();
    }, []);

    // Derived state
    const selectedAccounts = useMemo(() => {
        return accounts.filter((account) => selectedAccountIds.includes(account.id));
    }, [accounts, selectedAccountIds]);

    const uniquePlatforms = useMemo((): Platform[] => {
        const platforms = new Set<Platform>();
        selectedAccounts.forEach((account) => platforms.add(account.platform));
        return Array.from(platforms);
    }, [selectedAccounts]);

    // Get active account (for customization panel)
    const activeAccount = useMemo(() => {
        if (!activeAccountId) return selectedAccounts[0] || null;
        return selectedAccounts.find((a) => a.id === activeAccountId) || selectedAccounts[0] || null;
    }, [activeAccountId, selectedAccounts]);

    // Ensure all selected accounts have settings
    const effectiveAccountSettings = useMemo(() => {
        const settings = { ...accountSettings };
        selectedAccounts.forEach((account) => {
            if (!settings[account.id]) {
                settings[account.id] = {
                    ...getDefaultPlatformSettings(account.platform),
                    accountId: account.id,
                };
            }
        });
        return settings;
    }, [accountSettings, selectedAccounts]);

    // Convert account settings to platform settings for CustomizationPanel compatibility
    const activePlatformSettings = useMemo((): Record<Platform, PlatformSettings> => {
        const result: Record<Platform, PlatformSettings> = {} as Record<Platform, PlatformSettings>;
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            if (settings) {
                result[activeAccount.platform] = settings;
            }
        }
        return result;
    }, [activeAccount, effectiveAccountSettings]);

    // Handlers
    const handleAccountSettingsChange = useCallback(
        (accountId: string, updates: Partial<AccountSettings>) => {
            setAccountSettings((prev) => {
                const account = accounts.find((a) => a.id === accountId);
                const platform = account?.platform || 'instagram';
                return {
                    ...prev,
                    [accountId]: {
                        ...(prev[accountId] || { ...getDefaultPlatformSettings(platform), accountId }),
                        ...updates,
                    },
                };
            });
        },
        [accounts]
    );

    // Wrapper for CustomizationPanel that works with platform-based interface
    const handlePlatformSettingsChange = useCallback(
        (_platform: Platform, updates: Partial<PlatformSettings>) => {
            if (activeAccount) {
                handleAccountSettingsChange(activeAccount.id, updates);
            }
        },
        [activeAccount, handleAccountSettingsChange]
    );

    // Handle active account change via platform tabs
    const handleActivePlatformChange = useCallback(
        (platform: Platform) => {
            // Find first selected account with this platform
            const account = selectedAccounts.find((a) => a.platform === platform);
            if (account) {
                setActiveAccountId(account.id);
            }
        },
        [selectedAccounts]
    );

    const handleAIAssist = useCallback(() => {
        setIsAIModalOpen(true);
    }, []);

    /**
     * Handle caption selection from AI generator
     * Why: Updates the main caption and closes the modal
     */
    const handleAICaptionSelect = useCallback((newCaption: string, _hashtags: string[]) => {
        setCaption(newCaption);
        setIsAIModalOpen(false);
    }, []);

    /**
     * Handle template selection
     * Why: Replaces caption with selected template content
     */
    const handleTemplateSelect = useCallback((templateCaption: string, _hashtags: string[]) => {
        setCaption(templateCaption);
    }, []);

    /**
     * Open template picker
     */
    const handleOpenTemplates = useCallback(() => {
        setIsTemplatePickerOpen(true);
    }, []);

    const handleAddMedia = useCallback(() => {
        // TODO: Open media picker modal
        console.log('Add Media clicked');
    }, []);

    const handleSaveDraft = useCallback(async () => {
        // TODO: Save as draft
        console.log('Save Draft clicked');
    }, []);

    const handleSchedule = useCallback(async () => {
        // Build platform settings for API
        const platformSettings: Record<string, {
            postType: string;
            callToAction?: string;
            caption?: string;
            mediaIds?: string[];
        }> = {};

        selectedAccountIds.forEach((accountId) => {
            const settings = effectiveAccountSettings[accountId];
            if (settings) {
                platformSettings[accountId] = {
                    postType: settings.postType,
                    callToAction: settings.callToAction,
                    caption: settings.captionOverride,
                    mediaIds: settings.mediaOverride,
                };
            }
        });

        console.log('Schedule clicked', {
            caption,
            firstComment,
            accounts: selectedAccountIds,
            platformSettings,
            scheduledDate,
            scheduledTime,
        });

        // TODO: Make API call to create post
    }, [caption, firstComment, selectedAccountIds, effectiveAccountSettings, scheduledDate, scheduledTime]);

    const handlePublishNow = useCallback(() => {
        // TODO: Publish immediately
        console.log('Publish Now clicked');
    }, []);

    // Get caption for active account (use override if set)
    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            return settings?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

    if (isLoadingAccounts) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    <span className="text-sm text-[var(--text-muted)]">Loading accounts...</span>
                </div>
            </div>
        );
    }

    if (accountsError) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="text-red-500">Failed to load accounts</div>
                    <p className="text-sm text-[var(--text-muted)]">{accountsError}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold">New Post</h1>
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {selectedAccountIds.length} profile{selectedAccountIds.length !== 1 ? 's' : ''} selected
                    </span>
                </div>
                <button className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <X className="h-5 w-5" />
                </button>
            </header>

            {/* Content - 3 Column Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left - Profile Selector */}
                <div className="w-[280px] flex-shrink-0 border-r border-[var(--border)] overflow-hidden">
                    <ProfileSelector
                        accounts={accounts}
                        selected={selectedAccountIds}
                        onSelectionChange={setSelectedAccountIds}
                        groupBy="platform"
                    />
                </div>

                {/* Center - Platform Editor */}
                <div className="flex-1 overflow-hidden border-r border-[var(--border)]">
                    <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-hidden">
                            <PlatformEditor
                                caption={caption}
                                onCaptionChange={setCaption}
                                selectedPlatforms={uniquePlatforms}
                                media={media}
                                onMediaChange={setMedia}
                                onAIAssist={handleAIAssist}
                                onAddMedia={handleAddMedia}
                                onOpenTemplates={handleOpenTemplates}
                            />
                        </div>
                        {/* First Comment Input */}
                        {uniquePlatforms.length > 0 && (
                            <div className="border-t border-[var(--border)] p-4">
                                <FirstCommentInput
                                    value={firstComment}
                                    onChange={setFirstComment}
                                    platform={uniquePlatforms[0]}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right - Customization Panel */}
                <div className="w-[340px] flex-shrink-0 overflow-hidden">
                    {selectedAccounts.length > 0 && activeAccount ? (
                        <CustomizationPanel
                            platforms={uniquePlatforms}
                            activePlatform={activeAccount.platform}
                            onActivePlatformChange={handleActivePlatformChange}
                            settings={activePlatformSettings}
                            onSettingsChange={handlePlatformSettingsChange}
                            caption={activeCaption}
                            media={media}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center">
                            <p className="text-sm text-[var(--text-muted)]">
                                Select at least one profile to customize your post
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Schedule Actions */}
            <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center justify-between">
                    {/* Schedule Selectors */}
                    <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-[var(--text-muted)]" />
                        <select
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="today">Today</option>
                            <option value="tomorrow">Tomorrow</option>
                            <option value="pick">Pick a date...</option>
                        </select>
                        <select
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="09:00">9:00 AM</option>
                            <option value="12:00">12:00 PM</option>
                            <option value="15:00">3:00 PM</option>
                            <option value="18:00">6:00 PM</option>
                            <option value="19:30">7:30 PM</option>
                            <option value="21:00">9:00 PM</option>
                        </select>
                        <div className="flex items-center gap-2 text-xs text-[var(--accent-gold)]">
                            <span className="text-lg">✨</span>
                            AI suggests 7:30 PM (+40% reach)
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={handleSaveDraft}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Draft
                        </Button>
                        <Button variant="secondary" onClick={handleSchedule}>
                            <Clock className="mr-2 h-4 w-4" />
                            Schedule
                        </Button>
                        <Button onClick={handlePublishNow}>
                            <Send className="mr-2 h-4 w-4" />
                            Publish Now
                        </Button>
                    </div>
                </div>
            </footer>

            {/* AI Caption Generator Modal */}
            {isAIModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-secondary)] shadow-2xl">
                        {/* Close Button */}
                        <button
                            onClick={() => setIsAIModalOpen(false)}
                            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <AICaptionGenerator
                            onSelect={handleAICaptionSelect}
                            platform={uniquePlatforms[0] || 'instagram'}
                            currentDraft={caption}
                        />
                    </div>
                </div>
            )}

            {/* Template Picker Modal */}
            <TemplatePicker
                isOpen={isTemplatePickerOpen}
                onClose={() => setIsTemplatePickerOpen(false)}
                onSelect={handleTemplateSelect}
                currentCaption={caption}
            />
        </div>
    );
}
