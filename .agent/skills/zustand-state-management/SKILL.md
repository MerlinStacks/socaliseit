---
name: zustand-state-management
description: Master Zustand state management with stores, middleware, persistence, devtools, and React integration patterns. Use when implementing client-side state, debugging state issues, or establishing state architecture.
---

# Zustand State Management

Expert guide for building robust client-side state with Zustand. Follow these patterns for maintainable, performant, and type-safe state management.

## Core Principles

### 1. Store Structure

Organize stores by domain, not by data type:

```typescript
// stores/compose-store.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface ComposeState {
  // State
  caption: string;
  media: MediaItem[];
  selectedAccounts: string[];
  scheduledAt: Date | null;
  
  // Actions
  setCaption: (caption: string) => void;
  addMedia: (media: MediaItem) => void;
  removeMedia: (id: string) => void;
  toggleAccount: (accountId: string) => void;
  schedulePost: (date: Date) => void;
  reset: () => void;
}

const initialState = {
  caption: '',
  media: [],
  selectedAccounts: [],
  scheduledAt: null,
};

export const useComposeStore = create<ComposeState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,
        
        setCaption: (caption) => set((state) => {
          state.caption = caption;
        }),
        
        addMedia: (media) => set((state) => {
          state.media.push(media);
        }),
        
        removeMedia: (id) => set((state) => {
          state.media = state.media.filter((m) => m.id !== id);
        }),
        
        toggleAccount: (accountId) => set((state) => {
          const index = state.selectedAccounts.indexOf(accountId);
          if (index === -1) {
            state.selectedAccounts.push(accountId);
          } else {
            state.selectedAccounts.splice(index, 1);
          }
        }),
        
        schedulePost: (date) => set((state) => {
          state.scheduledAt = date;
        }),
        
        reset: () => set(initialState),
      })),
      { name: 'compose-store' }
    ),
    { name: 'ComposeStore' }
  )
);
```

### 2. Middleware Stack Order

**Critical**: Middleware order matters. Apply from outside-in:

```typescript
// Correct order: devtools → persist → immer → your store
create()(
  devtools(           // Outer: enables Redux DevTools
    persist(          // Middle: handles storage
      immer((set) => ({  // Inner: enables immutable updates
        // ... store
      })),
      { name: 'store-key' }
    ),
    { name: 'StoreName' }
  )
);
```

Why this order:
- `devtools` wraps everything to capture all state changes
- `persist` must wrap the actual store logic, not the devtools
- `immer` enables mutable-style updates in the innermost layer

---

## Selector Patterns

### Avoid Re-renders with Shallow Equality

```typescript
// BAD: Creates new object every render, triggers re-renders
const { caption, media } = useComposeStore((state) => ({
  caption: state.caption,
  media: state.media,
}));

// GOOD: Use shallow comparison
import { useShallow } from 'zustand/react/shallow';

const { caption, media } = useComposeStore(
  useShallow((state) => ({
    caption: state.caption,
    media: state.media,
  }))
);

// BEST: Select primitives directly (no shallow needed)
const caption = useComposeStore((state) => state.caption);
const mediaCount = useComposeStore((state) => state.media.length);
```

### Computed/Derived State

```typescript
// stores/compose-store.ts

// Option 1: Selector functions (recommended for simple derivations)
export const selectMediaCount = (state: ComposeState) => state.media.length;
export const selectHasMedia = (state: ComposeState) => state.media.length > 0;
export const selectCanPublish = (state: ComposeState) => 
  state.selectedAccounts.length > 0 && 
  (state.caption.trim().length > 0 || state.media.length > 0);

// Usage
const canPublish = useComposeStore(selectCanPublish);

// Option 2: Memoized selectors for expensive computations
import { useMemo } from 'react';

function useMediaStats() {
  const media = useComposeStore((state) => state.media);
  
  return useMemo(() => ({
    totalSize: media.reduce((acc, m) => acc + m.size, 0),
    videoCount: media.filter((m) => m.type === 'video').length,
    imageCount: media.filter((m) => m.type === 'image').length,
  }), [media]);
}
```

