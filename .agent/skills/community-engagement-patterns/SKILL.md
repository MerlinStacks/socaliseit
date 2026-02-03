---
name: community-engagement-patterns
description: Master community management with unified inbox, auto-responses, moderation, and influencer collaboration. Use when building engagement tools or community management features.
---

# Community Engagement Patterns

Expert guide for building community management and engagement tools.

## When to Use This Skill

- Building unified inbox for social interactions
- Implementing auto-response systems
- Creating moderation workflows
- Managing influencer collaborations
- Building team assignment features

## Unified Inbox

```typescript
// types/inbox.ts
interface InboxItem {
  id: string;
  type: 'comment' | 'dm' | 'mention' | 'review';
  platform: Platform;
  author: {
    id: string;
    name: string;
    avatar: string;
    followerCount?: number;
  };
  content: string;
  mediaUrls?: string[];
  parentId?: string; // For replies
  postId?: string;   // Associated post
  sentiment?: 'positive' | 'neutral' | 'negative';
  priority: 'high' | 'medium' | 'low';
  status: 'unread' | 'read' | 'replied' | 'archived';
  assignedTo?: string;
  createdAt: Date;
}

interface InboxFilters {
  platforms?: Platform[];
  types?: InboxItem['type'][];
  status?: InboxItem['status'];
  sentiment?: InboxItem['sentiment'];
  assignedTo?: string;
  dateRange?: { start: Date; end: Date };
}
```

## Inbox Component

```tsx
// components/inbox/inbox-view.tsx
'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

export function InboxView() {
  const [filters, setFilters] = useState<InboxFilters>({});
  const [selectedItem, setSelectedItem] = useState<InboxItem | null>(null);

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['inbox', filters],
    queryFn: ({ pageParam }) => fetchInboxItems(filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="inbox-layout">
      <InboxFilters filters={filters} onChange={setFilters} />
      
      <div className="inbox-list">
        {items.map((item) => (
          <InboxItemCard
            key={item.id}
            item={item}
            isSelected={selectedItem?.id === item.id}
            onClick={() => setSelectedItem(item)}
          />
        ))}
        {hasNextPage && <button onClick={() => fetchNextPage()}>Load more</button>}
      </div>
      
      {selectedItem && (
        <InboxDetail
          item={selectedItem}
          onReply={handleReply}
          onArchive={handleArchive}
        />
      )}
    </div>
  );
}
```

## Auto-Response System

```typescript
// lib/engagement/auto-response.ts
interface AutoResponseRule {
  id: string;
  name: string;
  trigger: {
    type: 'keyword' | 'sentiment' | 'author_type' | 'time';
    conditions: Record<string, unknown>;
  };
  action: {
    type: 'reply' | 'assign' | 'tag' | 'notify';
    template?: string;
    assignTo?: string;
    tags?: string[];
  };
  enabled: boolean;
  priority: number;
}

export async function processInboxItem(item: InboxItem): Promise<void> {
  const rules = await getEnabledRules(item.platform);
  
  for (const rule of rules.sort((a, b) => b.priority - a.priority)) {
    if (matchesRule(item, rule)) {
      await executeAction(item, rule.action);
      
      // Stop if this rule is terminal
      if (rule.action.type === 'reply') break;
    }
  }
}

function matchesRule(item: InboxItem, rule: AutoResponseRule): boolean {
  switch (rule.trigger.type) {
    case 'keyword':
      const keywords = rule.trigger.conditions.keywords as string[];
      return keywords.some((kw) => item.content.toLowerCase().includes(kw.toLowerCase()));
    
    case 'sentiment':
      return item.sentiment === rule.trigger.conditions.sentiment;
    
    case 'author_type':
      const minFollowers = rule.trigger.conditions.minFollowers as number;
      return (item.author.followerCount ?? 0) >= minFollowers;
    
    default:
      return false;
  }
}
```

## Saved Replies (Canned Responses)

```typescript
// lib/engagement/saved-replies.ts
interface SavedReply {
  id: string;
  name: string;
  content: string;
  variables: string[]; // e.g., ['name', 'product']
  platforms: Platform[];
  category: string;
  usageCount: number;
}

export function interpolateReply(
  reply: SavedReply,
  context: Record<string, string>
): string {
  let content = reply.content;
  
  for (const variable of reply.variables) {
    const value = context[variable] ?? `{${variable}}`;
    content = content.replace(new RegExp(`\\{${variable}\\}`, 'g'), value);
  }
  
  return content;
}

// Usage
const reply = await getSavedReply('thank_you');
const message = interpolateReply(reply, {
  name: item.author.name,
  product: 'SocialiseIT',
});
```

## Sentiment Analysis

```typescript
// lib/engagement/sentiment.ts
export async function analyzeSentiment(text: string): Promise<{
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  keywords: string[];
}> {
  // Use AI or rule-based analysis
  const result = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{
      role: 'system',
      content: 'Analyze sentiment. Return JSON: { sentiment, score, keywords }',
    }, {
      role: 'user',
      content: text,
    }],
    response_format: { type: 'json_object' },
  });
  
  return JSON.parse(result.choices[0].message.content);
}

// Priority based on sentiment and author influence
export function calculatePriority(item: InboxItem): InboxItem['priority'] {
  // High-follower negative = urgent
  if (item.sentiment === 'negative' && (item.author.followerCount ?? 0) > 10000) {
    return 'high';
  }
  
  // Negative sentiment
  if (item.sentiment === 'negative') return 'medium';
  
  // High-follower positive = opportunity
  if ((item.author.followerCount ?? 0) > 50000) return 'medium';
  
  return 'low';
}
```

## Team Assignment

```typescript
// lib/engagement/assignment.ts
interface AssignmentRule {
  platform?: Platform;
  sentiment?: string;
  keywords?: string[];
  assignTo: string;
}

export async function autoAssign(item: InboxItem): Promise<string | null> {
  const rules = await getAssignmentRules();
  
  for (const rule of rules) {
    if (rule.platform && rule.platform !== item.platform) continue;
    if (rule.sentiment && rule.sentiment !== item.sentiment) continue;
    if (rule.keywords?.length && !rule.keywords.some((k) => item.content.includes(k))) continue;
    
    return rule.assignTo;
  }
  
  // Round-robin fallback
  return getNextAvailableAgent();
}
```

## Best Practices

1. **Prioritize by impact** - Influential/negative first
2. **Use templates** - Consistent, fast responses
3. **Track response time** - SLA monitoring
4. **Auto-tag** - Categorize for reporting
5. **Enable collaboration** - Internal notes, assignments
6. **Sentiment matters** - Flag negative for quick action
