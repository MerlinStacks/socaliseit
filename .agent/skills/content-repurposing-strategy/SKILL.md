---
name: content-repurposing-strategy
description: Master cross-platform content adaptation, format conversion, and A/B variant generation. Use when optimizing content for multiple platforms or creating content variations.
---

# Content Repurposing Strategy

Expert guide for adapting content across platforms and creating variations.

## When to Use This Skill

- Adapting content for different platforms
- Converting video to image/carousel
- Creating A/B test variants
- Optimizing captions per platform
- Building content templates

## Platform Content Specs

```typescript
// lib/repurposing/specs.ts
interface PlatformSpec {
  name: Platform;
  maxTextLength: number;
  hashtagLimit: number;
  aspectRatios: { feed: string; story: string; reel?: string };
  videoMaxDuration: number; // seconds
  linkSupport: 'inline' | 'bio' | 'sticker' | 'none';
}

const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  instagram: {
    name: 'instagram',
    maxTextLength: 2200,
    hashtagLimit: 30,
    aspectRatios: { feed: '1:1', story: '9:16', reel: '9:16' },
    videoMaxDuration: 90,
    linkSupport: 'bio',
  },
  twitter: {
    name: 'twitter',
    maxTextLength: 280,
    hashtagLimit: 3,
    aspectRatios: { feed: '16:9', story: '16:9' },
    videoMaxDuration: 140,
    linkSupport: 'inline',
  },
  tiktok: {
    name: 'tiktok',
    maxTextLength: 2200,
    hashtagLimit: 5,
    aspectRatios: { feed: '9:16', story: '9:16' },
    videoMaxDuration: 600,
    linkSupport: 'bio',
  },
  linkedin: {
    name: 'linkedin',
    maxTextLength: 3000,
    hashtagLimit: 5,
    aspectRatios: { feed: '1.91:1', story: '9:16' },
    videoMaxDuration: 600,
    linkSupport: 'inline',
  },
};
```

## Content Adapter

```typescript
// lib/repurposing/adapter.ts
interface SourceContent {
  text: string;
  media: MediaItem[];
  hashtags: string[];
  link?: string;
}

interface AdaptedContent {
  platform: Platform;
  text: string;
  media: MediaItem[];
  hashtags: string[];
  warnings: string[];
}

export function adaptContent(
  source: SourceContent,
  targetPlatform: Platform
): AdaptedContent {
  const spec = PLATFORM_SPECS[targetPlatform];
  const warnings: string[] = [];

  // Adapt text
  let text = source.text;
  if (text.length > spec.maxTextLength) {
    text = text.slice(0, spec.maxTextLength - 3) + '...';
    warnings.push(`Text truncated to ${spec.maxTextLength} characters`);
  }

  // Adapt link
  if (source.link) {
    if (spec.linkSupport === 'inline') {
      text = `${text}\n\n${source.link}`;
    } else if (spec.linkSupport === 'bio') {
      text = `${text}\n\nLink in bio!`;
      warnings.push('Link moved to bio reference');
    }
  }

  // Adapt hashtags
  let hashtags = source.hashtags;
  if (hashtags.length > spec.hashtagLimit) {
    hashtags = hashtags.slice(0, spec.hashtagLimit);
    warnings.push(`Hashtags limited to ${spec.hashtagLimit}`);
  }

  // Platform-specific hashtag placement
  if (targetPlatform === 'instagram') {
    // Instagram: hashtags in first comment or end of caption
  } else if (targetPlatform === 'twitter') {
    // Twitter: hashtags inline
    text = `${text} ${hashtags.map((h) => `#${h}`).join(' ')}`;
    hashtags = [];
  }

  // Adapt media aspect ratio (flag for processing)
  const media = source.media.map((m) => ({
    ...m,
    targetAspectRatio: spec.aspectRatios.feed,
  }));

  return { platform: targetPlatform, text, media, hashtags, warnings };
}
```

## A/B Variant Generation

