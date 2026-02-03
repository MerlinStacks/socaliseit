---
name: realtime-websocket-patterns
description: Master WebSocket and Socket.io for real-time communication, presence detection, and live updates. Use when building chat, notifications, or collaborative features.
---

# Real-Time WebSocket Patterns

Expert guide for real-time features using WebSockets and Socket.io.

## When to Use This Skill

- Building real-time chat or messaging
- Implementing live notifications
- Creating collaborative editing
- Building live dashboards
- Implementing presence detection

## Socket.io Server Setup

```typescript
// lib/socket/server.ts
import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';

interface ServerToClientEvents {
  'notification:new': (data: { id: string; message: string }) => void;
  'presence:update': (data: { userId: string; status: 'online' | 'offline' }) => void;
}

interface ClientToServerEvents {
  'room:join': (roomId: string) => void;
  'room:leave': (roomId: string) => void;
}

export function initializeSocket(httpServer: HTTPServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL, credentials: true },
    pingTimeout: 60000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Auth required'));
    
    const payload = await verifyToken(token);
    socket.data.userId = payload.userId;
    next();
  });

  io.on('connection', handleConnection);
  return io;
}
```

## Connection Handling

```typescript
const userSockets = new Map<string, Set<string>>();

function handleConnection(socket: Socket): void {
  const { userId } = socket.data;
  
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId)!.add(socket.id);

  socket.join(`user:${userId}`);
  socket.broadcast.emit('presence:update', { userId, status: 'online' });

  socket.on('room:join', (roomId) => socket.join(roomId));
  socket.on('room:leave', (roomId) => socket.leave(roomId));

  socket.on('disconnect', () => {
    const sockets = userSockets.get(userId);
    sockets?.delete(socket.id);
    if (sockets?.size === 0) {
      userSockets.delete(userId);
      socket.broadcast.emit('presence:update', { userId, status: 'offline' });
    }
  });
}
```

## React Client Hook

```typescript
// hooks/use-socket.ts
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(token: string | undefined) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [token]);

  const subscribe = useCallback((event: string, handler: Function) => {
    socketRef.current?.on(event, handler as any);
    return () => socketRef.current?.off(event, handler as any);
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { subscribe, emit, socket: socketRef.current };
}
```

## Typing Indicators

```typescript
export function useTypingIndicator(roomId: string) {
  const { subscribe, emit } = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribe('typing:start', ({ userId }) => {
      setTypingUsers((prev) => [...new Set([...prev, userId])]);
      setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u !== userId));
      }, 3000);
    });
    return unsub;
  }, [subscribe]);

  const startTyping = () => emit('typing:start', { roomId });
  return { typingUsers, startTyping };
}
```

## Scaling with Redis

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export async function createScaledServer(httpServer: HTTPServer) {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  const io = new Server(httpServer);
  io.adapter(createAdapter(pubClient, subClient));
  return io;
}
```

## Best Practices

1. **Authenticate connections** - Verify tokens in middleware
2. **Use rooms** - Target messages instead of broadcasting
3. **Handle reconnection** - Sync state after reconnect
4. **Use Redis adapter** - Required for multi-server
5. **Clean up listeners** - Prevent memory leaks
