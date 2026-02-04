/**
 * Other Platform Preview Components (Facebook, Pinterest, LinkedIn, Bluesky, Google Business)
 * Includes both feed and story previews where applicable.
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';

export function FacebookPreview({ caption, media, accountName = 'Your Page', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-between px-3 py-2 bg-white">
                <span className="text-xl font-bold text-blue-600">facebook</span>
                <div className="flex items-center gap-3 text-gray-600">
                    <span>➕</span><span>🔍</span><span>💬</span>
                </div>
            </div>

            <div className="border-t-4 border-gray-100">
                <div className="flex items-center gap-2 p-3">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="lg"
                    />
                    <div>
                        <div className="text-sm font-semibold">{accountName}</div>
                        <div className="text-[10px] text-gray-500">Just now · 🌐</div>
                    </div>
                    <span className="ml-auto text-gray-400">•••</span>
                </div>

                <div className="px-3 pb-2 text-xs">{caption.slice(0, 100)}{caption.length > 100 && '...'}</div>

                <div className="aspect-square bg-gray-100">
                    <MediaPreview media={media[0]} />
                </div>

                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
                    <div>👍😂❤️ 142</div><div>24 comments • 8 shares</div>
                </div>

                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-xs text-gray-600">
                    <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-lg">
                <span>🏠</span><span>👥</span><span>📺</span><span>🛒</span><span>🔔</span><span>☰</span>
            </div>
        </PhoneFrame>
    );
}

/**
 * Facebook Story Preview - Full screen vertical format
 */
export function FacebookStoryPreview({ media, accountName = 'Your Page', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gradient-to-br from-blue-600 to-blue-800">
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

                {/* Reply section at bottom */}
                <div className="absolute bottom-4 left-3 right-3">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full border border-white/40 bg-white/10 px-3 py-2">
                            <span className="text-xs text-white/60">Reply to {accountName}...</span>
                        </div>
                        <span className="text-xl">👍</span>
                    </div>
                </div>
            </div>
        </PhoneFrame>
    );
}

export function PinterestPreview({ caption, media, accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-center py-2">
                <span className="text-xl text-red-600 font-bold">📌</span>
            </div>

            <div className="px-2">
                <div className="overflow-hidden rounded-2xl bg-gray-100">
                    <div className="aspect-[2/3] bg-gradient-to-br from-pink-200 to-red-200">
                        <MediaPreview media={media[0]} />
                    </div>
                </div>
                <div className="mt-2 px-1">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium line-clamp-2">{caption.slice(0, 40) || 'Pin title'}</div>
                        <button className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-semibold text-white">Save</button>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around py-3 text-lg mt-2">
                <span>🏠</span><span>🔍</span><span>➕</span><span>💬</span><span>👤</span>
            </div>
        </PhoneFrame>
    );
}

export function LinkedInPreview({ caption, media, accountName = 'Your Name', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-between px-3 py-2 bg-white">
                <span className="text-lg font-bold text-blue-700">in</span>
                <div className="flex-1 mx-2">
                    <div className="bg-gray-100 rounded-sm px-2 py-1 text-[10px] text-gray-500">🔍 Search</div>
                </div>
                <span className="text-gray-600">💬</span>
            </div>

            <div className="border-t border-gray-200">
                <div className="flex items-center gap-2 p-3">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="lg"
                    />
                    <div className="flex-1">
                        <div className="text-xs font-semibold">{accountName}</div>
                        <div className="text-[10px] text-gray-500">CEO at Company</div>
                        <div className="text-[10px] text-gray-400">2h • 🌐</div>
                    </div>
                    <span className="text-gray-400">•••</span>
                </div>

                <div className="px-3 pb-2 text-xs">{caption.slice(0, 120)}{caption.length > 120 && '... more'}</div>

                <div className="aspect-[1.91/1] bg-gray-100">
                    <MediaPreview media={media[0]} />
                </div>

                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-gray-500">
                    <div>👍💡❤️ 89</div><div>12 comments • 4 reposts</div>
                </div>

                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-[10px] text-gray-600">
                    <span>👍 Like</span><span>💬 Comment</span><span>🔄 Repost</span><span>↗ Send</span>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-[10px] text-gray-600">
                <div className="flex flex-col items-center"><span>🏠</span>Home</div>
                <div className="flex flex-col items-center"><span>👥</span>Network</div>
                <div className="flex flex-col items-center"><span>➕</span>Post</div>
                <div className="flex flex-col items-center"><span>🔔</span>Notifs</div>
                <div className="flex flex-col items-center"><span>💼</span>Jobs</div>
            </div>
        </PhoneFrame>
    );
}

export function BlueskyPreview({ caption, media, accountName = 'you.bsky.social', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <span className="text-lg font-bold text-blue-500">🦋</span>
            </div>

            <div className="p-3">
                <div className="flex gap-2">
                    <ProfileAvatar
                        src={accountAvatar}
                        name={accountName}
                        size="lg"
                        className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold">Your Name</span>
                            <span className="text-[10px] text-gray-400">@{accountName}</span>
                            <span className="text-[10px] text-gray-400">• 2m</span>
                        </div>
                        <div className="text-xs mt-1">{caption.slice(0, 100)}{caption.length > 100 && '...'}</div>

                        <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-gray-100">
                            <MediaPreview media={media[0]} />
                        </div>

                        <div className="flex items-center gap-6 mt-2 text-gray-400 text-xs">
                            <span>💬 4</span><span>🔄 12</span><span>♡ 47</span><span>↗</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-3 text-lg mt-auto">
                <span>🏠</span><span>🔍</span><span>🔔</span><span>💬</span><span>👤</span>
            </div>
        </PhoneFrame>
    );
}

export function GoogleBusinessPreview({ caption, media, accountName = 'Your Business' }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center gap-2 px-3 py-2 bg-white">
                <span className="text-lg font-medium text-gray-700">G</span>
                <span className="text-sm text-gray-600">Business Profile</span>
            </div>

            <div className="m-2 rounded-xl border border-gray-200 overflow-hidden">
                <div className="aspect-video bg-gray-100">
                    <MediaPreview media={media[0]} />
                </div>

                <div className="p-3">
                    <div className="text-sm font-medium">{accountName}</div>
                    <div className="text-xs text-gray-500 mt-1">{caption.slice(0, 80)}{caption.length > 80 && '...'}</div>
                    <div className="flex items-center gap-2 mt-2">
                        <button className="rounded-full bg-blue-600 px-3 py-1 text-[10px] text-white">Learn more</button>
                        <button className="rounded-full border border-gray-300 px-3 py-1 text-[10px] text-gray-600">Call</button>
                    </div>
                </div>
            </div>
        </PhoneFrame>
    );
}

