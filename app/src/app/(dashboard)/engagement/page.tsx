'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { RefreshCw, Inbox, Star, MessageSquareText, MessageSquare, AtSign, Mail, Users2 } from 'lucide-react';
import { CommentsInbox } from '@/components/engagement/comments-inbox';
import { MentionsFeed } from '@/components/engagement/mentions-feed';
import { DirectMessagesInbox } from '@/components/engagement/direct-messages-inbox';
import { ReviewsInbox } from '@/components/engagement/reviews-inbox';
import { CollabsInbox } from '@/components/engagement/collabs-inbox';
import { SentimentSparkline } from '@/components/engagement/sentiment-sparkline';
import UnifiedInboxStream from '@/components/engagement/unified-inbox-stream';
import InboxFilterControls, { type InboxFilters } from '@/components/engagement/inbox-filter-controls';
import ConversationThread from '@/components/engagement/conversation-thread';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { MobileHeader } from '@/components/mobile/bottom-nav';
import { usePullToRefresh, PullIndicator } from '@/hooks/use-pull-to-refresh';
import { cn } from '@/lib/utils';

/** Valid tab identifiers for the Engagement Hub */
const VALID_TABS = ['unified', 'comments', 'mentions', 'messages', 'reviews', 'collabs'] as const;
type EngagementTab = (typeof VALID_TABS)[number];

/**
 * Engagement Hub Page (Mobile-optimized)
 * Unified view for managing social engagement: comments, mentions, and DMs
 */
