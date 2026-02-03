---
name: content-calendar-scheduling
description: Master content calendar architecture, scheduling queues, and cross-platform timing optimization. Use when building social media schedulers or content planning tools.
---

# Content Calendar & Scheduling

Expert guide for building content calendar and scheduling systems for social media.

## When to Use This Skill

- Building content calendars
- Implementing post scheduling
- Optimizing posting times
- Managing cross-platform publishing
- Building bulk scheduling features

## Calendar Data Model

```typescript
// types/calendar.ts
interface ScheduledPost {
  id: string;
  content: {
    text: string;
    media: MediaItem[];
    platformOverrides: Record<Platform, PlatformContent>;
  };
  scheduledAt: Date;
  timezone: string;
  platforms: Platform[];
  status: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  publishResults: Record<Platform, PublishResult>;
  createdBy: string;
  createdAt: Date;
}

interface CalendarView {
  type: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  posts: ScheduledPost[];
}
```

## Calendar Components

```tsx
// components/calendar/week-view.tsx
'use client';
import { useMemo } from 'react';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';

interface WeekViewProps {
  currentDate: Date;
  posts: ScheduledPost[];
  onSlotClick: (date: Date, hour: number) => void;
}

export function WeekView({ currentDate, posts, onSlotClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const postsByDayHour = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    posts.forEach((post) => {
      const key = `${format(post.scheduledAt, 'yyyy-MM-dd')}-${post.scheduledAt.getHours()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    });
    return map;
  }, [posts]);

  return (
    <div className="week-grid">
      {days.map((day) => (
        <div key={day.toISOString()} className="day-column">
          <div className="day-header">{format(day, 'EEE d')}</div>
          {hours.map((hour) => {
            const key = `${format(day, 'yyyy-MM-dd')}-${hour}`;
            const slotPosts = postsByDayHour.get(key) || [];
            
            return (
              <div
                key={hour}
                className="hour-slot"
                onClick={() => onSlotClick(day, hour)}
              >
                {slotPosts.map((post) => (
                  <PostCard key={post.id} post={post} compact />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

## Scheduling Queue

```typescript
// lib/scheduling/queue.ts
import { Queue, Worker } from 'bullmq';

interface PublishJob {
  postId: string;
  platform: Platform;
  content: PlatformContent;
  accessToken: string;
}

export const publishQueue = new Queue<PublishJob>('post-publishing', {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
  },
});

export async function schedulePost(post: ScheduledPost): Promise<void> {
  const delay = post.scheduledAt.getTime() - Date.now();
  
  for (const platform of post.platforms) {
    await publishQueue.add(
      'publish',
      {
        postId: post.id,
        platform,
        content: post.content.platformOverrides[platform] || post.content,
        accessToken: await getAccessToken(post.createdBy, platform),
      },
      {
        delay: Math.max(0, delay),
        jobId: `${post.id}:${platform}`,
      }
    );
  }
  
  await updatePostStatus(post.id, 'scheduled');
}

// Worker
export const publishWorker = new Worker<PublishJob>('post-publishing', async (job) => {
  const { postId, platform, content, accessToken } = job.data;
  
  try {
    const result = await publishToPlatform(platform, content, accessToken);
    await updatePublishResult(postId, platform, { success: true, platformId: result.id });
  } catch (error) {
    await updatePublishResult(postId, platform, { success: false, error: error.message });
    throw error;
  }
});
```

## Optimal Timing

```typescript
// lib/scheduling/optimal-times.ts
interface TimeSlot {
  day: number; // 0-6
  hour: number; // 0-23
  score: number;
}

const PLATFORM_BEST_TIMES: Record<Platform, TimeSlot[]> = {
  instagram: [
    { day: 1, hour: 11, score: 95 }, // Monday 11am
    { day: 3, hour: 11, score: 90 }, // Wednesday 11am
    { day: 5, hour: 10, score: 88 }, // Friday 10am
  ],
  twitter: [
    { day: 1, hour: 8, score: 92 },
    { day: 2, hour: 9, score: 90 },
    { day: 3, hour: 12, score: 88 },
  ],
  // ... other platforms
};

export function suggestOptimalTimes(
  platform: Platform,
  timezone: string,
  count: number = 5
): Date[] {
  const slots = PLATFORM_BEST_TIMES[platform] || [];
  const now = new Date();
  const suggestions: Date[] = [];
  
  // Find next occurrences of optimal slots
  for (const slot of slots.slice(0, count)) {
    const date = getNextOccurrence(now, slot.day, slot.hour, timezone);
    suggestions.push(date);
  }
  
  return suggestions.sort((a, b) => a.getTime() - b.getTime());
}
```

## Drag & Drop Rescheduling

```tsx
// components/calendar/draggable-post.tsx
import { useDrag, useDrop } from 'react-dnd';

export function DraggablePost({ post, onMove }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'POST',
    item: { id: post.id, scheduledAt: post.scheduledAt },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  return (
    <div ref={drag} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <PostCard post={post} />
    </div>
  );
}

export function DroppableSlot({ date, onDrop, children }) {
  const [{ isOver }, drop] = useDrop({
    accept: 'POST',
    drop: (item: { id: string }) => onDrop(item.id, date),
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  return (
    <div ref={drop} className={isOver ? 'drop-target' : ''}>
      {children}
    </div>
  );
}
```

## Timezone Handling

```typescript
// lib/scheduling/timezone.ts
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

export function scheduleInUserTimezone(
  localDateTime: Date,
  userTimezone: string
): Date {
  // Convert user's local time to UTC for storage
  return fromZonedTime(localDateTime, userTimezone);
}

export function displayInUserTimezone(
  utcDate: Date,
  userTimezone: string
): string {
  return formatInTimeZone(utcDate, userTimezone, 'MMM d, yyyy h:mm a zzz');
}
```

## Best Practices

1. **Store in UTC** - Convert to user timezone for display
2. **Allow platform overrides** - Different content per platform
3. **Queue with delays** - Use job queues for reliability
4. **Handle failures** - Retry with backoff, notify on final failure
5. **Suggest optimal times** - Use engagement data
6. **Support bulk scheduling** - CSV import, recurring posts
