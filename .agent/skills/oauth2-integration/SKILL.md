---
name: oauth2-integration
description: Deep dive into OAuth2/OIDC flows, token refresh, scope management for platform integrations.
---

# OAuth2 Integration Patterns

## Authorization Code Flow

```typescript
// lib/oauth/client.ts
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

export function getAuthorizationUrl(config: OAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
  });
  return `${config.authorizationUrl}?${params}`;
}

export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string
): Promise<TokenSet> {
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${await response.text()}`);
  }
  
  return response.json();
}
```

## Token Refresh

```typescript
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<TokenSet> {
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
  });
  return response.json();
}

// Auto-refresh middleware
async function getValidToken(accountId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId } });
  
  const bufferMs = 5 * 60 * 1000; // 5 min buffer
  if (account.tokenExpiresAt.getTime() - bufferMs < Date.now()) {
    const newTokens = await refreshAccessToken(config, account.refreshToken);
    await prisma.socialAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encrypt(newTokens.access_token),
        tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
      },
    });
    return newTokens.access_token;
  }
  
  return decrypt(account.accessToken);
}
```

## PKCE Flow (Public Clients)

```typescript
import crypto from 'crypto';

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Store verifier in session, send challenge in auth URL
const verifier = generateCodeVerifier();
const challenge = generateCodeChallenge(verifier);
```

## State Parameter (CSRF Protection)

```typescript
// Generate state with expiry
function generateState(userId: string): string {
  const payload = { userId, exp: Date.now() + 10 * 60 * 1000 };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function validateState(state: string, userId: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(state, 'base64url').toString());
    return payload.userId === userId && payload.exp > Date.now();
  } catch {
    return false;
  }
}
```

## Callback Handler

```typescript
// app/api/auth/callback/[platform]/route.ts
export async function GET(req: Request, { params }: { params: { platform: string } }) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return Response.redirect(`/settings/integrations?error=${error}`);
  }

  const session = await auth();
  if (!validateState(state, session.userId)) {
    return Response.redirect('/settings/integrations?error=invalid_state');
  }

  const tokens = await exchangeCodeForTokens(getConfig(params.platform), code);
  await saveTokens(session.userId, params.platform, tokens);

  return Response.redirect('/settings/integrations?success=true');
}
```
