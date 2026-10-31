# MCP publishing, uploads, and analytics

Other software can use Overseek Socials' authenticated MCP server at
`https://YOUR_HOST/api/mcp` to publish immediately, upload media, and read
workspace analytics. It uses **Streamable HTTP** with JSON responses,
not the legacy SSE transport or a local stdio process. No extra container or port
is needed. Run database migrations when deploying this version (`npm run db:migrate`
in `app/`). The existing Redis
and publishing worker must be running. Always use HTTPS outside local development.

## Create an API key

As a workspace **owner or admin**, open **Settings → Accounts & Shopping → MCP
Publishing**, name the integration, enable **Allow media uploads** if needed,
and create a key. Copy it immediately: the
server stores only its SHA-256 digest. Keys created here expire after 90 days.
Use **Revoke** to disable a key, and create a new one to rotate it. Never put a
key in a URL, repository, prompt, or frontend bundle. Store it in the calling
software's secret store.

Keys are tied to their workspace and issuing user. Each HTTP request rechecks
membership, bans, expiry, revocation, and current permissions. Removing/demoting
the issuer removes the corresponding access. Only owners/admins manage keys.
`publish` requires both `posts.create` and `posts.publish`; `read` requires
`accounts.view`, listing media additionally requires `media.view`, and the
analytics tools additionally require `analytics.view`. Create a
read-only key if the client only needs discovery/status. Uploading requires the
explicit `upload` key scope **and** the issuer's current `media.upload` permission.
Existing keys do not gain upload access automatically: create a replacement key
with uploads enabled, switch the integration, then revoke the old key. Upload-only
keys can be created through the key-management API; they cannot publish or read
post status. Inspecting media status requires `read` and `media.view`. Analytics
needs no new key scope: an existing `read` key gains the analytics tools as soon
as its issuer has `analytics.view`, and loses them again when that permission is
removed. A key whose issuer has **only** `analytics.view` can read metrics and
nothing else.
Likewise, a `read` key whose issuer has only `media.view` can list media and read
media status without gaining account, analytics, or publishing access.

Example client configuration (exact property names depend on the client):

```json
{
  "mcpServers": {
    "overseek-socials": {
      "type": "http",
      "url": "https://YOUR_HOST/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_PUBLISHING_KEY" }
    }
  }
}
```

Clients must support custom Authorization headers; OAuth discovery and dynamic
client registration are not provided. If a client cannot securely send a Bearer
key, it is not supported by this initial implementation. The endpoint accepts
POST only; GET/SSE and DELETE sessions return 405. Send the MCP-standard Accept
header (`application/json, text/event-stream`); the SDK handles this for you.
Browser cross-origin calls are rejected; this is a server-to-server integration.
Configure `AUTH_URL` (or `NEXTAUTH_URL`) to the public application URL behind a proxy.

## Available tools

- `list_accounts`: active connected accounts, excluding manual-only accounts.
- `list_media`: existing workspace media IDs, MIME types, and filenames; 50 per
  page, with an optional `offset`. Includes video transcoding status.
- `upload_media`: save file bytes (base64, up to **8 MiB decoded**) to the media
  library. Returns the new media `id` for `publish_now.mediaIds`.
- `get_media_upload_config`: discover the streaming multipart upload path and
  limits for larger files, using the same Bearer API key.
- `get_media_status`: accepts `mediaId`; checks workspace media metadata and
  video transcoding status without publishing anything.
- `publish_now`: immediately publish to **one account per operation**. Accepts
  `requestId` (UUID), `accountId`, `caption`, `mediaIds`, optional `firstComment`,
  and optional `settings` (post type and platform-specific publishing options).
- `get_publishing_status`: accepts `postId`, returns status, publication timestamp,
  and confirmation guidance. Does not retry or publish anything.
- `get_analytics_summary`: engagement and posting totals for a period, with
  previous-period percentage changes and data-freshness timestamps.
- `get_account_growth`: followers, follower change, profile views and website
  clicks per connected account.
- `get_top_posts`: the five best published posts in a period by engagement rate.
- `get_post_analytics`: accepts `postId`; stored metrics plus publishing context.

Discovery tools require a `read` key scope. `publish_now` requires `publish`.
Post status checks are available to either `read` or `publish`. Upload tools
require `upload`. The analytics tools require `read` **and** the issuer's current
`analytics.view` permission; they are not advertised without it. There are **no tools for
draft creation, scheduling, editing, deletion, or republishing**. Unsupported
fields, including `scheduledAt` and `autoPublish`, are rejected. Per-account
overrides cannot disable immediate publishing or substitute media from another
workspace. Social network OAuth tokens are never returned to the client.

