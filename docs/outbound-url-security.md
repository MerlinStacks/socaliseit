# Outbound URL security

## Public URL reader

`app/src/lib/fetch-external-url.ts` provides `fetchExternalUrl(url, options)` for
server-side, untrusted public HTTP(S) downloads. It is an isolated Node transport,
not a global fetch replacement or a full Fetch API implementation.

- Parses URLs using WHATWG URL normalization (including encoded IPv4 forms),
  rejects credentials, non-HTTP(S), local names and nonpublic literal IPs.
- Resolves through the OS resolver, fails closed on errors/empty answers, and
  rejects the entire answer set if any address is nonpublic. The connection's
  lookup returns only a vetted address, with fresh sockets and no pooled reuse.
  Host, HTTPS SNI and normal certificate verification retain the original hostname.
  IP literals are vetted directly. No second DNS resolution occurs at connect time.
- Manually follows up to five redirects by default, resolving and validating every
  hop, including same-host redirects. Redirect bodies are destroyed immediately.
- Counts incoming body bytes while streaming, rejects oversized declared lengths,
  and destroys oversized streams even with missing or misleading length headers.
  Accepted bodies are buffered (default maximum 10 MiB), so this is not a disk
  streaming API. Consumers can use `body`, `text()` or `arrayBuffer()`.
- A total deadline (default 15 seconds) covers DNS, connection, TLS, redirects and
  reading the body. Late DNS completion cannot open a socket after timeout.
- Requests identity encoding and rejects compressed responses rather than exposing
  decompression bombs. Supports GET/HEAD and only Accept, Accept-Language and
  User-Agent request headers. No cookies, authorization or caller-controlled Host.

The address policy is deliberately conservative: IPv4 private, loopback, link-local,
CGNAT, documentation, benchmark, multicast and reserved ranges are excluded. IPv6
must be global unicast in `2000::/3`, excluding special protocol assignments,
documentation and 6to4. Mapped/compatible IPv4, NAT64, unique-local, link/site-local,
multicast, discard and scoped addresses are excluded. Some globally reachable
special-use addresses are intentionally unavailable. Review registry changes over time.

`validateExternalUrl` remains a bounded compatibility/preflight API. **Calling it
and then ordinary fetch or a subprocess is not SSRF protection.** Use the pinned
reader for the request itself.

## Migrated consumers

- Social listening crawler: all initial, sitemap and discovered-page requests use
  the pinned reader, with a 1,500,000-byte body cap and 12-second total deadline per
  document. Relative links use the final validated redirected page URL.
- Seb brand website crawler (`lib/ai/seb-advisor.ts`): homepage and discovered-page
  requests use the pinned reader with a 500,000-byte cap and 8-second total deadline
  per page. Retains HTML/plain-text checks, final-URL relative link resolution and
  best-effort handling of failed linked pages. Oversized pages are now rejected
  during reading rather than buffered without a bound and truncated afterwards.

## Media import compatibility and unresolved subprocess SSRF

`/api/media/import` retains the existing yt-dlp behavior: automatic binary installation,
webpage/video metadata extraction, original title, audio extraction and MP3 transcoding
with `--no-playlist`. There is no direct-MP3-only restriction. Authentication and rate
limiting remain, destination folders are ownership-checked, and the expected MP3 output
is removed on extraction/database failure (other subprocess temporary files may remain).

The improved `validateExternalUrl` performs initial URL/DNS prevalidation only. **Media
import is not fully SSRF-protected:** yt-dlp, ffmpeg and other child downloaders can
independently resolve DNS, follow redirects and fetch extractor/manifest URLs. The
pinned reader's body limits, timeouts and redirect policy do not apply to subprocess
downloads or automatic binary installation. DNS rebinding and downstream private
destinations remain a residual risk.

Closing this requires enforced egress isolation (for example, a network namespace
where only an authenticated validating proxy is reachable, including for every child
process). Neither prevalidation nor `--proxy` alone is sufficient. That infrastructure
is not implemented by this change; extraction compatibility is deliberately preserved.

## Trust boundary and remaining scope

Configured internal storage and owned upload paths are a separate trust boundary.
Existing `/api/uploads/…` filesystem reads, configured storage clients and the
configured S3 health check remain separate; there is no `allowPrivate` escape hatch
in the public reader. Never fall back from public validation failure to an internal
storage fetch. Storage access must derive its endpoint/path from trusted configuration
and an ownership-checked storage key, not an arbitrary supplied absolute URL.

This change does **not** secure all outbound networking in the application. Inspection
also found credentialed e-commerce API plumbing in `lib/ecommerce.ts`, and
publishing/media upload paths under `lib/platform-api/` and `lib/platforms/publishing/`.
They need separate caller-specific review/migration; publishing is owned by another
agent. Browser downloads (`lib/download-media.ts`, Web Audio analysis) are not
server-side fetches and should not import this Node utility.

Public IP pinning cannot block an intentionally public service that proxies private
resources, or deployment-specific routing of public IPs into sensitive networks.
Network-level egress controls remain useful for those boundaries. DNS operations may
finish in the background after timeout, but cannot subsequently initiate a request.
Per-response memory is bounded; aggregate concurrent memory needs deployment-level
capacity controls. No real external-network/TLS integration test is claimed by the
mocked transport tests.

## Focused verification

From `app/`:

```sh
bun run test --run src/lib/__tests__/validate-url.test.ts src/lib/__tests__/fetch-external-url.test.ts src/lib/__tests__/media-import-route.test.ts src/lib/__tests__/social-listening-crawler.test.ts src/lib/__tests__/seb-website-fetch.test.ts src/lib/__tests__/seb-timezone.test.ts src/workers/__tests__/social-listening-crawler-worker.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Tests cover encoded and nonpublic address families, mixed DNS answers, rebinding at
socket lookup and redirects, hostile redirect targets, redirect limits, actual byte
limits without trustworthy headers, compression rejection, stalled bodies and DNS,
late-resolution cancellation, both crawlers' discovered URLs, and compatible yt-dlp
invocation, initial preflight rejection, folder ownership and output cleanup. Mocked
subprocess tests verify compatibility, not enforced subprocess egress protection.
