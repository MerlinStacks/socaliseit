-- Preserve the real YouTube counter before removing synthetic impressions/reach.
UPDATE "PlatformAnalytics" a
SET "platformMetrics" = COALESCE(NULLIF(a."platformMetrics", 'null'::jsonb), '{}'::jsonb)
        || jsonb_build_object('lifetime_views', COALESCE(a."platformMetrics"->'lifetime_views', to_jsonb(a."impressions"))),
    "impressions" = 0, "reach" = 0, "profileViews" = 0
FROM "SocialAccount" s
WHERE a."socialAccountId" = s.id AND s.platform = 'YOUTUBE';

UPDATE "PostAnalytics" a SET "impressions" = 0, "reach" = 0
FROM "Post" p WHERE a."postId" = p.id AND p.platform = 'YOUTUBE';

-- Profile visits remain in profileViews; they are not content impressions.
UPDATE "PlatformAnalytics" a SET "impressions" = 0
FROM "SocialAccount" s
WHERE a."socialAccountId" = s.id AND s.platform = 'FACEBOOK';
