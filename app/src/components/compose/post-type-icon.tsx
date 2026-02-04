/**
 * Post Type Icons
 * Renders Lucide icons for post types (FEED, REEL, STORY, etc.)
 * Why: Consistent SVG icons across the app without emojis
 */

import {
    Image,
    Film,
    Clock,
    Images,
    Pin,
    Video,
    FileText,
    MessageSquare,
    type LucideIcon,
} from 'lucide-react';
import { type PostType } from '@/lib/platform-config';

interface PostTypeIconProps {
    postType: PostType;
    size?: number;
    className?: string;
}

/**
 * Mapping of post types to Lucide icon components
 */
const POST_TYPE_ICONS: Record<PostType, LucideIcon> = {
    feed: Image,
    reel: Film,
    story: Clock,
    carousel: Images,
    pin: Pin,
    video: Video,
    article: FileText,
    thread: MessageSquare,
};

/**
 * Renders the appropriate icon for a post type
 */
export function PostTypeIcon({ postType, size = 16, className }: PostTypeIconProps) {
    const IconComponent = POST_TYPE_ICONS[postType];

    if (!IconComponent) {
        return <Image size={size} className={className} />;
    }

    return <IconComponent size={size} className={className} />;
}