export default function EngagementPage() {
    const queryClient = useQueryClient();
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    /**
     * Why: Derive active tab from URL so page refreshes preserve the current tab.
     * Falls back to 'unified' for missing or invalid values.
     */
    const rawTab = searchParams.get('tab');
    const activeTab: EngagementTab = VALID_TABS.includes(rawTab as EngagementTab)
        ? (rawTab as EngagementTab)
        : 'unified';

    /** Push tab changes into the URL search params without a full navigation */
    const setActiveTab = useCallback(
        (tab: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (tab === 'unified') {
                params.delete('tab');
            } else {
                params.set('tab', tab);
            }
            const query = params.toString();
            router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
        },
        [searchParams, router, pathname],
    );

    const [isSyncing, setIsSyncing] = useState(false);
    const [filters, setFilters] = useState<InboxFilters>({
        type: 'all',
        platform: null,
        readStatus: 'all',
        sentiment: null,
    });

    // State for conversation thread view
    const [selectedItem, setSelectedItem] = useState<{
        id: string;
        type: 'comment' | 'mention' | 'dm';
        conversationId: string;
        platform: string;
        socialAccountId: string;
        authorId: string;
        authorUsername: string;
        authorAvatar: string | null;
    } | null>(null);

    /**
     * Handles sync button click - fetches engagement from all platforms
     *
     * Why: Calls the new engagement sync API which fetches comments/mentions
     * from ALL platform content (including external posts)
     */
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            // Call both engagement and review sync APIs in parallel
            const [engagementResponse, reviewsResponse] = await Promise.all([
                fetch('/api/engagement/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ daysSince: 30 }),
                }),
                fetch('/api/reviews/sync', { method: 'POST' }),
            ]);

            if (!engagementResponse.ok) {
                const error = await engagementResponse.json();
                throw new Error(error.error || 'Engagement sync failed');
            }

            const engagementResult = await engagementResponse.json();
            const { data } = engagementResult;

            // Merge review sync results if available
            let reviewsAdded = 0;
            if (reviewsResponse.ok) {
                const reviewResult = await reviewsResponse.json();
                reviewsAdded = reviewResult.data?.reviewsAdded || 0;
            }

            // Invalidate all engagement-related queries to refresh UI
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['comments'] }),
                queryClient.invalidateQueries({ queryKey: ['mentions'] }),
                queryClient.invalidateQueries({ queryKey: ['messages'] }),
                queryClient.invalidateQueries({ queryKey: ['inbox'] }),
                queryClient.invalidateQueries({ queryKey: ['reviews'] }),
                queryClient.invalidateQueries({ queryKey: ['unread-counts'] }),
            ]);

            // Show sync summary
            const added = (data.commentsAdded || 0) + (data.mentionsAdded || 0) + (data.dmsAdded || 0) + reviewsAdded;
            const updated = (data.commentsUpdated || 0) + (data.mentionsUpdated || 0) + (data.dmsUpdated || 0);

            if (added > 0 || updated > 0) {
                const parts = [];
                if (data.postsScanned) parts.push(`${data.postsScanned} posts scanned`);
                parts.push(`${added} new items`);
                if (updated > 0) parts.push(`${updated} updated`);
                if (reviewsAdded > 0) parts.push(`${reviewsAdded} reviews`);
                toast('success', `Synced: ${parts.join(', ')}`);
            } else if (data.accountsProcessed === 0) {
                toast('info', 'No connected accounts to sync');
            } else {
                toast('success', `Scanned ${data.postsScanned} posts - no new engagement`);
            }

            // Show warning if there were errors
            if (data.errorCount > 0) {
                toast('warning', `${data.errorCount} sync errors occurred`);
            }
        } catch (error) {
            toast('error', error instanceof Error ? error.message : 'Failed to sync engagement data');
        } finally {
            setIsSyncing(false);
        }
    };

    // Live unread counts for tab badges
    const { data: unreadData } = useQuery({
        queryKey: ['unread-counts'],
        queryFn: async () => {
            const res = await fetch('/api/engagement/unread-counts');
            if (!res.ok) return { comments: 0, mentions: 0, dms: 0, reviews: 0 };
            const json = await res.json();
            return json.data as { comments: number; mentions: number; dms: number; reviews: number };
        },
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,
    });
    const unread = unreadData || { comments: 0, mentions: 0, dms: 0, reviews: 0 };

    // Pull-to-refresh for mobile
    const { containerRef: pullRef, isRefreshing: isPullRefreshing, pullProgress, pullDistance } = usePullToRefresh({
        onRefresh: async () => {
            await handleSync();
        },
    });

    return (
        <div ref={pullRef} className="relative">
            {/* Mobile Header */}
            <MobileHeader
                title="Inbox"
                actions={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="h-8 w-8 p-0"
                    >
                        <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    </Button>
                }
            />

            <div className="flex-1 space-y-4 md:space-y-6 p-2 pt-2 md:p-8 md:pt-6">
                {/* Pull-to-refresh indicator (mobile) */}
                <PullIndicator progress={pullProgress} isRefreshing={isPullRefreshing} pullDistance={pullDistance} />

                {/* Desktop Header — premium gradient styling, hidden on mobile */}
                <div className="hidden md:flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-gradient">Engagement Hub</h2>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Manage conversations, mentions, and reviews across all platforms</p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="btn-interactive gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync All'}
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 md:space-y-5">
                    {/* Segmented tab control — icon-only on mobile, full labels on desktop */}
                    <TabsList className="w-full md:w-auto flex-nowrap glass p-1 rounded-xl gap-0.5 md:gap-1">
                        <TabsTrigger value="unified" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <Inbox className="h-4 w-4" />
                            <span className="hidden md:inline">Unified Inbox</span>
                        </TabsTrigger>
                        <TabsTrigger value="comments" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <MessageSquare className="h-4 w-4" />
                            <span className="hidden md:inline">Comments</span>
                            {unread.comments > 0 && <span className="absolute -top-0.5 -right-0.5 md:static md:ml-1 min-w-[16px] md:min-w-[18px] h-[16px] md:h-[18px] px-1 rounded-full text-[9px] md:text-[10px] font-bold leading-[16px] md:leading-[18px] text-center bg-gradient text-white">{unread.comments > 99 ? '99+' : unread.comments}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="mentions" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <AtSign className="h-4 w-4" />
                            <span className="hidden md:inline">Mentions</span>
                            {unread.mentions > 0 && <span className="absolute -top-0.5 -right-0.5 md:static md:ml-1 min-w-[16px] md:min-w-[18px] h-[16px] md:h-[18px] px-1 rounded-full text-[9px] md:text-[10px] font-bold leading-[16px] md:leading-[18px] text-center bg-gradient text-white">{unread.mentions > 99 ? '99+' : unread.mentions}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="messages" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <Mail className="h-4 w-4" />
                            <span className="hidden md:inline">DMs</span>
                            {unread.dms > 0 && <span className="absolute -top-0.5 -right-0.5 md:static md:ml-1 min-w-[16px] md:min-w-[18px] h-[16px] md:h-[18px] px-1 rounded-full text-[9px] md:text-[10px] font-bold leading-[16px] md:leading-[18px] text-center bg-gradient text-white">{unread.dms > 99 ? '99+' : unread.dms}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="reviews" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <Star className="h-4 w-4" />
                            <span className="hidden md:inline">Reviews</span>
                            {unread.reviews > 0 && <span className="absolute -top-0.5 -right-0.5 md:static md:ml-1 min-w-[16px] md:min-w-[18px] h-[16px] md:h-[18px] px-1 rounded-full text-[9px] md:text-[10px] font-bold leading-[16px] md:leading-[18px] text-center bg-gradient text-white">{unread.reviews > 99 ? '99+' : unread.reviews}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="collabs" className="relative gap-1.5 flex-1 md:flex-none rounded-lg data-[state=active]:bg-gradient data-[state=active]:text-white data-[state=active]:shadow-md transition-all px-2 md:px-3">
                            <Users2 className="h-4 w-4" />
                            <span className="hidden md:inline">Collabs</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="unified" className="space-y-4 animate-tab-content">
                        <div className="glass-card overflow-hidden">
                            <InboxFilterControls
                                filters={filters}
                                onFiltersChange={setFilters}
                            />
                            <div className="h-[calc(100vh-260px)] md:h-[calc(100vh-220px)] flex">
                                {/* Inbox Stream — Left Panel */}
                                <div className={cn(
                                    'transition-all duration-300 overflow-hidden',
                                    selectedItem ? 'w-2/5 hidden md:block border-r' : 'w-full'
                                )}>
                                    <UnifiedInboxStream
                                        typeFilter={filters.type}
                                        platformFilter={filters.platform || undefined}
                                        readFilter={filters.readStatus}
                                        selectedItemId={selectedItem?.id}
                                        onItemSelect={(item) => {
                                            const convId = item.meta.conversationId || item.meta.platformCommentId || item.id;
                                            setSelectedItem({
                                                id: item.id,
                                                type: item.type,
                                                conversationId: convId,
                                                platform: item.platform,
                                                socialAccountId: '',
                                                authorId: item.authorId,
                                                authorUsername: item.authorUsername,
                                                authorAvatar: item.authorAvatar,
                                            });
                                        }}
                                    />
                                </div>

                                {/* Conversation Thread — Right Panel */}
                                {/* Desktop: inline right panel */}
                                {selectedItem && (
                                    <div className="hidden md:block transition-all duration-300 animate-fade-in w-3/5">
                                        <ConversationThread
                                            conversationId={selectedItem.conversationId}
                                            type={selectedItem.type === 'dm' ? 'dm' : 'comment'}
                                            platform={selectedItem.platform}
                                            socialAccountId={selectedItem.socialAccountId}
                                            recipientId={selectedItem.authorId}
                                            onBack={() => setSelectedItem(null)}
                                            accountInfo={{
                                                name: selectedItem.authorUsername,
                                                avatar: selectedItem.authorAvatar,
                                            }}
                                        />
                                    </div>
                                )}
                                {!selectedItem && (
                                    /* Empty state with gradient accent */
                                    <div className="hidden md:flex w-3/5 flex-col items-center justify-center gap-4">
                                        <div className="rounded-full bg-gradient p-5 shadow-lg" style={{ opacity: 0.15 }}>
                                            <MessageSquareText className="h-12 w-12" style={{ color: 'var(--accent-gold)' }} />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Select a conversation</p>
                                            <p className="text-sm mt-1 max-w-[260px]" style={{ color: 'var(--text-muted)' }}>Pick a message from the list to view the full conversation thread</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="comments" className="animate-tab-content">
                        <div className="glass-card p-3 md:p-6 md:min-h-[calc(100vh-220px)]">
                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5">
                                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl" style={{ background: 'var(--info-light)' }}>
                                    <MessageSquare className="h-4 w-4 md:h-5 md:w-5" style={{ color: 'var(--info)' }} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-base md:text-lg">Comments</h3>
                                    <p className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>Manage comments across all connected platforms</p>
                                </div>
                                <div className="hidden md:block">
                                    <SentimentSparkline />
                                </div>
                            </div>
                            <CommentsInbox />
                        </div>
                    </TabsContent>

                    <TabsContent value="mentions" className="animate-tab-content">
                        <div className="glass-card p-3 md:p-6 md:min-h-[calc(100vh-220px)]">
                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5">
                                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                                    <AtSign className="h-4 w-4 md:h-5 md:w-5" style={{ color: '#8B5CF6' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base md:text-lg">Mentions</h3>
                                    <p className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>Track where you are being mentioned</p>
                                </div>
                            </div>
                            <MentionsFeed />
                        </div>
                    </TabsContent>

                    <TabsContent value="messages" className="animate-tab-content">
                        <div className="glass-card p-3 md:p-6 md:min-h-[calc(100vh-220px)]">
                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5">
                                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl" style={{ background: 'var(--success-light)' }}>
                                    <Mail className="h-4 w-4 md:h-5 md:w-5" style={{ color: 'var(--success)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base md:text-lg">Direct Messages</h3>
                                    <p className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>View and manage DMs from connected platforms</p>
                                </div>
                            </div>
                            <DirectMessagesInbox />
                        </div>
                    </TabsContent>

                    <TabsContent value="reviews" className="animate-tab-content">
                        <div className="glass-card p-3 md:p-6 md:min-h-[calc(100vh-220px)]">
                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5">
                                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl" style={{ background: 'var(--accent-gold-light)' }}>
                                    <Star className="h-4 w-4 md:h-5 md:w-5" style={{ color: 'var(--accent-gold)' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base md:text-lg">Reviews</h3>
                                    <p className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>View and reply to Google Business and Facebook reviews</p>
                                </div>
                            </div>
                            <ReviewsInbox />
                        </div>
                    </TabsContent>

                    <TabsContent value="collabs" className="animate-tab-content">
                        <div className="glass-card p-3 md:p-6 md:min-h-[calc(100vh-220px)]">
                            <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-5">
                                <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl" style={{ background: 'rgba(236, 72, 153, 0.12)' }}>
                                    <Users2 className="h-4 w-4 md:h-5 md:w-5" style={{ color: '#EC4899' }} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base md:text-lg">Collab Invites</h3>
                                    <p className="text-sm hidden md:block" style={{ color: 'var(--text-secondary)' }}>Accept or decline collaboration invites from Instagram</p>
                                </div>
                            </div>
                            <CollabsInbox />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Mobile: Full-screen conversation thread overlay */}
            {selectedItem && (
                <div
                    className="fixed inset-0 z-50 flex flex-col md:hidden animate-fade-in"
                    style={{
                        background: 'var(--bg-primary)',
                        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                    }}
                >
                    <ConversationThread
                        conversationId={selectedItem.conversationId}
                        type={selectedItem.type === 'dm' ? 'dm' : 'comment'}
                        platform={selectedItem.platform}
                        socialAccountId={selectedItem.socialAccountId}
                        recipientId={selectedItem.authorId}
                        onBack={() => setSelectedItem(null)}
                        accountInfo={{
                            name: selectedItem.authorUsername,
                            avatar: selectedItem.authorAvatar,
                        }}
                    />
                </div>
            )}
        </div>
    );
}
