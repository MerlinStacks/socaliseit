/**
 * TikTok Preview Component
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';

export function TikTokPreview({ caption, media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-black">
                <MediaPreview media={media[0]} dark />

                {/* Top bar */}
                <div className="absolute top-2 left-0 right-0 flex items-center justify-center gap-4 text-white">
                    <span className="text-sm text-white/60">Following</span>
                    <span className="text-sm font-semibold border-b-2 border-white pb-0.5">For You</span>
                </div>

                {/* Right Actions */}
                <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="lg"
                        dark
                        ring
                    />
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">♡</span><span className="text-[10px]">24.5K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">💬</span><span className="text-[10px]">482</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">🔖</span><span className="text-[10px]">1.2K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">↗</span><span className="text-[10px]">Share</span>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-3 left-3 right-16">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{accountName}</span>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{caption.slice(0, 80)}...</div>
                    <div className="mt-2 flex items-center gap-1 text-xs text-white">
                        <span>🎵</span><span className="truncate">Original sound - {accountName}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around bg-black py-2 text-white">
                <span className="text-xs">Home</span>
                <span className="text-xs text-white/60">Friends</span>
                <div className="flex items-center">
                    <div className="h-7 w-5 rounded-l-md bg-cyan-400" />
                    <div className="h-7 w-5 -ml-2 rounded-r-md bg-pink-500" />
                    <span className="absolute text-white text-lg font-bold">+</span>
                </div>
                <span className="text-xs text-white/60">Inbox</span>
                <span className="text-xs text-white/60">Profile</span>
            </div>
        </PhoneFrame>
    );
}

