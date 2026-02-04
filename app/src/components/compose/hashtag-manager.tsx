'use client';

/**
 * Hashtag Manager Component
 * Tabbed interface for saved hashtag collections and AI suggestions.
 * 
 * Why: Vista Social-style hashtag management with "Saved hashtags" and "Hashtag suggestions" tabs.
 */

import { useState, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
    Hash,
    TrendingUp,
    Users,
    BarChart3,
    Plus,
    X,
    Sparkles,
    AlertCircle,
    Pencil,
    Trash2,
    Search,
    Bookmark,
} from 'lucide-react';
import {
    useHashtagCollections,
    useCreateHashtagCollection,
    useUpdateHashtagCollection,
    useDeleteHashtagCollection,
    type HashtagCollection,
} from '@/hooks/use-hashtag-collections';
import { HashtagCollectionModal } from './hashtag-collection-modal';

// ============================================================================
// Types
// ============================================================================

interface HashtagSuggestion {
    tag: string;
    category: 'trending' | 'niche' | 'branded' | 'related';
    reach: number;
    competition: 'low' | 'medium' | 'high';
    relevanceScore: number;
}

interface HashtagManagerProps {
    /** Current caption to analyze for suggestions */
    caption: string;
    /** Platform for optimization */
    platform: string;
    /** Currently selected hashtags in the caption */
    selectedHashtags: string[];
    /** Callback when hashtags should be added to caption */
    onHashtagsChange: (hashtags: string[]) => void;
    className?: string;
}

type TabType = 'saved' | 'suggestions';

// ============================================================================
// Helper Functions
// ============================================================================

function formatReach(reach: number): string {
    if (reach >= 1_000_000) return `${(reach / 1_000_000).toFixed(1)}M`;
    if (reach >= 1_000) return `${(reach / 1_000).toFixed(0)}K`;
    return String(reach);
}

const categoryColors = {
    trending: 'bg-[var(--accent-pink)] text-white',
    niche: 'bg-[var(--success)] text-white',
    branded: 'bg-[var(--accent-gold)] text-white',
    related: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
};

const competitionColors = {
    low: 'text-[var(--success)]',
    medium: 'text-[var(--warning)]',
    high: 'text-[var(--error)]',
};

const platformLimits: Record<string, number> = {
    instagram: 30,
    tiktok: 5,
    pinterest: 20,
    linkedin: 5,
    facebook: 10,
};

// ============================================================================
// Main Component
// ============================================================================

