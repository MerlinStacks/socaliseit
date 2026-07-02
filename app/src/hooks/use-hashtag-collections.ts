/**
 * Hashtag Collections Hook
 * React Query hooks for CRUD operations on saved hashtag groups.
 *
 * Why: Centralize hashtag collection data fetching and mutations with optimistic updates.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { throwApiResponseError } from '@/lib/api-error';

// ============================================================================
// Types
// ============================================================================

export interface HashtagCollection {
    id: string;
    organizationId: string;
    name: string;
    hashtags: string[];
    usageCount: number;
    createdAt: string;
    updatedAt: string;
}

interface CollectionsResponse {
    collections: HashtagCollection[];
    total: number;
}

interface CreateCollectionData {
    name: string;
    hashtags: string[];
}

interface UpdateCollectionData {
    name?: string;
    hashtags?: string[];
}

// ============================================================================
// Query Keys
// ============================================================================

export const hashtagCollectionKeys = {
    all: ['hashtag-collections'] as const,
    detail: (id: string) => ['hashtag-collections', id] as const,
};

// ============================================================================
// Queries
// ============================================================================

/**
 * Hook to fetch all hashtag collections for the current organization.
 */
export function useHashtagCollections() {
    const query = useQuery<CollectionsResponse>({
        queryKey: hashtagCollectionKeys.all,
        queryFn: async () => {
            const response = await fetch('/api/hashtags/collections');
            if (!response.ok) {
                throwApiResponseError(response, 'Failed to fetch hashtag collections');
            }
            return response.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    return {
        collections: query.data?.collections ?? [],
        total: query.data?.total ?? 0,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
    };
}

/**
 * Hook to fetch a single hashtag collection.
 */
export function useHashtagCollection(id: string | null) {
    return useQuery<HashtagCollection>({
        queryKey: hashtagCollectionKeys.detail(id ?? ''),
        queryFn: async () => {
            const response = await fetch(`/api/hashtags/collections/${id}`);
            if (!response.ok) {
                throw new Error('Failed to fetch hashtag collection');
            }
            return response.json();
        },
        enabled: !!id,
    });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Hook to create a new hashtag collection.
 */
export function useCreateHashtagCollection() {
    const queryClient = useQueryClient();

    return useMutation<HashtagCollection, Error, CreateCollectionData>({
        mutationFn: async (data) => {
            const response = await fetch('/api/hashtags/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create collection');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: hashtagCollectionKeys.all });
        },
    });
}

/**
 * Hook to update an existing hashtag collection.
 */
export function useUpdateHashtagCollection() {
    const queryClient = useQueryClient();

    return useMutation<HashtagCollection, Error, { id: string; data: UpdateCollectionData }>({
        mutationFn: async ({ id, data }) => {
            const response = await fetch(`/api/hashtags/collections/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update collection');
            }
            return response.json();
        },
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: hashtagCollectionKeys.all });
            queryClient.invalidateQueries({ queryKey: hashtagCollectionKeys.detail(id) });
        },
    });
}

/**
 * Hook to delete a hashtag collection.
 */
export function useDeleteHashtagCollection() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, Error, string>({
        mutationFn: async (id) => {
            const response = await fetch(`/api/hashtags/collections/${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                throw new Error('Failed to delete collection');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: hashtagCollectionKeys.all });
        },
    });
}

/**
 * Hook to increment usage count when a collection is used.
 */
export function useIncrementCollectionUsage() {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: async (id) => {
            // Optimistically update the local cache
            // The actual increment happens on the next GET after usage
            await fetch(`/api/hashtags/collections/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ incrementUsage: true }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: hashtagCollectionKeys.all });
        },
    });
}
