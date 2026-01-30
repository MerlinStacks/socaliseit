---
name: social-media-api-patterns
description: Master social media platform API integration patterns for Meta, TikTok, Pinterest, YouTube, and X. Covers OAuth2 flows, rate limiting, webhook handling, content publishing, and platform-specific quirks.
---

# Social Media API Patterns

Expert guide for integrating with major social media platform APIs. Use when implementing OAuth connections, publishing content, handling webhooks, or debugging platform-specific issues.

## Core Principles

### 1. Platform Abstraction Layer

Always create a unified interface that abstracts platform differences:

```typescript
// lib/platforms/types.ts
interface PlatformClient {
  readonly platform: PlatformType;
  
  // Auth
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  
  // Publishing
  publishPost(post: PublishPayload): Promise<PublishResult>;
  uploadMedia(media: MediaUpload): Promise<MediaHandle>;
  
  // Analytics
  getInsights(params: InsightParams): Promise<InsightData>;
}
```

### 2. Token Management

**Critical**: Never store tokens in plain text. Always encrypt at rest.

```typescript
// lib/platforms/token-manager.ts
import { encrypt, decrypt } from '@/lib/crypto';

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string[];
}

class TokenManager {
  /**
   * Retrieves and auto-refreshes tokens if expired.
   * Why: Platforms revoke expired tokens; proactive refresh prevents 401 cascades.
   */
  async getValidToken(accountId: string): Promise<string> {
    const stored = await this.getStoredToken(accountId);
    
    // Refresh 5 minutes before expiry to prevent race conditions
    const bufferMs = 5 * 60 * 1000;
    if (stored.expiresAt.getTime() - bufferMs < Date.now()) {
      return this.refreshAndStore(accountId, stored.refreshToken);
    }
    
    return decrypt(stored.accessToken);
  }
}
```

---

## Platform-Specific Patterns

### Meta (Facebook/Instagram)

**API Version**: Always pin to a specific version (e.g., `v18.0`). Meta deprecates versions aggressively.

```typescript
// lib/platforms/meta/client.ts
const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

class MetaClient implements PlatformClient {
  /**
   * Meta requires page access tokens for publishing, not user tokens.
   * Why: User tokens can't post to Pages; must exchange for Page token.
   */
  async getPageToken(userToken: string, pageId: string): Promise<string> {
    const response = await fetch(
      `${META_BASE_URL}/${pageId}?fields=access_token&access_token=${userToken}`
    );
    const data = await response.json();
    return data.access_token;
  }

  /**
   * Instagram publishing requires a 2-step process:
   * 1. Create media container
   * 2. Publish the container
   */
  async publishToInstagram(igUserId: string, payload: PublishPayload): Promise<string> {
    // Step 1: Create container
    const container = await fetch(`${META_BASE_URL}/${igUserId}/media`, {
      method: 'POST',
      body: JSON.stringify({
        image_url: payload.mediaUrl,
        caption: payload.caption,
        access_token: payload.accessToken,
      }),
    });
    const { id: containerId } = await container.json();

    // Step 2: Wait for container to be ready (async processing)
    await this.waitForContainerReady(containerId, payload.accessToken);

    // Step 3: Publish
    const publish = await fetch(`${META_BASE_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      body: JSON.stringify({
        creation_id: containerId,
        access_token: payload.accessToken,
      }),
    });
    
    return (await publish.json()).id;
  }

  /**
   * Instagram containers take 5-30 seconds to process.
   * Why: IG transcodes media server-side; publishing before ready = 400 error.
   */
  private async waitForContainerReady(
    containerId: string, 
    token: string,
    maxAttempts = 10
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await fetch(
        `${META_BASE_URL}/${containerId}?fields=status_code&access_token=${token}`
      );
      const { status_code } = await status.json();
      
      if (status_code === 'FINISHED') return;
      if (status_code === 'ERROR') throw new Error('Media processing failed');
      
      await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error('Container processing timeout');
  }
}
```

**Rate Limits**:
- 200 calls/user/hour for most endpoints
- 25 posts/day per Instagram account
- Use `x-business-use-case-usage` header to track limits

---

### TikTok

**Critical Quirks**:
- Videos must be uploaded via their chunked upload API
- Access tokens expire in 24 hours (refresh tokens in 365 days)
- Sandbox mode has severe limitations; test with approved app

```typescript
// lib/platforms/tiktok/client.ts
class TikTokClient implements PlatformClient {
  /**
   * TikTok requires chunked uploads for videos > 64MB.
   * Why: Their API rejects large single-part uploads.
   */
  async uploadVideo(file: Buffer, accessToken: string): Promise<string> {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    
    // 1. Initialize upload
    const init = await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: file.length,
          chunk_size: CHUNK_SIZE,
          total_chunk_count: Math.ceil(file.length / CHUNK_SIZE),
        },
      }),
    });
    
    const { data: { publish_id, upload_url } } = await init.json();
    
    // 2. Upload chunks
    for (let i = 0; i < Math.ceil(file.length / CHUNK_SIZE); i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${i * CHUNK_SIZE}-${i * CHUNK_SIZE + chunk.length - 1}/${file.length}`,
        },
        body: chunk,
      });
    }
    
    return publish_id;
  }

  /**
   * TikTok OAuth uses PKCE. Always generate fresh code_verifier per auth.
   */
  getAuthUrl(state: string): string {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    
    // Store codeVerifier in session for token exchange
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      scope: 'user.info.basic,video.publish',
      response_type: 'code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })}`;
  }
}
```

---

### YouTube

```typescript
// lib/platforms/youtube/client.ts
class YouTubeClient implements PlatformClient {
  /**
   * YouTube uses resumable uploads for reliability.
   * Why: Large video files need resume capability on network failures.
   */
  async uploadVideo(
    file: Buffer,
    metadata: VideoMetadata,
    accessToken: string
  ): Promise<string> {
    // 1. Start resumable upload session
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': file.length.toString(),
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            categoryId: metadata.categoryId,
          },
          status: {
            privacyStatus: metadata.privacyStatus,
            selfDeclaredMadeForKids: false,
          },
        }),
      }
    );

    const uploadUrl = initResponse.headers.get('Location')!;
    
    // 2. Upload the file
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': file.length.toString(),
        'Content-Type': 'video/*',
      },
      body: file,
    });

    const { id } = await uploadResponse.json();
    return id;
  }
}
```

**Quota Management**:
- YouTube uses quota units, not simple rate limits
- Video upload = 1600 units; read operations = 1-100 units
- Default quota: 10,000 units/day
- Track usage in database to prevent quota exhaustion

---

### Pinterest

```typescript
// lib/platforms/pinterest/client.ts
class PinterestClient implements PlatformClient {
  /**
   * Pinterest requires board_id for all pins.
   * Why: Unlike other platforms, content must belong to a board.
   */
  async createPin(payload: PinPayload, accessToken: string): Promise<string> {
    const response = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        board_id: payload.boardId,
        media_source: {
          source_type: 'image_url',
          url: payload.imageUrl,
        },
        title: payload.title,
        description: payload.description,
        link: payload.destinationUrl,
        alt_text: payload.altText,
      }),
    });

    const { id } = await response.json();
    return id;
  }

  /**
   * Fetch user's boards for selection UI.
   */
  async getBoards(accessToken: string): Promise<Board[]> {
    const response = await fetch(
      'https://api.pinterest.com/v5/boards?page_size=100',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );
    
    const { items } = await response.json();
    return items;
  }
}
```

---

## Rate Limiting Strategy

Implement exponential backoff with jitter:

```typescript
// lib/platforms/rate-limiter.ts
interface RateLimitConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  config: RateLimitConfig = { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 60000 }
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      
      lastError = error;
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        config.maxDelayMs
      );
      
      console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status === 429;
  }
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}
```

---

## Webhook Verification

Each platform uses different webhook verification methods:

```typescript
// app/api/webhooks/[platform]/route.ts
import crypto from 'crypto';