Upload media with MCP, the streaming endpoint, or the application, then reference
its IDs. Arbitrary external URL imports and reading server-local file paths are
not supported. Discovery returns up to 100 accounts. Platform-specific requirements still apply (for
example, Instagram requires media; Pinterest uses `settings.boardId`; YouTube
uses `settings.videoTitle`). The tool schema exposes supported settings.

Example `publish_now` arguments:

```json
{
  "requestId": "4cd9b01c-a81b-40a4-9afd-d5c70b5aefdd",
  "accountId": "ACCOUNT_ID_FROM_LIST_ACCOUNTS",
  "caption": "Our latest update",
  "mediaIds": ["MEDIA_ID_FROM_LIST_MEDIA"],
  "settings": { "postType": "FEED" }
}
```

## Upload a file, then publish it

### Small files directly through MCP

Call `upload_media` with the following arguments (encode the actual file bytes
in the calling software, not a filename or a data URI):

```json
{
  "filename": "launch.png",
  "mimeType": "image/png",
  "contentBase64": "BASE64_ENCODED_FILE_BYTES",
  "tags": ["launch", "product"]
}
```

`folderId` is optional and must belong to the key's workspace. Tags are optional,
with up to 50 entries of 100 characters each; commas are not allowed inside a tag.
Filename extensions must match the MIME type. Supported files match the library's
image, MP4/MOV video, and audio formats; SVG/HTML/executables are not accepted.

Example successful result:

```json
{
  "status": 201,
  "id": "NEW_MEDIA_ID",
  "filename": "launch.png",
  "mimeType": "image/png",
  "transcodeStatus": null
}
```

Pass `"mediaIds": ["NEW_MEDIA_ID"]` into `publish_now`. The uploaded file also
appears in the normal workspace media library and can be reused for other posts.
Uploading alone never creates or publishes a post. Audio storage is supported,
but each social platform still decides which media types can be published.

### Large files via streaming multipart upload

Call `get_media_upload_config`, then have your software stream the file to the
returned **same-origin** path `/api/mcp/media`, not `/api/mcp`. This companion
endpoint is ordinary HTTP, not JSON-RPC. It avoids base64 expansion and keeps
large videos off the MCP message/LLM context. Limits are **1 GiB for videos** and
**100 MiB for other media**, subject to reverse-proxy upload/time limits.

```bash
curl --fail-with-body 'https://YOUR_HOST/api/mcp/media' \
  -H "Authorization: Bearer $OVERSEEK_MCP_KEY" \
  -F 'file=@./launch.mp4;type=video/mp4' \
  -F 'tags=launch,product'
```

Send one `file` part, with optional `folderId` and comma-separated `tags` fields.
Let your HTTP client generate the multipart Content-Type and boundary. The
server authenticates before consuming the file and streams it to disk with
backpressure, removing interrupted/rejected partial transfers. It does not
accept browser session cookies in place of the key. Both upload paths use the
same image optimization, thumbnails, hashing, tagging, and video transcode queue
as browser uploads. The response includes `id`, usable in `publish_now.mediaIds`.

Videos may return `transcodeStatus: "pending"` or `"processing"`. Use
`get_media_status` to wait for processing to finish; failed processing needs
attention in the app. Completion does not override platform-specific limits.

Uploads are **not idempotent**: repeating a completed upload creates another
library item. If a response is lost or fails after storage, check `list_media`
or the app before resending. Save the returned media ID and reuse it instead of
uploading again for every publishing retry. Publishing retains its separate,
durable operation-UUID duplicate protection described below.

## Read workspace analytics

The four analytics tools reuse the dashboard's own aggregation code, so their
numbers match what the app shows, including the previous-period comparison and
the platform caveats below. All accept the same arguments:

```json
{ "range": "30d", "platform": "instagram" }
```

`range` is `7d`, `30d` (default), `90d`, or `year`; unknown values are rejected
rather than silently treated as one week. `platform` is optional
(`instagram`, `facebook`, `meta`, `tiktok`, `youtube`, `pinterest`,
`google_business`, `linkedin`, `threads`, `bluesky`). Results are always scoped to
the key's workspace; there is no way to ask for another workspace's data.

- `get_analytics_summary`: likes, comments, shares, saves, clicks, video views,
  reach, impressions, average engagement rate, post counts, and the percentage
  change against the equally long window before it.
