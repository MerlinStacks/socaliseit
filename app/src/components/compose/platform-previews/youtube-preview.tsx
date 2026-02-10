/**
 * YouTube Preview Components (Video, Shorts)
 * Why: Mimics the real YouTube app UI with platform-authentic SVG icons.
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';
import {
    HomeIcon,
    SearchIcon,
    PlusIcon,
    BellIcon,
    CommentBubble,
    ShareArrow,
    MoreVertical,
    YtPlayIcon,
    YtCastIcon,
    YtShortsIcon,
    YtSubscriptionsIcon,
    YtLibraryIcon,
    YtThumbUp,
    YtThumbDown,
} from './platform-icons';

export function YouTubePreview({ caption, media, accountName = 'Your Channel', accountAvatar, videoTitle }: PreviewProps) {
    /** Why: videoTitle from settings takes precedence; fall back to caption for display */
    const displayTitle = videoTitle?.trim() || caption.slice(0, 60) || 'Video Title';

    return (
        <PhoneFrame>
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
                    <YtPlayIcon className="w-5 h-5" /> YouTube
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                    <YtCastIcon className="w-4 h-4" />
                    <BellIcon className="w-4 h-4" />
                    <SearchIcon className="w-4 h-4" />
                </div>
            </div>

            <div className="relative aspect-video bg-gray-900">
                <MediaPreview media={media[0]} dark />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1 text-[10px] text-white rounded">3:42</div>
            </div>

            <div className="flex gap-2 p-3">
                <ProfileAvatar
                    src={accountAvatar}
                    name={accountName}
                    size="lg"
                    className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium line-clamp-2">{displayTitle}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{accountName} • 12K views • 2 days ago</div>
                </div>
                <MoreVertical className="w-4 h-4 text-gray-400" />
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-[10px] text-gray-600">
                <div className="flex flex-col items-center gap-0.5"><HomeIcon className="w-5 h-5" />Home</div>
                <div className="flex flex-col items-center gap-0.5"><YtShortsIcon className="w-5 h-5" />Shorts</div>
                <div className="flex flex-col items-center gap-0.5"><PlusIcon className="w-5 h-5" /></div>
                <div className="flex flex-col items-center gap-0.5"><YtSubscriptionsIcon className="w-5 h-5" />Subs</div>
                <div className="flex flex-col items-center gap-0.5"><YtLibraryIcon className="w-5 h-5" />Library</div>
            </div>
        </PhoneFrame>
    );
}

export function YouTubeShortsPreview({ caption, media, accountName = 'Your Channel', accountAvatar, videoTitle }: PreviewProps) {
    /** Why: videoTitle from settings takes precedence; fall back to caption for Shorts overlay */
    const displayCaption = videoTitle?.trim() || caption.slice(0, 60);

    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gray-900">
                <MediaPreview media={media[0]} dark />

                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
                    <div className="flex flex-col items-center"><YtThumbUp className="w-7 h-7" /><span className="text-[10px]">5.2K</span></div>
                    <div className="flex flex-col items-center"><YtThumbDown className="w-7 h-7" /><span className="text-[10px]">Dislike</span></div>
                    <div className="flex flex-col items-center"><CommentBubble className="w-7 h-7" /><span className="text-[10px]">89</span></div>
                    <div className="flex flex-col items-center"><ShareArrow className="w-7 h-7" /><span className="text-[10px]">Share</span></div>
                </div>

                <div className="absolute bottom-3 left-3 right-14">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{accountName}</span>
                        <button className="rounded bg-white text-black px-2 py-0.5 text-[10px] font-medium">Subscribe</button>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{displayCaption}...</div>
                </div>
            </div>
        </PhoneFrame>
    );
}