```typescript
// lib/repurposing/variants.ts
interface Variant {
  id: string;
  name: string;
  content: SourceContent;
  type: 'caption' | 'cta' | 'hook' | 'hashtag';
}

export async function generateVariants(
  source: SourceContent,
  count: number = 3
): Promise<Variant[]> {
  const variants: Variant[] = [
    { id: 'original', name: 'Original', content: source, type: 'caption' },
  ];

  // Generate caption variations using AI
  const captionVariants = await generateCaptionVariants(source.text, count - 1);
  
  captionVariants.forEach((caption, i) => {
    variants.push({
      id: `variant-${i + 1}`,
      name: `Variant ${i + 1}`,
      content: { ...source, text: caption },
      type: 'caption',
    });
  });

  return variants;
}

async function generateCaptionVariants(
  original: string,
  count: number
): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [{
      role: 'system',
      content: `Generate ${count} variations of this social media caption. 
                Keep the same meaning but vary the hook, tone, or CTA.
                Return as JSON array of strings.`,
    }, {
      role: 'user',
      content: original,
    }],
    response_format: { type: 'json_object' },
  });

  const result = JSON.parse(response.choices[0].message.content);
  return result.variants;
}
```

## Video to Carousel Conversion

```typescript
// lib/repurposing/video-to-carousel.ts
interface CarouselSlide {
  imageUrl: string;
  caption?: string;
  timestamp: number;
}

export async function extractKeyFrames(
  videoUrl: string,
  frameCount: number = 5
): Promise<CarouselSlide[]> {
  const duration = await getVideoDuration(videoUrl);
  const interval = duration / (frameCount + 1);
  
  const frames: CarouselSlide[] = [];
  
  for (let i = 1; i <= frameCount; i++) {
    const timestamp = interval * i;
    const imageUrl = await extractFrame(videoUrl, timestamp);
    
    frames.push({
      imageUrl,
      timestamp,
    });
  }
  
  return frames;
}

// Add text overlays to frames
export async function addCaptionsToSlides(
  slides: CarouselSlide[],
  captions: string[]
): Promise<CarouselSlide[]> {
  return slides.map((slide, i) => ({
    ...slide,
    caption: captions[i] || undefined,
  }));
}
```

## Hashtag Optimization

```typescript
// lib/repurposing/hashtags.ts
interface HashtagAnalysis {
  tag: string;
  popularity: 'high' | 'medium' | 'low';
  relevance: number;
  recommended: boolean;
}

export async function optimizeHashtags(
  content: string,
  platform: Platform,
  count: number = 10
): Promise<HashtagAnalysis[]> {
  // Get relevant hashtags
  const suggested = await suggestHashtags(content);
  
  // Analyze each hashtag
  const analyzed = await Promise.all(
    suggested.map(async (tag) => ({
      tag,
      popularity: await getHashtagPopularity(tag, platform),
      relevance: calculateRelevance(tag, content),
      recommended: false,
    }))
  );

  // Mix of popularity levels for best reach
  const optimized = balanceHashtagMix(analyzed, count);
  optimized.forEach((h) => (h.recommended = true));

  return analyzed;
}

function balanceHashtagMix(
  hashtags: HashtagAnalysis[],
  count: number
): HashtagAnalysis[] {
  const high = hashtags.filter((h) => h.popularity === 'high').slice(0, Math.floor(count * 0.2));
  const medium = hashtags.filter((h) => h.popularity === 'medium').slice(0, Math.floor(count * 0.5));
  const low = hashtags.filter((h) => h.popularity === 'low').slice(0, Math.floor(count * 0.3));
  
  return [...high, ...medium, ...low].slice(0, count);
}
```

## Best Practices

1. **Know platform limits** - Character counts, aspect ratios
2. **Adapt, don't copy** - Native content performs better
3. **Test variations** - A/B test hooks and CTAs
4. **Balance hashtags** - Mix of popular and niche
5. **Track performance** - Learn what works per platform
6. **Automate where possible** - Templates save time
