---
name: react-query-patterns
description: Master TanStack React Query for server state management including caching, mutations, optimistic updates, infinite queries, and prefetching.
---

# React Query Patterns

## Core Setup

```typescript
// providers/query-provider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 3,
        refetchOnWindowFocus: true,
      },
    },
  }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

## Query Key Factory

```typescript
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};
```

## Basic Query

```typescript
export function usePosts(filters: PostFilters = {}) {
  return useQuery({
    queryKey: postKeys.list(filters),
    queryFn: () => fetchPosts(filters),
  });
}
```

## Mutations with Optimistic Updates

```typescript
export function useToggleLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }) => toggleLikeApi(postId, liked),
    onMutate: async ({ postId, liked }) => {
      await queryClient.cancelQueries({ queryKey: postKeys.detail(postId) });
      const previous = queryClient.getQueryData(postKeys.detail(postId));
      queryClient.setQueryData(postKeys.detail(postId), (old) => ({
        ...old, liked: !liked, likeCount: old.likeCount + (liked ? -1 : 1)
      }));
      return { previous };
    },
    onError: (err, vars, ctx) => {
      queryClient.setQueryData(postKeys.detail(vars.postId), ctx?.previous);
    },
    onSettled: (_, __, vars) => {
      queryClient.invalidateQueries({ queryKey: postKeys.detail(vars.postId) });
    },
  });
}
```

## Infinite Queries

```typescript
export function useInfinitePosts() {
  return useInfiniteQuery({
    queryKey: ['posts', 'infinite'],
    queryFn: ({ pageParam }) => fetchPostsPage(pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
```

## Prefetching

```typescript
const prefetch = () => {
  queryClient.prefetchQuery({
    queryKey: postKeys.detail(post.id),
    queryFn: () => fetchPost(post.id),
    staleTime: 60 * 1000,
  });
};
```

## Server Prefetch (Next.js)

```typescript
// app/posts/[id]/page.tsx
export default async function PostPage({ params }) {
  const queryClient = new QueryClient();
  await queryClient.prefetchQuery({
    queryKey: postKeys.detail(params.id),
    queryFn: () => fetchPost(params.id),
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostContent id={params.id} />
    </HydrationBoundary>
  );
}
```