export function HashtagManager({
    caption,
    platform,
    selectedHashtags,
    onHashtagsChange,
    className,
}: HashtagManagerProps) {
    const [activeTab, setActiveTab] = useState<TabType>('saved');
    const [searchQuery, setSearchQuery] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<HashtagCollection | null>(null);
    const [suggestions, setSuggestions] = useState<HashtagSuggestion[]>([]);

    // Fetch collections
    const { collections, isLoading: collectionsLoading } = useHashtagCollections();
    const createMutation = useCreateHashtagCollection();
    const updateMutation = useUpdateHashtagCollection();
    const deleteMutation = useDeleteHashtagCollection();

    // Filter collections by search
    const filteredCollections = useMemo(() => {
        if (!searchQuery.trim()) return collections;
        const query = searchQuery.toLowerCase();
        return collections.filter(
            (c) =>
                c.name.toLowerCase().includes(query) ||
                c.hashtags.some((h) => h.toLowerCase().includes(query))
        );
    }, [collections, searchQuery]);

    // AI Analysis mutation (mock for now)
    const analyzeMutation = useMutation({
        mutationFn: async () => {
            await new Promise((r) => setTimeout(r, 1200));
            const mockSuggestions: HashtagSuggestion[] = [
                { tag: '#viral', category: 'trending', reach: 45_000_000, competition: 'high', relevanceScore: 0.78 },
                { tag: '#fyp', category: 'trending', reach: 120_000_000, competition: 'high', relevanceScore: 0.92 },
                { tag: '#smallbusiness', category: 'niche', reach: 8_500_000, competition: 'medium', relevanceScore: 0.85 },
                { tag: '#entrepreneur', category: 'niche', reach: 12_000_000, competition: 'medium', relevanceScore: 0.72 },
                { tag: '#socialmediamarketing', category: 'related', reach: 5_200_000, competition: 'low', relevanceScore: 0.88 },
                { tag: '#contentcreator', category: 'related', reach: 9_800_000, competition: 'medium', relevanceScore: 0.81 },
                { tag: '#brandbuilding', category: 'branded', reach: 450_000, competition: 'low', relevanceScore: 0.95 },
            ];
            return mockSuggestions;
        },
        onSuccess: (data) => setSuggestions(data),
    });

    const limit = platformLimits[platform.toLowerCase()] || 30;
    const remaining = limit - selectedHashtags.length;

    // Handlers
    const addHashtag = useCallback((tag: string) => {
        const normalizedTag = tag.startsWith('#') ? tag : `#${tag}`;
        if (!selectedHashtags.includes(normalizedTag)) {
            onHashtagsChange([...selectedHashtags, normalizedTag]);
        }
    }, [selectedHashtags, onHashtagsChange]);

    const removeHashtag = useCallback((tag: string) => {
        onHashtagsChange(selectedHashtags.filter((h) => h !== tag));
    }, [selectedHashtags, onHashtagsChange]);

    const insertCollection = useCallback((collection: HashtagCollection) => {
        const newTags = collection.hashtags
            .map((h) => (h.startsWith('#') ? h : `#${h}`))
            .filter((h) => !selectedHashtags.includes(h));
        onHashtagsChange([...selectedHashtags, ...newTags]);
    }, [selectedHashtags, onHashtagsChange]);

    const handleSaveCollection = useCallback(async (name: string, hashtags: string[]) => {
        if (editingCollection) {
            await updateMutation.mutateAsync({
                id: editingCollection.id,
                data: { name, hashtags },
            });
        } else {
            await createMutation.mutateAsync({ name, hashtags });
        }
        setModalOpen(false);
        setEditingCollection(null);
    }, [editingCollection, createMutation, updateMutation]);

    const handleDeleteCollection = useCallback(async (id: string) => {
        if (confirm('Are you sure you want to delete this collection?')) {
            await deleteMutation.mutateAsync(id);
        }
    }, [deleteMutation]);

    const openEditModal = useCallback((collection: HashtagCollection) => {
        setEditingCollection(collection);
        setModalOpen(true);
    }, []);

    const openCreateModal = useCallback(() => {
        setEditingCollection(null);
        setModalOpen(true);
    }, []);

    return (
        <div className={cn('card p-5', className)}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient">
                        <Hash className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-semibold">Hashtags</h3>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border-subtle)] mb-4">
                <button
                    onClick={() => setActiveTab('saved')}
                    className={cn(
                        'px-4 py-2 text-sm font-medium transition-colors relative',
                        activeTab === 'saved'
                            ? 'text-[var(--accent-gold)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    )}
                >
                    <Bookmark className="w-4 h-4 inline-block mr-1.5" />
                    Saved hashtags
                    {activeTab === 'saved' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-gold)]" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('suggestions')}
                    className={cn(
                        'px-4 py-2 text-sm font-medium transition-colors relative',
                        activeTab === 'suggestions'
                            ? 'text-[var(--accent-gold)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    )}
                >
                    <Sparkles className="w-4 h-4 inline-block mr-1.5" />
                    Hashtag suggestions
                    {activeTab === 'suggestions' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-gold)]" />
                    )}
                </button>
                <div className="flex-1" />
                <button
                    onClick={openCreateModal}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors"
                    title="Create new collection"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'saved' ? (
                <SavedHashtagsTab
                    collections={filteredCollections}
                    isLoading={collectionsLoading}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onInsert={insertCollection}
                    onEdit={openEditModal}
                    onDelete={handleDeleteCollection}
                />
            ) : (
                <SuggestionsTab
                    suggestions={suggestions}
                    caption={caption}
                    isAnalyzing={analyzeMutation.isPending}
                    onAnalyze={() => analyzeMutation.mutate()}
                    selectedHashtags={selectedHashtags}
                    limit={limit}
                    addHashtag={addHashtag}
                    removeHashtag={removeHashtag}
                />
            )}

            {/* Selected Hashtags Footer */}
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[var(--text-muted)]">
                        Selected ({selectedHashtags.length}/{limit})
                    </label>
                    {remaining <= 3 && remaining > 0 && (
                        <span className="text-xs text-[var(--warning)]">
                            {remaining} remaining
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 rounded-lg bg-[var(--bg-tertiary)]">
                    {selectedHashtags.length === 0 ? (
                        <span className="text-sm text-[var(--text-muted)]">
                            No hashtags selected
                        </span>
                    ) : (
                        selectedHashtags.map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                            >
                                {tag}
                                <button
                                    onClick={() => removeHashtag(tag)}
                                    className="hover:text-[var(--error)] transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))
                    )}
                </div>
            </div>

            {/* Collection Modal */}
            <HashtagCollectionModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingCollection(null);
                }}
                onSave={handleSaveCollection}
                collection={editingCollection}
                isSaving={createMutation.isPending || updateMutation.isPending}
            />
        </div>
    );
}

// ============================================================================
// Sub-Components
// ============================================================================