---

## Async Actions

### Pattern 1: Actions Within Store

```typescript
interface PostsState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
  
  fetchPosts: () => Promise<void>;
  createPost: (post: CreatePostInput) => Promise<Post>;
}

export const usePostsStore = create<PostsState>()(
  immer((set, get) => ({
    posts: [],
    isLoading: false,
    error: null,
    
    fetchPosts: async () => {
      set((state) => {
        state.isLoading = true;
        state.error = null;
      });
      
      try {
        const response = await fetch('/api/posts');
        const posts = await response.json();
        
        set((state) => {
          state.posts = posts;
          state.isLoading = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error instanceof Error ? error.message : 'Failed to fetch';
          state.isLoading = false;
        });
      }
    },
    
    createPost: async (input) => {
      const response = await fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const newPost = await response.json();
      
      set((state) => {
        state.posts.unshift(newPost);
      });
      
      return newPost;
    },
  }))
);
```

### Pattern 2: External Actions (Better for Complex Logic)

```typescript
// stores/posts-store.ts
interface PostsState {
  posts: Post[];
  isLoading: boolean;
  error: string | null;
}

interface PostsActions {
  setPosts: (posts: Post[]) => void;
  addPost: (post: Post) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const usePostsStore = create<PostsState & PostsActions>()(
  immer((set) => ({
    posts: [],
    isLoading: false,
    error: null,
    
    setPosts: (posts) => set((state) => { state.posts = posts; }),
    addPost: (post) => set((state) => { state.posts.unshift(post); }),
    setLoading: (loading) => set((state) => { state.isLoading = loading; }),
    setError: (error) => set((state) => { state.error = error; }),
  }))
);

// lib/actions/posts.ts - Business logic separate from store
export async function fetchPosts() {
  const { setLoading, setError, setPosts } = usePostsStore.getState();
  
  setLoading(true);
  setError(null);
  
  try {
    const response = await fetch('/api/posts');
    const posts = await response.json();
    setPosts(posts);
  } catch (error) {
    setError(error instanceof Error ? error.message : 'Failed to fetch');
  } finally {
    setLoading(false);
  }
}
```

---

## Persistence Patterns

### Selective Persistence

```typescript
export const useComposeStore = create<ComposeState>()(
  persist(
    (set) => ({
      // ... store
    }),
    {
      name: 'compose-store',
      
      // Only persist specific fields
      partialize: (state) => ({
        caption: state.caption,
        selectedAccounts: state.selectedAccounts,
        // Exclude: media (too large), scheduledAt (stale)
      }),
      
      // Custom storage (e.g., for SSR compatibility)
      storage: createJSONStorage(() => localStorage),
      
      // Migration for schema changes
      version: 2,
      migrate: (persisted, version) => {
        if (version === 1) {
          // Migrate from v1 to v2
          return {
            ...persisted,
            selectedAccounts: persisted.accounts || [], // renamed field
          };
        }
        return persisted as ComposeState;
      },
    }
  )
);
```

### Session Storage for Sensitive Data

```typescript
import { createJSONStorage } from 'zustand/middleware';

const sessionStorage = createJSONStorage(() => window.sessionStorage);

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // ... auth state
    }),
    {
      name: 'auth-store',
      storage: sessionStorage, // Cleared on tab close
    }
  )
);
```

---

## Slices Pattern (Large Stores)

For complex applications, split stores into composable slices:

```typescript
// stores/slices/media-slice.ts
export interface MediaSlice {
  media: MediaItem[];
  addMedia: (media: MediaItem) => void;
  removeMedia: (id: string) => void;
}

export const createMediaSlice: StateCreator<
  EditorState,
  [['zustand/immer', never]],
  [],
  MediaSlice
> = (set) => ({
  media: [],
  addMedia: (media) => set((state) => { state.media.push(media); }),
  removeMedia: (id) => set((state) => { 
    state.media = state.media.filter((m) => m.id !== id); 
  }),
});

// stores/slices/timeline-slice.ts
export interface TimelineSlice {
  currentTime: number;
  duration: number;
  setCurrentTime: (time: number) => void;
}

export const createTimelineSlice: StateCreator<
  EditorState,
  [['zustand/immer', never]],
  [],
  TimelineSlice
> = (set) => ({
  currentTime: 0,
  duration: 0,
  setCurrentTime: (time) => set((state) => { state.currentTime = time; }),
});

// stores/editor-store.ts
type EditorState = MediaSlice & TimelineSlice;

export const useEditorStore = create<EditorState>()(
  devtools(
    immer((...args) => ({
      ...createMediaSlice(...args),
      ...createTimelineSlice(...args),
    })),
    { name: 'EditorStore' }
  )
);
```

---

## Store Access Outside React

```typescript
// Access store state outside components
const currentCaption = useComposeStore.getState().caption;

// Subscribe to changes
const unsubscribe = useComposeStore.subscribe(
  (state) => state.media.length,
  (mediaCount, prevMediaCount) => {
    console.log(`Media count changed: ${prevMediaCount} → ${mediaCount}`);
  }
);

// Update store from anywhere (API routes, utilities, etc.)
useComposeStore.getState().setCaption('Updated from outside React');
```

---

## Testing Patterns

```typescript
// __tests__/stores/compose-store.test.ts
import { act } from 'react';
import { useComposeStore } from '@/stores/compose-store';

describe('ComposeStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useComposeStore.setState({
      caption: '',
      media: [],
      selectedAccounts: [],
      scheduledAt: null,
    });
  });

  it('should add media', () => {
    const media: MediaItem = { id: '1', type: 'image', url: '/test.jpg', size: 1000 };
    
    act(() => {
      useComposeStore.getState().addMedia(media);
    });
    
    expect(useComposeStore.getState().media).toHaveLength(1);
    expect(useComposeStore.getState().media[0]).toEqual(media);
  });

  it('should toggle accounts', () => {
    act(() => {
      useComposeStore.getState().toggleAccount('account-1');
    });
    expect(useComposeStore.getState().selectedAccounts).toContain('account-1');
    
    act(() => {
      useComposeStore.getState().toggleAccount('account-1');
    });
    expect(useComposeStore.getState().selectedAccounts).not.toContain('account-1');
  });
});
```

---

## Common Pitfalls

### 1. Stale Closures in Callbacks

```typescript
// BAD: Stale closure
const handleClick = () => {
  const media = useComposeStore.getState().media; // Gets current value
  setTimeout(() => {
    console.log(media); // Stale! Won't reflect updates during timeout
  }, 1000);
};

// GOOD: Get fresh state when needed
const handleClick = () => {
  setTimeout(() => {
    const media = useComposeStore.getState().media; // Fresh value
    console.log(media);
  }, 1000);
};
```

### 2. Hydration Mismatch (SSR)

```typescript
// Use skipHydration for SSR apps
export const useComposeStore = create<ComposeState>()(
  persist(
    (set) => ({ /* ... */ }),
    {
      name: 'compose-store',
      skipHydration: true, // Don't hydrate during SSR
    }
  )
);

// Hydrate on client only
'use client';
import { useEffect } from 'react';

export function StoreHydration() {
  useEffect(() => {
    useComposeStore.persist.rehydrate();
  }, []);
  
  return null;
}
```

### 3. Circular Dependencies

Keep stores independent. If stores need to communicate:

```typescript
// Use subscriptions, not imports
useAuthStore.subscribe(
  (state) => state.userId,
  (userId) => {
    if (!userId) {
      // Clear user-specific stores on logout
      useComposeStore.getState().reset();
      usePostsStore.getState().reset();
    }
  }
);
```
