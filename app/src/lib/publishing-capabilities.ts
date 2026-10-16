/** Capability notices are not instructions to change privacy, disclosures, or audience. */
export function publishingCapabilityWarnings(platform: string, settings: {
    postType?: string;
    userTags?: unknown[];
    productTags?: unknown[];
    subtitleTracks?: unknown[];
    youtubeCommentsEnabled?: boolean;
}): string[] {
    const warnings: string[] = [];
    const key = platform.toLowerCase();
    const story = settings.postType?.toLowerCase() === 'story';
    if (settings.userTags?.length && (key !== 'instagram' || story)) {
        warnings.push('Selected people tags cannot be applied to this platform/post type. Add them in the native app.');
    }
    if (settings.productTags?.length && (key !== 'instagram' || story)) {
        warnings.push('Selected product tags cannot be applied by this publisher. Add shopping tags in the native app; no product links are inserted automatically.');
    }
    if (settings.subtitleTracks?.length && key !== 'youtube') {
        warnings.push('Separate subtitle tracks are only uploaded to YouTube. For this platform, use a captioned video or add subtitles in the native app.');
    }
    if (key === 'youtube' && settings.youtubeCommentsEnabled === false) {
        warnings.push('YouTube cannot disable comments through its publishing API. Your channel defaults apply; change comment availability in YouTube Studio.');
    }
    return warnings;
}
