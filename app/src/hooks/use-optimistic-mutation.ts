/**
 * Optimistic Mutation Hook
 * Wrapper for TanStack React Query useMutation with optimistic update patterns
 * 
 * Why: Provides instant UI feedback while API calls are in flight,
 * with automatic rollback on failure.
 */

'use client';

import { useMutation, useQueryClient, QueryKey } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

interface UseOptimisticMutationOptions<TData, TError, TVariables, TContext> {
    /** The mutation function */
    mutationFn: (variables: TVariables) => Promise<TData>;
    /** Query key(s) to update optimistically */
    queryKey: QueryKey;
    /** 
     * Function to optimistically update the cache
     * Returns the previous data for rollback on error
     */
    optimisticUpdate: (variables: TVariables, previousData: unknown) => unknown;
    /** Success message for toast */
    successMessage?: string;
    /** Error message for toast */
    errorMessage?: string;
    /** Callback on success */
    onSuccess?: (data: TData, variables: TVariables) => void;
    /** Callback on error */
    onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
    /** Whether to invalidate queries after mutation settles */
    invalidateOnSettled?: boolean;
}

/**
 * Hook for mutations with optimistic updates
 * Immediately updates UI, then reverts if API call fails
 */
export function useOptimisticMutation<TData = unknown, TError = Error, TVariables = void>({
    mutationFn,
    queryKey,
    optimisticUpdate,
    successMessage,
    errorMessage = 'Something went wrong',
    onSuccess,
    onError,
    invalidateOnSettled = true,
}: UseOptimisticMutationOptions<TData, TError, TVariables, { previousData: unknown }>) {
    const queryClient = useQueryClient();

    return useMutation<TData, TError, TVariables, { previousData: unknown }>({
        mutationFn,

        onMutate: async (variables) => {
            // Cancel outgoing refetches to avoid overwriting optimistic update
            await queryClient.cancelQueries({ queryKey });

            // Snapshot current data for rollback
            const previousData = queryClient.getQueryData(queryKey);

            // Optimistically update the cache
            queryClient.setQueryData(queryKey, (old: unknown) =>
                optimisticUpdate(variables, old)
            );

            // Return context with previous data for rollback
            return { previousData };
        },

        onError: (error, variables, context) => {
            // Rollback to previous data on error
            if (context?.previousData !== undefined) {
                queryClient.setQueryData(queryKey, context.previousData);
            }

            // Show error toast
            toast('error', 'Error', errorMessage);

            // Call custom error handler
            onError?.(error, variables, context);
        },

        onSuccess: (data, variables) => {
            // Show success toast if provided
            if (successMessage) {
                toast('success', 'Success', successMessage);
            }

            // Call custom success handler
            onSuccess?.(data, variables);
        },

        onSettled: () => {
            // Re-fetch to ensure server state is in sync
            if (invalidateOnSettled) {
                queryClient.invalidateQueries({ queryKey });
            }
        },
    });
}

/**
 * Type helper for list operations (toggle, delete, etc.)
 */
export interface OptimisticListItem {
    id: string;
    [key: string]: unknown;
}

/**
 * Helper to toggle a boolean field optimistically in a list
 */
export function createToggleOptimisticUpdate<T extends OptimisticListItem>(
    field: keyof T
) {
    return (variables: { id: string }, previousData: unknown): T[] => {
        if (!Array.isArray(previousData)) return previousData as T[];

        return previousData.map((item: T) =>
            item.id === variables.id
                ? { ...item, [field]: !item[field] }
                : item
        );
    };
}

/**
 * Helper to remove an item optimistically from a list
 */
export function createDeleteOptimisticUpdate<T extends OptimisticListItem>() {
    return (variables: { id: string }, previousData: unknown): T[] => {
        if (!Array.isArray(previousData)) return previousData as T[];

        return previousData.filter((item: T) => item.id !== variables.id);
    };
}

/**
 * Helper to update a single item optimistically in a list
 */
export function createUpdateOptimisticUpdate<T extends OptimisticListItem>() {
    return (variables: { id: string; updates: Partial<T> }, previousData: unknown): T[] => {
        if (!Array.isArray(previousData)) return previousData as T[];

        return previousData.map((item: T) =>
            item.id === variables.id
                ? { ...item, ...variables.updates }
                : item
        );
    };
}
