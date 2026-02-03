'use client';

import { CommentsInbox } from '@/components/engagement/comments-inbox';
import { MentionsFeed } from '@/components/engagement/mentions-feed';
import { DirectMessagesInbox } from '@/components/engagement/direct-messages-inbox';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from '@/components/ui/toast';

/**
 * Engagement Hub Page
 * Unified view for managing social engagement: comments, mentions, and DMs
 */
export default function EngagementPage() {
    const queryClient = useQueryClient();
    const [isSyncing, setIsSyncing] = useState(false);

    /**
     * Handles sync button click - invalidates all engagement queries
     */
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            // Invalidate all engagement-related queries to refresh data
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['comments'] }),
                queryClient.invalidateQueries({ queryKey: ['mentions'] }),
                queryClient.invalidateQueries({ queryKey: ['messages'] }),
            ]);
            toast('success', 'Engagement data refreshed');
        } catch {
            toast('error', 'Failed to sync engagement data');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
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

            <Tabs defaultValue="comments" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="comments">Comments</TabsTrigger>
                    <TabsTrigger value="mentions">Mentions & Tags</TabsTrigger>
                    <TabsTrigger value="messages">Direct Messages</TabsTrigger>
                </TabsList>

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
            </Tabs>
        </div>
    );
}
