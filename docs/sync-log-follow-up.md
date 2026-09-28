# September sync log fixes: deployment verification

Deploy the updated web app and worker together. These fixes do not require a database migration.

## Verify the next worker cycles

- Google reviews: a count discrepancy now logs `Google review count mismatch; syncing returned reviews without pruning`. Returned reviews must update, and absent reviews must remain intact until a complete result is available.
- Facebook Stories: verify `story_total_media_view_unique` returns metrics for the affected Story IDs on the live Graph API. Unsupported insights nodes are skipped without overwriting their saved analytics.
- Post imports: existing imports update directly. A unique conflict remains possible if two processes insert the same newly discovered post concurrently; the fallback handles it.
- Stale cleanup: use the new post ID and `outcome` fields to identify recurring TikTok records. `completed` means TikTok completed publication without providing a public ID; it must not be republished automatically. `unknown` means confirmation could not be established.
- Mention failures now reach engagement-sync error summaries. Meta reads and Google review/token requests retry transient failures up to three attempts.

## Meta webhook signature failures

1. Check every Meta app configured with this deployment's callback URL. The app delivering the webhook must match the META credentials stored through Setup Wizard.
2. Compare the app ID and App Secret in Meta Developer Console with that configuration. The webhook verification token is not the App Secret.
3. Remove obsolete callback subscriptions or route separate Meta apps to deployments configured with their respective credentials.
4. Send a test delivery from the expected app and inspect its delivery status and the web logs. Keep signature verification enabled. Logs now identify secret versions using a hash fingerprint instead of exposing secret characters.

The supplied excerpt contains both valid and rejected signatures, so it does not establish which app or configuration generated the rejected deliveries.

## Next.js request errors

The media response bridge now handles cancellation while a read is pending. Recheck video preview seeking and navigation away from previews after deploying.

`onRequestError` now records the underlying error stack, request path, method, and route context. If closed-controller exceptions recur, capture that stack to establish whether they originate in the media route or another Next.js response path.

For missing Server Actions, correlate the new route context with reverse-proxy access logs:

- For real browser sessions around deployments, reload the page and verify all web replicas use the same build artifact; do not independently build each replica.
- For malformed external requests such as the short `x`/`y` action IDs in this excerpt, use access-log evidence and the edge rate-limiter/WAF to address repeated sources.

Missing-action messages alone do not establish deployment skew or an application defect. Do not suppress all Server Action errors or bypass authentication to silence them.
