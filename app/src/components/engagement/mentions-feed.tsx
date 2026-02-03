/**
 * Mentions Feed Component
 * Display and manage mentions and tags with platform toggle filters and read/unread state
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AtSign, Check, Eye, EyeOffIcon, CheckCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/components/ui/toast';
import { PlatformToggleFilter } from './platform-toggle-filter';
import type { Platform } from '@/lib/platform-config';

export function MentionsFeed() {
    const [platformFilter, setPlatformFilter] = useState<Platform[]>([]);
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
    // Default to hiding read items as per user request
    const [hideRead, setHideRead] = useState(true);
    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    // Fetch mentions
    const { data, isLoading } = useQuery({
        queryKey: ['mentions', platformFilter, typeFilter, readFilter, hideRead],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (typeFilter !== 'all') params.append('type', typeFilter);

            // Read filter
            if (hideRead || readFilter === 'unread') {
                params.append('isRead', 'false');
            } else if (readFilter === 'read') {
                params.append('isRead', 'true');
            }

            const res = await fetch(`/api/mentions?${params}`);
            if (!res.ok) throw new Error('Failed to fetch mentions');
            return res.json();
        }
    });

    // Bulk mark as read mutation
    const bulkReadMutation = useMutation({
        mutationFn: async (markAsRead: boolean) => {
            const body = selectedIds.size > 0
                ? { ids: Array.from(selectedIds), isRead: markAsRead }
                : { all: true, isRead: markAsRead };
            const res = await fetch('/api/mentions/bulk-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to update mentions');
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['mentions'] });
            setSelectedIds(new Set());
            toast('success', `Marked ${data.updated} mentions as read`);
        },
        onError: () => {
            toast('error', 'Failed to update mentions');
        }
    });

    // Filter client-side for multi-platform selection
    const filteredMentions = data?.data?.filter((mention: any) => {
        if (platformFilter.length === 0) return true;
        return platformFilter.includes(mention.socialAccount.platform.toLowerCase() as Platform);
    }) || [];

    // Selection helpers
    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredMentions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredMentions.map((m: any) => m.id)));
        }
    };

    const allSelected = filteredMentions.length > 0 && selectedIds.size === filteredMentions.length;

    return (
        <div className="space-y-6">
            {/* Filters Row */}
            <div className="flex gap-4 items-center flex-wrap">
                {/* Platform Toggle Buttons */}
                <PlatformToggleFilter
                    selected={platformFilter}
                    onChange={setPlatformFilter}
                />

                {/* Type Filter */}
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="mention">Mentions (@)</SelectItem>
                        <SelectItem value="tag">Tags (Photo)</SelectItem>
                    </SelectContent>
                </Select>

                {/* Read Filter */}
                <Select value={readFilter} onValueChange={(v) => setReadFilter(v as 'all' | 'unread' | 'read')}>
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                </Select>

                {/* Hide Read Toggle */}
                <Button
                    variant={hideRead ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setHideRead(!hideRead)}
                    className="gap-2"
                >
                    <EyeOffIcon className="h-4 w-4" />
                    Hide Read
                </Button>

                {/* Bulk Actions */}
                <div className="flex gap-2 ml-auto">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => bulkReadMutation.mutate(true)}
                        disabled={bulkReadMutation.isPending}
                        className="gap-2"
                    >
                        <CheckCheck className="h-4 w-4" />
                        {selectedIds.size > 0 ? `Mark ${selectedIds.size} Read` : 'Mark All Read'}
                    </Button>
                </div>
            </div>

            {/* Select All Row */}
            {filteredMentions.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        id="select-all-mentions"
                    />
                    <label htmlFor="select-all-mentions" className="text-sm text-muted-foreground cursor-pointer">
                        {allSelected ? 'Deselect all' : 'Select all'}
                    </label>
                    {selectedIds.size > 0 && (
                        <span className="text-sm text-muted-foreground">
                            ({selectedIds.size} selected)
                        </span>
                    )}
                </div>
            )}

            {/* Mentions List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredMentions.length === 0 ? (
                    <div className="text-center p-12 bg-muted/20 rounded-lg">
                        <AtSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium">No mentions found</h3>
                        <p className="text-muted-foreground">You're all caught up!</p>
                    </div>
                ) : (
                    filteredMentions.map((mention: any) => (
                        <MentionItem
                            key={mention.id}
                            mention={mention}
                            isSelected={selectedIds.has(mention.id)}
                            onToggleSelect={() => toggleSelection(mention.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

interface MentionItemProps {
    mention: any;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}

function MentionItem({ mention, isSelected, onToggleSelect }: MentionItemProps) {
    const queryClient = useQueryClient();

    const readMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/mentions/${mention.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isRead: !mention.isRead }),
            });
            if (!res.ok) throw new Error('Failed to update mention');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mentions'] });
        }
    });

    return (
        <Card className={`overflow-hidden transition-all ${mention.isRead
            ? 'opacity-80 bg-muted/10'
            : 'border-l-4 border-l-primary'
            }`}>
            <CardContent className="p-4">
                <div className="flex gap-4">
                    {/* Selection Checkbox */}
                    {onToggleSelect && (
                        <div className="flex items-start pt-1">
                            <Checkbox
                                checked={isSelected}
                                onCheckedChange={onToggleSelect}
                            />
                        </div>
                    )}
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={mention.authorAvatar} />
                        <AvatarFallback>{mention.authorUsername[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold">{mention.authorUsername}</span>
                                <Badge variant="outline" className="text-xs capitalize">
                                    {mention.socialAccount.platform.toLowerCase()}
                                </Badge>
                                <Badge variant="secondary" className="text-xs capitalize">
                                    {mention.type}
                                </Badge>
                                {!mention.isRead && <Badge variant="default" className="text-xs bg-primary">New</Badge>}
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm">{mention.text || 'Tagged you in a post'}</p>

                        {mention.mediaUrl && (
                            <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                                <img src={mention.mediaUrl} alt="Mention media" className="h-16 w-16 object-cover rounded-md" />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => readMutation.mutate()}
                                title={mention.isRead ? "Mark as Unread" : "Mark as Read"}
                            >
                                {mention.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
