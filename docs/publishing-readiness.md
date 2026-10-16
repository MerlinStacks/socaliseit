# Publishing metadata and reach checks

## Supported publishing paths

- Instagram people tags are entered explicitly with a media index and image coordinates. Tags are sent only to the selected carousel child; video tags omit coordinates.
- Instagram product tags require an eligible Business Shop and shopping permissions. Eligibility is checked before dispatch. Product approval still determines whether Instagram displays a tag.
- Reviewed SRT/WebVTT subtitle tracks can be pasted in YouTube settings. Each track needs a language code and unique track name. These are closed captions, not the written post description. Subtitle generation/transcription is not automatic.
- YouTube playlist and first-like selections are applied after a confirmed upload. Titles are preserved without automatically adding `#Shorts`.
- Selected video-cover frames are converted to durable JPEG files and saved with post attachments. Instagram receives public cover URLs; YouTube reads local covers for binary upload.

## Platform limits and warnings

YouTube's publishing API cannot enable or disable comments. Channel defaults apply; change comment availability in YouTube Studio. The composer explains this instead of offering a misleading toggle. Saved requests to disable comments produce a follow-up warning.

Separate subtitle-track uploading is currently implemented for YouTube only. Other publishers need a captioned video or a native-platform follow-up. Native shopping-tag publishing is currently implemented for Instagram only. Saved unsupported people/product tags are flagged, not silently converted into mentions or product links.

Readiness checks are account-specific and advisory, except malformed metadata or tags referring to missing attachments. They cover audience restrictions, disabled interactions, video accessibility, cover review, vertical-media fit, Pinterest metadata, Threads topics, and Instagram feed-sharing choices. Existing caption/media validation and audience-informed scheduling suggestions remain in place. These checks do not guarantee reach, invent tags, change privacy/disclosures, or claim to detect existing burned-in captions.

If an optional post-upload enhancement fails, the post remains published. Its calendar preview shows **Published with follow-up needed**. Complete that enhancement on the platform; do not republish the video.

## Deployment

1. From `app/`, apply migrations with `npx prisma migrate deploy` and generate the Prisma client as part of the normal build.
2. Deploy/restart both the web application and publishing worker. The migration adds `Post.userTags` and `Post.subtitleTracks` with empty-array defaults.
3. Reconnect YouTube accounts before using subtitle uploads: new authorizations request `youtube.force-ssl`, which existing tokens may not have. Caption uploads also consume YouTube API quota.
4. Keep `APP_URL` (or `NEXTAUTH_URL`) configured to the public application origin and share the uploads volume between web and worker processes.
