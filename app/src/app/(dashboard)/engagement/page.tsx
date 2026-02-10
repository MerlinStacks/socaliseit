'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Inbox, Star } from 'lucide-react';
import { CommentsInbox } from '@/components/engagement/comments-inbox';
import { MentionsFeed } from '@/components/engagement/mentions-feed';
import { DirectMessagesInbox } from '@/components/engagement/direct-messages-inbox';
import { ReviewsInbox } from '@/components/engagement/reviews-inbox';
import UnifiedInboxStream from '@/components/engagement/unified-inbox-stream';
import InboxFilterControls, { type InboxFilters } from '@/components/engagement/inbox-filter-controls';
import ConversationThread from '@/components/engagement/conversation-thread';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { MobileHeader } from '@/components/mobile/bottom-nav';
import { cn } from '@/lib/utils';

/**
 * Engagement Hub Page (Mobile-optimized)
 * Unified view for managing social engagement: comments, mentions, and DMs
 */
export default function EngagementPage() {
    const queryClient = useQueryClient();
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
            // Call the engagement sync API
            const response = await fetch('/api/engagement/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysSince: 30 }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Sync failed');
            }

            const result = await response.json();
            const { data } = result;

            // Invalidate all engagement-related queries to refresh UI
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['comments'] }),
                queryClient.invalidateQueries({ queryKey: ['mentions'] }),
                queryClient.invalidateQueries({ queryKey: ['messages'] }),
                queryClient.invalidateQueries({ queryKey: ['inbox'] }),
                queryClient.invalidateQueries({ queryKey: ['reviews'] }),
            ]);

            // Show sync summary
            const added = (data.commentsAdded || 0) + (data.mentionsAdded || 0) + (data.dmsAdded || 0) + (data.reviewsAdded || 0);
            const updated = (data.commentsUpdated || 0) + (data.mentionsUpdated || 0) + (data.dmsUpdated || 0);

            if (added > 0 || updated > 0) {
                toast(
                    'success',
                    `Synced ${data.postsScanned} posts: ${added} new items, ${updated} updated`
                );
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

    return (
        <>
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

            <div className="flex-1 space-y-4 p-4 pt-4 md:p-8 md:pt-6">
                {/* Desktop Header - hidden on mobile */}
                <div className="hidden md:flex items-center justify-between space-y-2">
                    <h2 className="text-3xl font-bold tracking-tight">Engagement Hub</h2>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleSync}
                            disabled={isSyncing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Sync'}
                        </Button>
                    </div>
                </div>

                <Tabs defaultValue="unified" className="space-y-4">
                    <TabsList className="w-full md:w-auto overflow-x-auto">
                        <TabsTrigger value="unified" className="gap-1.5 flex-1 md:flex-none">
                            <Inbox className="h-4 w-4" />
                            <span className="hidden sm:inline">Unified</span> Inbox
                        </TabsTrigger>
                        <TabsTrigger value="comments" className="flex-1 md:flex-none">Comments</TabsTrigger>
                        <TabsTrigger value="mentions" className="flex-1 md:flex-none">Mentions</TabsTrigger>
                        <TabsTrigger value="messages" className="flex-1 md:flex-none">DMs</TabsTrigger>
                        <TabsTrigger value="reviews" className="gap-1.5 flex-1 md:flex-none">
                            <Star className="h-4 w-4" />
                            Reviews
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="unified" className="space-y-4">
                        <Card>
                            <CardContent className="p-0">
                                <InboxFilterControls
                                    filters={filters}
                                    onFiltersChange={setFilters}
                                />
                                <div className="h-[calc(100vh-280px)] md:h-[600px] flex">
                                    {/* Inbox Stream - Left Panel */}
                                    <div className={cn(
                                        'transition-all duration-200 overflow-hidden',
                                        selectedItem ? 'w-1/2 border-r hidden md:block' : 'w-full'
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
                                                    // socialAccountId not exposed in API response, will need to be added if needed
                                                    socialAccountId: '',
                                                    authorId: item.authorId,
                                                    authorUsername: item.authorUsername,
                                                    authorAvatar: item.authorAvatar,
                                                });
                                            }}
                                        />
                                    </div>

                                    {/* Conversation Thread - Right Panel */}
                                    {selectedItem && (
                                        <div className={cn(
                                            'transition-all duration-200',
                                            'w-full md:w-1/2'
                                        )}>
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
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="comments" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Comments Inbox</CardTitle>
                                <CardDescription>
                                    Manage comments across all your connected social platforms.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <CommentsInbox />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="mentions" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Mentions</CardTitle>
                                <CardDescription>Track where you are being mentioned.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <MentionsFeed />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="messages" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Direct Messages</CardTitle>
                                <CardDescription>
                                    View and manage direct messages from your connected platforms.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <DirectMessagesInbox />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="reviews" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Reviews</CardTitle>
                                <CardDescription>
                                    View and reply to Google Business and Facebook Page reviews.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ReviewsInbox />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </>
    );
}