// Meta uses SHA256 HMAC
function verifyMetaWebhook(body: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(body)
    .digest('hex');
  return `sha256=${expected}` === signature;
}

// TikTok uses SHA256 with timestamp
function verifyTikTokWebhook(
  body: string, 
  timestamp: string, 
  signature: string
): boolean {
  const payload = `${timestamp}${body}`;
  const expected = crypto
    .createHmac('sha256', process.env.TIKTOK_CLIENT_SECRET!)
    .update(payload)
    .digest('hex');
  return expected === signature;
}
```

---

## Error Handling Patterns

```typescript
// lib/platforms/errors.ts
class PlatformError extends Error {
  constructor(
    public platform: PlatformType,
    public code: string,
    public originalError: unknown,
    message: string
  ) {
    super(message);
    this.name = 'PlatformError';
  }
  
  get isRetryable(): boolean {
    return ['RATE_LIMIT', 'TIMEOUT', 'SERVER_ERROR'].includes(this.code);
  }
  
  get requiresReauth(): boolean {
    return ['TOKEN_EXPIRED', 'INVALID_TOKEN', 'REVOKED'].includes(this.code);
  }
}

function normalizePlatformError(platform: PlatformType, error: unknown): PlatformError {
  // Meta errors
  if (platform === 'meta' && error && typeof error === 'object') {
    const metaError = error as { error?: { code: number; message: string } };
    if (metaError.error?.code === 190) {
      return new PlatformError(platform, 'TOKEN_EXPIRED', error, 'Access token expired');
    }
    if (metaError.error?.code === 4) {
      return new PlatformError(platform, 'RATE_LIMIT', error, 'Rate limit exceeded');
    }
  }
  
  // Generic fallback
  return new PlatformError(
    platform, 
    'UNKNOWN', 
    error, 
    error instanceof Error ? error.message : 'Unknown error'
  );
}
```

---

## Testing Strategies

1. **Use platform sandboxes** where available (Meta, TikTok)
2. **Mock API responses** for unit tests with realistic error scenarios
3. **Record/replay** actual API responses for integration tests
4. **Monitor rate limit headers** in production to tune request patterns
