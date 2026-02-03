---
name: notification-systems
description: Master push notifications, in-app alerts, and scheduled messaging. Use when implementing notification infrastructure, Web Push, or mobile notifications.
---

# Notification Systems

Expert guide for building notification infrastructure across web and mobile.

## When to Use This Skill

- Setting up Web Push notifications
- Building in-app notification centers
- Implementing email notifications
- Scheduling notifications
- Managing notification preferences

## Web Push Setup

```typescript
// lib/notifications/vapid.ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:support@example.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (error: any) {
    if (error.statusCode === 410) {
      // Subscription expired, remove from database
      await removeSubscription(subscription.endpoint);
    }
    throw error;
  }
}
```

## In-App Notification Store

```typescript
// stores/notification-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  actionUrl?: string;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  add: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      
      add: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: crypto.randomUUID(),
          read: false,
          createdAt: new Date(),
        };
        set((state) => ({
          notifications: [newNotification, ...state.notifications].slice(0, 100),
          unreadCount: state.unreadCount + 1,
        }));
      },
      
      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      },
      
      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        }));
      },
      
      remove: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
      
      clear: () => set({ notifications: [], unreadCount: 0 }),
    }),
    { name: 'notifications' }
  )
);
```

## Notification Center Component

```tsx
// components/notification-center.tsx
'use client';
import { useNotificationStore } from '@/stores/notification-store';
import { formatDistanceToNow } from 'date-fns';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();

  return (
    <div className="notification-center">
      <div className="header">
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead}>Mark all read</button>
        )}
      </div>
      
      <div className="notifications-list">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`notification ${!notification.read ? 'unread' : ''}`}
            onClick={() => markAsRead(notification.id)}
          >
            <div className="title">{notification.title}</div>
            <div className="message">{notification.message}</div>
            <div className="time">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Toast Notifications

```typescript
// lib/notifications/toast.ts
import { toast } from 'sonner';

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast.info(message),
  warning: (message: string) => toast.warning(message),
  
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) => toast.promise(promise, messages),
};
```

## Scheduled Notifications (BullMQ)

```typescript
// lib/notifications/scheduler.ts
import { Queue, Worker } from 'bullmq';

interface ScheduledNotification {
  userId: string;
  title: string;
  body: string;
  sendAt: Date;
  channels: ('push' | 'email' | 'inApp')[];
}

export const notificationQueue = new Queue<ScheduledNotification>('notifications');

export async function scheduleNotification(notification: ScheduledNotification) {
  const delay = new Date(notification.sendAt).getTime() - Date.now();
  
  await notificationQueue.add('send', notification, {
    delay: Math.max(0, delay),
    jobId: `notification:${notification.userId}:${Date.now()}`,
  });
}

// Worker
new Worker<ScheduledNotification>('notifications', async (job) => {
  const { userId, title, body, channels } = job.data;
  
  for (const channel of channels) {
    if (channel === 'push') await sendPush(userId, { title, body });
    if (channel === 'email') await sendEmail(userId, title, body);
    if (channel === 'inApp') await createInAppNotification(userId, title, body);
  }
});
```

## User Preferences

```typescript
// lib/notifications/preferences.ts
interface NotificationPreferences {
  email: boolean;
  push: boolean;
  inApp: boolean;
  categories: {
    marketing: boolean;
    updates: boolean;
    security: boolean;
    social: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
  };
}

export async function shouldNotify(
  userId: string,
  channel: 'email' | 'push' | 'inApp',
  category: string
): Promise<boolean> {
  const prefs = await getUserPreferences(userId);
  
  if (!prefs[channel]) return false;
  if (!prefs.categories[category]) return false;
  
  if (prefs.quietHours.enabled) {
    const now = new Date();
    const currentTime = `${now.getHours()}:${now.getMinutes()}`;
    if (isInQuietHours(currentTime, prefs.quietHours)) return false;
  }
  
  return true;
}
```

## Best Practices

1. **Respect preferences** - Always check user settings
2. **Batch similar notifications** - Avoid notification fatigue
3. **Handle failures gracefully** - Remove invalid subscriptions
4. **Implement quiet hours** - Don't disturb at night
5. **Track engagement** - Measure open rates
6. **Provide unsubscribe** - Easy opt-out is required
