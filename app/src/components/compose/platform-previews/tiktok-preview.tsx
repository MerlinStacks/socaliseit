/**
 * TikTok Preview Component
 * Why: Mimics the real TikTok feed UI with platform-authentic SVG icons.
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';
import {
    HeartOutline,
    CommentBubble,
    BookmarkOutline,
    ShareArrow,
    MusicNote,
} from './platform-icons';

export function TikTokPreview({ caption, media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative flex-1 bg-black">
                <MediaPreview media={media[0]} dark />

                {/* Top bar */}
                <div className="absolute left-0 right-0 top-3 flex items-center justify-center gap-4 text-white drop-shadow">
                    <span className="text-sm text-white/60">Following</span>
                    <span className="text-sm font-semibold border-b-2 border-white pb-0.5">For You</span>
                </div>

                {/* Right Actions */}
                <div className="absolute bottom-5 right-3 flex flex-col items-center gap-4 drop-shadow">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="lg"
                        dark
                        ring
                    />
                    <div className="flex flex-col items-center text-white">
                        <HeartOutline className="w-7 h-7" /><span className="text-[10px]">24.5K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <CommentBubble className="w-7 h-7" /><span className="text-[10px]">482</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <BookmarkOutline className="w-7 h-7" /><span className="text-[10px]">1.2K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <ShareArrow className="w-7 h-7" /><span className="text-[10px]">Share</span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-5 left-3 right-16 drop-shadow">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{accountName}</span>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{caption.slice(0, 80)}{caption.length > 80 && '...'}</div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-white">
                        <MusicNote className="w-3 h-3" /><span className="truncate">Original sound - {accountName}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-white/10 bg-black py-2 text-white">
                <span className="text-xs">Home</span>
                <span className="text-xs text-white/60">Friends</span>
                <div className="relative flex h-7 w-10 items-center justify-center">
                    <div className="absolute left-0 h-7 w-7 rounded-md bg-cyan-400" />
                    <div className="absolute right-0 h-7 w-7 rounded-md bg-pink-500" />
                    <div className="absolute inset-x-1 h-7 rounded-md bg-white" />
                    <span className="relative text-lg font-bold leading-none text-black">+</span>
                </div>
                <span className="text-xs text-white/60">Inbox</span>
                <span className="text-xs text-white/60">Profile</span>
            </div>
        </PhoneFrame>
    );
}
