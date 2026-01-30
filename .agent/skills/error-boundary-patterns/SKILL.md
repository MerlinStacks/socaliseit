---
name: error-boundary-patterns
description: React error boundaries, global error handlers, and Sentry/logging integration for production resilience.
---

# Error Boundary Patterns

## React Error Boundary

```typescript
// components/error-boundary.tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h2>Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

## Next.js Error Handling

```typescript
// app/error.tsx (handles runtime errors)
'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-gray-500">{error.message}</p>
      <button onClick={reset} className="mt-4 btn-primary">Try again</button>
    </div>
  );
}

// app/global-error.tsx (handles root layout errors)
'use client';
export default function GlobalError({ error, reset }) {
  return (
    <html><body>
      <h1>Critical Error</h1>
      <button onClick={reset}>Reload</button>
    </body></html>
  );
}

// app/not-found.tsx
export default function NotFound() {
  return <div>Page not found</div>;
}
```

## API Error Handling

```typescript
// lib/api-error.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// app/api/posts/route.ts
export async function GET() {
  try {
    const posts = await prisma.post.findMany();
    return Response.json(posts);
  } catch (error) {
    logger.error('Failed to fetch posts', { error });
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Logger Setup

```typescript
// lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logger = {
  debug: (msg: string, meta?: object) => log('debug', msg, meta),
  info: (msg: string, meta?: object) => log('info', msg, meta),
  warn: (msg: string, meta?: object) => log('warn', msg, meta),
  error: (msg: string, meta?: object) => log('error', msg, meta),
};

function log(level: LogLevel, message: string, meta?: object) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  
  if (process.env.NODE_ENV === 'production') {
    // Send to logging service (e.g., Axiom, Datadog)
    fetch('/api/logs', { method: 'POST', body: JSON.stringify(entry) });
  } else {
    console[level](JSON.stringify(entry, null, 2));
  }
}

export { logger };
```

## Sentry Integration

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Usage
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, { extra: { userId, action } });
  throw error;
}
```
