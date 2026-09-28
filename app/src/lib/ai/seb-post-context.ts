interface SebPostIdentity {
    id: string;
    status: string;
    platform: string | null;
    socialAccountId: string | null;
    postType: string;
    platformPostId: string | null;
    externalId: string | null;
    isExternal: boolean;
}

/** Collapse confirmed copies of a platform publication, never similar captions or media. */
export function deduplicateSebPosts<T extends SebPostIdentity>(posts: T[]): T[] {
    const publications = new Map<string, T>();
    for (const post of posts) {
        const platformId = post.platformPostId || post.externalId;
        // Unknown identities and unpublished records must remain independently visible.
        const key = post.status === 'PUBLISHED' && post.platform && post.socialAccountId && platformId
            ? JSON.stringify([post.platform, post.socialAccountId, post.postType, platformId])
            : JSON.stringify(['record', post.id]);
        const existing = publications.get(key);
        // Native records retain attached media, hashtags, and app publishing history.
        if (!existing || (existing.isExternal && !post.isExternal)) publications.set(key, post);
    }
    return [...publications.values()];
}

export const SEB_POST_IDENTITY_GUIDANCE = 'posts is the publication inventory for this review. A local id identifies an app record, while platformPostId/externalId identify the platform publication; an imported record is not evidence of another publish. Do not infer double-publishing from matching captions, media, or timestamps alone. Cross-platform/cross-account posts and Story versus feed/Reel reuse are separate destinations or formats, not proof of accidental duplication. Facebook can expose feed and video/Reel representations of the same content; different API IDs alone do not prove separate audience-visible posts. Only describe confirmed double-publishing when evidence establishes distinct live publications on the same account and format; cite the records and platform URLs/IDs, otherwise state that duplication is unverified. Previous recommendations and chat history are prior advice, not independent proof of duplication; reassess against current post evidence.';
