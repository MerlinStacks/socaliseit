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
import { PlatformIcon } from '@/components/compose/profile-selector';
import { cn } from '@/lib/utils';
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
            <div className="flex gap-2 md:gap-4 items-center flex-wrap overflow-hidden">
                {/* Platform Toggle Buttons */}
                <PlatformToggleFilter
                    selected={platformFilter}
                    onChange={setPlatformFilter}
                />

                {/* Type Filter */}
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[110px] md:w-[140px] text-xs md:text-sm">
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
                    <SelectTrigger className="w-[90px] md:w-[120px] text-xs md:text-sm">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="unread">Unread</SelectItem>
                        <SelectItem value="read">Read</SelectItem>
                    </SelectContent>
                </Select>

                {/* Hide Read Toggle */}
                <button
                    onClick={() => setHideRead(!hideRead)}
                    className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                        hideRead
                            ? 'bg-gradient text-white shadow-sm'
                            : 'hover:bg-[var(--bg-tertiary)]'
                    )}
                    style={!hideRead ? { color: 'var(--text-secondary)' } : undefined}
                >
                    <EyeOffIcon className="h-4 w-4" />
                    <span className="hidden md:inline">Hide Read</span>
                </button>

                {/* Bulk Actions — hidden on mobile */}
                <div className="hidden md:flex gap-2 ml-auto">
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

            {/* Select All Row — desktop only */}
            {filteredMentions.length > 0 && (
                <div className="hidden md:flex items-center gap-2 px-2">
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
            <div className="space-y-2 md:space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : filteredMentions.length === 0 ? (
                    <div className="text-center p-6 md:p-12 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
                        <div className="rounded-full p-4 mx-auto w-fit mb-4" style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                            <AtSign className="h-10 w-10" style={{ color: '#8B5CF6', opacity: 0.7 }} />
                        </div>
                        <h3 className="text-lg font-medium">No mentions found</h3>
                        <p style={{ color: 'var(--text-muted)' }}>You're all caught up!</p>
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
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['mentions'] });
            const snapshot = queryClient.getQueriesData({ queryKey: ['mentions'] });
            queryClient.setQueriesData({ queryKey: ['mentions'] }, (old: any) => {
                if (!old?.data) return old;
                return { ...old, data: old.data.map((m: any) => m.id === mention.id ? { ...m, isRead: !mention.isRead } : m) };
            });
            return { snapshot };
        },
        onError: (_err: unknown, _vars: unknown, ctx: any) => {
            ctx?.snapshot?.forEach(([key, data]: [any, any]) => queryClient.setQueryData(key, data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['mentions'] });
            queryClient.invalidateQueries({ queryKey: ['unread-counts'] });
        },
    });

    return (
        <div
            className={cn(
                'glass-card overflow-hidden transition-all duration-200',
                !mention.isRead && 'border-l-[3px]'
            )}
            style={{
                borderLeftColor: !mention.isRead ? 'var(--accent-pink)' : undefined,
            }}
        >
            <div className="p-3 md:p-4">
                <div className="flex gap-3 md:gap-4">
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
                                <PlatformIcon platform={mention.socialAccount.platform.toLowerCase() as Platform} size={14} />
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8B5CF6' }}>
                                    {mention.type}
                                </span>
                                {!mention.isRead && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gradient text-white">New</span>}
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <p className="text-sm">{mention.text || 'Tagged you in a post'}</p>

                        {mention.mediaUrl && (
                            <div className="mt-2 text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                                <img src={mention.mediaUrl} alt="Mention media" className="h-16 w-16 object-cover rounded-md" />
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 justify-end">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 interactive-scale"
                                onClick={() => readMutation.mutate(undefined)}
                                title={mention.isRead ? "Mark as Unread" : "Mark as Read"}
                            >
                                {mention.isRead ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
