# AI media auto-tagging

New image and video uploads are queued for background analysis when the workspace's **Auto-tag uploads** setting is on and OpenRouter is configured. The setting defaults to on; workspace owners and admins can change it in the Media Library on desktop or mobile.

The worker uses the configured Seb model, which must support image input. It sends resized image previews or four sampled video frames through the shared OpenRouter transport. Video analysis falls back to the saved thumbnail if frame extraction fails. Audio-only files are excluded.

The prompt aims for 5–10 useful tags, reusing the workspace's vocabulary and creating new tags when needed. Only suggestions with confidence of at least 0.8 are applied, capped at 10 per analysis. Fewer tags can be returned when visual evidence is limited. Existing tags are retained, and all tags remain editable.

## Existing media

Use **Analyze existing media** to queue unanalyzed or failed images/videos in the current library view. Select items to analyze specific media, including previously analyzed items. Running jobs are deduplicated. The library refreshes while jobs are pending and shows failures that can be retried. Refreshing pauses while the edit dialog is open to protect unsaved edits.

## Deployment

1. Apply the checked-in migration using `npm run db:migrate` from `app/` (with the deployment's database configuration).
2. Rebuild/redeploy both the app and the worker so they use the regenerated Prisma client.
3. Ensure the worker has access to Redis and the shared `public/uploads` volume, plus FFmpeg/FFprobe for videos.
4. Configure OpenRouter and an image-capable Seb model in AI settings.

The new `media-tag` queue runs at concurrency 2. Failed AI calls are not automatically retried because requests may be billed; the library provides manual retry. Queue or provider failures do not invalidate successfully uploaded files. Analysis state and a safe failure message are stored on each media record; `aiTags` records the latest generated suggestions.