- `get_account_growth`: per-account follower totals (up to 50 accounts, largest
  first) plus period profile views and website clicks. Daily follower series are
  omitted as they are large and rarely useful to a text client.
- `get_top_posts`: the five best published posts by engagement rate, with post
  IDs usable in `get_post_analytics`.
- `get_post_analytics`: one post's stored metrics plus its publishing status, so
  an empty metric row can be recognised as "not published yet / not yet synced"
  rather than poor performance.

Analytics is **read-only over already-stored data**. MCP never triggers a
platform analytics sync, so it cannot consume provider API quota or refresh
numbers on demand; `syncedAt` and the per-post `syncedAt` tell you how old the
figures are. Trigger a sync in the app if the data must be current. A post with
no metrics row is absent from top-post rankings rather than reported as zero.

Reads are heavier than other tools (they aggregate the whole period) and count
against the same 60 requests/minute per key quota.

What is **not** returned: competitor/other-account benchmarks and the raw
platform-specific JSON blobs (same as the app's own aggregations, minus the data
only its charts use). Activity totals
carry the app's own caveat — daily API metrics only, with legacy Pinterest
30-day and Google Business rolling snapshots excluded, because summing them would
double-count.

## Confirmation and safe retries

Publishing uses the existing validation, post creation, and worker queue. The
initial response means **publishing was requested**, not that the post is live.
Poll `get_publishing_status` with the returned post ID. `scheduled` with no future
timestamp is the existing internal immediate-queue state, not a future schedule.
`publishing` and platform-processing states are not publication confirmation.
The shared publisher may leave a recovery draft after a queue failure; MCP
reports that as an error, not a successful publish or a deliberate draft action.

Generate **one UUID per intended account/post operation**, and save it alongside
the input. Retrying with the same UUID and input replays the original result,
including errors. The reservation is persisted in PostgreSQL, workspace-scoped,
survives restarts and credential rotation, and does not expire automatically.
The same UUID with different input is rejected. Retried completed responses are
snapshots; use the status tool for current state.

If a process crashes or a request fails after reservation but before its result
is saved, the outcome is deliberately reported as uncertain; it is **not rerun**.
Check the app's posts/activity and the actual social account before taking any
further action. Do not generate a new UUID just because of a timeout: publication
may already have happened. This protects against duplicate client submissions;
it cannot guarantee exactly-once delivery by third-party platforms. Validation
errors are also saved; after correcting a known pre-publication error, use a new
operation UUID. There is no automatic MCP retry of failed/uncertain posts.

Authenticated requests are limited to 60/minute per key via Redis (fail-closed
on limiter errors), in addition to existing proxy limits. Retry 429 responses
after 60 seconds, preserving the publishing operation UUID. JSON bodies are limited
to 128 KiB without upload access; upload-enabled keys allow an 8 MiB file's base64
representation plus 64 KiB of JSON overhead. Both upload paths share an additional
**20 uploads/minute per key** Redis quota, which also fails closed. The multipart
endpoint uses this upload quota instead of the small-body proxy limiter, so it
can stream large files without proxy buffering.
It also applies a fail-closed **60 requests/minute per IP** quota before looking
up API keys, including rejected authentication attempts. Configure your trusted
reverse proxy to supply the real client IP and strip spoofed forwarding headers.
Key creation/revocation, uploads, and publish requests are recorded in workspace activity.
Keep database reservations while their associated publishing outcomes could
still be retried; deleting them removes duplicate-submission protection.

## Key management API

For automation of setup, the same settings UI uses these **session-authenticated**
routes (Bearer publishing keys do not grant key-management access):

- `GET /api/settings/publishing-keys`: list metadata, never secret digests. Returns
  up to 100 keys (including expired/revoked keys) and `nextCursor`. Pass a non-null
  cursor as `?cursor=...` for the next page; the settings UI supports paging so
  older active keys remain available for revocation.
- `POST /api/settings/publishing-keys`: JSON `{ "name": "Integration", "scopes":
  ["read", "publish", "upload"], "expiresInDays": 90 }`; returns `id`, plaintext `key` once,
  and `expiresAt`. Expiry range is 1–365 days. Omitted scopes still default to
  `["read", "publish"]`, with **no upload permission**.
- `DELETE /api/settings/publishing-keys`: JSON `{ "id": "KEY_ID" }` revokes an
  active key owned by the current workspace.

All responses are private/no-store. API keys do not grant access to ordinary
browser/session API routes.
