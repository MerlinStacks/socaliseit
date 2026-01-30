import { CommentsInbox } from '@/components/engagement/comments-inbox';
import { MentionsFeed } from '@/components/engagement/mentions-feed';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function EngagementPage() {
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Engagement Hub</h2>
                <div className="flex items-center space-x-2">
                    {/* Add Sync Button Here later */}
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
            </Tabs>
        </div>
    );
}