interface SavedHashtagsTabProps {
    collections: HashtagCollection[];
    isLoading: boolean;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onInsert: (collection: HashtagCollection) => void;
    onEdit: (collection: HashtagCollection) => void;
    onDelete: (id: string) => void;
}

function SavedHashtagsTab({
    collections,
    isLoading,
    searchQuery,
    onSearchChange,
    onInsert,
    onEdit,
    onDelete,
}: SavedHashtagsTabProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="sm" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                    type="text"
                    placeholder="Search for hashtags"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:border-[var(--accent-gold)] focus:outline-none transition-colors"
                />
            </div>

            {/* Collections List */}
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {collections.length === 0 ? (
                    <div className="text-center py-6 text-[var(--text-muted)]">
                        <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No saved hashtag collections</p>
                        <p className="text-xs mt-1">Click + to create your first collection</p>
                    </div>
                ) : (
                    collections.map((collection) => (
                        <div
                            key={collection.id}
                            className="group flex items-center justify-between p-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80 transition-colors cursor-pointer"
                            onClick={() => onInsert(collection)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-[var(--text-primary)]">
                                    {collection.name}
                                </div>
                                <div className="text-xs text-[var(--text-muted)] truncate">
                                    #{collection.hashtags.slice(0, 4).join(' #')}
                                    {collection.hashtags.length > 4 && '...'}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(collection);
                                    }}
                                    className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                    title="Edit"
                                >
                                    <Pencil className="w-4 h-4 text-[var(--text-muted)]" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(collection.id);
                                    }}
                                    className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4 text-[var(--error)]" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

interface SuggestionsTabProps {
    suggestions: HashtagSuggestion[];
    caption: string;
    isAnalyzing: boolean;
    onAnalyze: () => void;
    selectedHashtags: string[];
    limit: number;
    addHashtag: (tag: string) => void;
    removeHashtag: (tag: string) => void;
}

function SuggestionsTab({
    suggestions,
    caption,
    isAnalyzing,
    onAnalyze,
    selectedHashtags,
    limit,
    addHashtag,
    removeHashtag,
}: SuggestionsTabProps) {
    return (
        <div className="space-y-3">
            {/* Analyze Button */}
            <Button
                variant="secondary"
                size="sm"
                onClick={onAnalyze}
                disabled={isAnalyzing || !caption.trim()}
                className="w-full btn-interactive"
            >
                {isAnalyzing ? (
                    <LoadingSpinner size="sm" />
                ) : (
                    <Sparkles className="w-4 h-4 mr-1" />
                )}
                Analyze Caption
            </Button>

            {/* Suggestions */}
            {suggestions.length > 0 ? (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {suggestions.map((suggestion) => {
                        const isSelected = selectedHashtags.includes(suggestion.tag);
                        const atLimit = selectedHashtags.length >= limit;

                        return (
                            <div
                                key={suggestion.tag}
                                className={cn(
                                    'flex items-center justify-between p-3 rounded-lg transition-colors',
                                    isSelected
                                        ? 'bg-[var(--accent-gold-light)]'
                                        : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-tertiary)]/80'
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        'px-2 py-0.5 rounded text-xs font-medium',
                                        categoryColors[suggestion.category]
                                    )}>
                                        {suggestion.category}
                                    </span>
                                    <span className="font-medium text-[var(--text-primary)]">
                                        {suggestion.tag}
                                    </span>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                                        <span className="flex items-center gap-1" title="Reach">
                                            <Users className="w-3 h-3" />
                                            {formatReach(suggestion.reach)}
                                        </span>
                                        <span className={cn(
                                            'flex items-center gap-1',
                                            competitionColors[suggestion.competition]
                                        )} title="Competition">
                                            <BarChart3 className="w-3 h-3" />
                                            {suggestion.competition}
                                        </span>
                                        <span className="flex items-center gap-1" title="Relevance">
                                            <TrendingUp className="w-3 h-3 text-[var(--accent-gold)]" />
                                            {Math.round(suggestion.relevanceScore * 100)}%
                                        </span>
                                    </div>

                                    <button
                                        onClick={() => isSelected ? removeHashtag(suggestion.tag) : addHashtag(suggestion.tag)}
                                        disabled={!isSelected && atLimit}
                                        className={cn(
                                            'p-1.5 rounded transition-colors',
                                            isSelected
                                                ? 'bg-[var(--error)] text-white hover:bg-[var(--error)]/80'
                                                : atLimit
                                                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                                                    : 'bg-[var(--accent-gold)] text-white hover:bg-[var(--accent-gold)]/80'
                                        )}
                                    >
                                        {isSelected ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-6 text-[var(--text-muted)]">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                        Click &quot;Analyze Caption&quot; to get AI-powered hashtag suggestions
                    </p>
                </div>
            )}
        </div>
    );
}
