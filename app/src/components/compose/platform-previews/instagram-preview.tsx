/**
 * Instagram Preview Components (Feed, Reel, Story)
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';

export function InstagramFeedPreview({ caption, media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    const likeCount = Math.floor(Math.random() * 2000) + 500;

    return (
        <PhoneFrame>
            {/* Instagram Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-lg font-semibold">Instagram</span>
                <div className="flex items-center gap-4 text-gray-900">
                    <span className="text-lg">♡</span>
                    <span className="text-lg">✈</span>
                </div>
            </div>

            {/* Post Header */}
            <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                    <div className="h-full w-full rounded-full bg-white p-0.5">
                        <ProfileAvatar
                            src={accountAvatar}
                            name={accountName}
                            size="md"
                            className="h-full w-full"
                        />
                    </div>
                </div>
                <div className="flex-1">
                    <div className="text-xs font-semibold">{accountName}</div>
                    <div className="text-[10px] text-gray-500">London, United Kingdom</div>
                </div>
                <span className="text-gray-400">•••</span>
            </div>

            {/* Media */}
            <div className="aspect-square bg-gradient-to-br from-amber-200 to-orange-300">
                <MediaPreview media={media[0]} />
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-4 text-xl">
                    <span>♡</span><span>💬</span><span>↗</span>
                </div>
                <span className="text-xl">🔖</span>
            </div>

            {/* Likes */}
            <div className="px-3 text-xs font-semibold">{likeCount.toLocaleString()} likes</div>

            {/* Caption */}
            <div className="px-3 py-1 text-xs">
                <span className="font-semibold">{accountName}</span>{' '}
                {caption.slice(0, 80)}{caption.length > 80 && <span className="text-gray-400"> ...more</span>}
            </div>

            <div className="px-3 pb-2 text-[10px] text-gray-400">View all 12 comments</div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-lg">
                <span>🏠</span><span>🔍</span><span>➕</span><span>🎬</span>
                <ProfileAvatar src={accountAvatar} name={accountName} size="sm" />
            </div>
        </PhoneFrame>
    );
}

export function InstagramReelPreview({ caption, media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-600 to-pink-500">
                <MediaPreview media={media[0]} dark />

                {/* Right Actions */}
                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
                    <div className="flex flex-col items-center"><span className="text-2xl">♡</span><span className="text-[10px]">1.2K</span></div>
                    <div className="flex flex-col items-center"><span className="text-2xl">💬</span><span className="text-[10px]">48</span></div>
                    <div className="flex flex-col items-center"><span className="text-2xl">↗</span></div>
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="sm"
                        dark
                        className="rounded border border-white/50"
                    />
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-3 left-3 right-12">
                    <div className="flex items-center gap-2 mb-2">
                        <ProfileAvatar
                            src={accountAvatar}
                            name={accountName}
                            size="sm"
                        />
                        <span className="text-xs font-semibold text-white">{accountName}</span>
                        <button className="rounded border border-white px-2 py-0.5 text-[10px] text-white">Follow</button>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{caption.slice(0, 60)}...</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/80">
                        <span>🎵</span><span className="truncate">Original audio • {accountName}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around bg-black py-2 text-white text-lg">
                <span>🏠</span><span>🔍</span><span>➕</span><span className="font-bold">🎬</span>
                <ProfileAvatar src={accountAvatar} name={accountName} size="sm" dark />
            </div>
        </PhoneFrame>
    );
}

export function InstagramStoryPreview({ media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-600 to-pink-500">
                <MediaPreview media={media[0]} dark />

                {/* Progress bars */}
                <div className="absolute top-2 left-2 right-2 flex gap-1">
                    <div className="h-0.5 flex-1 rounded-full bg-white" />
                </div>

                {/* Profile header */}
                <div className="absolute top-4 left-3 flex items-center gap-2">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="md"
                        ring
                    />
                    <span className="text-xs font-semibold text-white">{accountName}</span>
                    <span className="text-[10px] text-white/60">2h</span>
                </div>

                <div className="absolute top-4 right-3 text-white text-lg">✕</div>
            </div>
        </PhoneFrame>
    );
}

