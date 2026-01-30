/**
 * Platform Preview Components
 * Realistic mobile app mockups for social media platforms
 */

'use client';

import { cn } from '@/lib/utils';
import { type Platform, type PostType, PLATFORM_SPECS } from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import type { MediaItem } from './platform-editor';

// -----------------------------------------------------------------------------
// Phone Frame Component
// -----------------------------------------------------------------------------

interface PhoneFrameProps {
    children: React.ReactNode;
    dark?: boolean;
    className?: string;
}

/**
 * Reusable phone frame with iOS status bar
 */
function PhoneFrame({ children, dark = false, className }: PhoneFrameProps) {
    return (
        <div className={cn('mx-auto max-w-[260px]', className)}>
            <div className="rounded-[28px] bg-black p-2">
                <div className={cn(
                    'overflow-hidden rounded-[22px]',
                    dark ? 'bg-black text-white' : 'bg-white text-gray-900'
                )}>
                    {/* Status Bar */}
                    <div className={cn(
                        'flex items-center justify-between px-4 py-1.5 text-[10px] font-medium',
                        dark ? 'text-white' : 'text-black'
                    )}>
                        <span>9:41</span>
                        <div className="flex items-center gap-1">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 3C7.5 3 3.75 6.03 2 10c1.75 3.97 5.5 7 10 7s8.25-3.03 10-7c-1.75-3.97-5.5-7-10-7z" opacity="0.3" />
                                <path d="M1 9l2 2m18 0l2-2M5 5l1.5 1.5M19 5l-1.5 1.5" />
                            </svg>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2 17h20v4H2z" />
                                <path d="M4 13h16v2H4zM6 9h12v2H6zM9 5h6v2H9z" opacity="0.5" />
                            </svg>
                            <div className="flex items-center">
                                <div className="h-2.5 w-5 rounded-sm border border-current p-px">
                                    <div className="h-full w-3/4 rounded-sm bg-current" />
                                </div>
                            </div>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// Instagram Previews
// -----------------------------------------------------------------------------

interface PreviewProps {
    caption: string;
    media: MediaItem[];
    accountName?: string;
}

function InstagramFeedPreview({ caption, media, accountName = 'youraccount' }: PreviewProps) {
    const likeCount = Math.floor(Math.random() * 2000) + 500;

    return (
        <PhoneFrame>
            {/* Instagram Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-lg font-semibold" style={{ fontFamily: 'inherit' }}>Instagram</span>
                <div className="flex items-center gap-4 text-gray-900">
                    <span className="text-lg">♡</span>
                    <span className="text-lg">✈</span>
                </div>
            </div>

            {/* Post Header with profile */}
            <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                    <div className="h-full w-full rounded-full bg-white p-0.5">
                        <div className="h-full w-full rounded-full bg-gradient-to-br from-purple-400 to-pink-400" />
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
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-4 text-xl">
                    <span>♡</span>
                    <span>💬</span>
                    <span>↗</span>
                </div>
                <span className="text-xl">🔖</span>
            </div>

            {/* Likes */}
            <div className="px-3 text-xs font-semibold">
                {likeCount.toLocaleString()} likes
            </div>

            {/* Caption */}
            <div className="px-3 py-1 text-xs">
                <span className="font-semibold">{accountName}</span>{' '}
                {caption.slice(0, 80)}
                {caption.length > 80 && <span className="text-gray-400"> ...more</span>}
            </div>

            {/* View Comments */}
            <div className="px-3 pb-2 text-[10px] text-gray-400">
                View all 12 comments
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-lg">
                <span>🏠</span>
                <span>🔍</span>
                <span>➕</span>
                <span>🎬</span>
                <div className="h-5 w-5 rounded-full bg-gray-300" />
            </div>
        </PhoneFrame>
    );
}

function InstagramReelPreview({ caption, media, accountName = 'youraccount' }: PreviewProps) {
    return (
        <PhoneFrame dark>
            {/* Reel Content */}
            <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-600 to-pink-500">
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}

                {/* Right Actions */}
                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">♡</span>
                        <span className="text-[10px]">1.2K</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">💬</span>
                        <span className="text-[10px]">48</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">↗</span>
                    </div>
                    <div className="h-6 w-6 rounded border border-white/50 bg-gradient-to-br from-purple-400 to-pink-400" />
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-3 left-3 right-12">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-yellow-400 to-pink-500" />
                        <span className="text-xs font-semibold text-white">{accountName}</span>
                        <button className="rounded border border-white px-2 py-0.5 text-[10px] text-white">Follow</button>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{caption.slice(0, 60)}...</div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/80">
                        <span>🎵</span>
                        <span className="truncate">Original audio • {accountName}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around bg-black py-2 text-white text-lg">
                <span>🏠</span>
                <span>🔍</span>
                <span>➕</span>
                <span className="font-bold">🎬</span>
                <div className="h-5 w-5 rounded-full bg-gray-600" />
            </div>
        </PhoneFrame>
    );
}

function InstagramStoryPreview({ media, accountName = 'youraccount' }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-600 to-pink-500">
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}

                {/* Progress bars */}
                <div className="absolute top-2 left-2 right-2 flex gap-1">
                    <div className="h-0.5 flex-1 rounded-full bg-white" />
                </div>

                {/* Profile header */}
                <div className="absolute top-4 left-3 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 ring-2 ring-white" />
                    <span className="text-xs font-semibold text-white">{accountName}</span>
                    <span className="text-[10px] text-white/60">2h</span>
                </div>

                {/* Close button */}
                <div className="absolute top-4 right-3 text-white text-lg">✕</div>
            </div>
        </PhoneFrame>
    );
}

// -----------------------------------------------------------------------------
// TikTok Preview
// -----------------------------------------------------------------------------

function TikTokPreview({ caption, media, accountName = 'youraccount' }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-black">
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}

                {/* Top bar */}
                <div className="absolute top-2 left-0 right-0 flex items-center justify-center gap-4 text-white">
                    <span className="text-sm text-white/60">Following</span>
                    <span className="text-sm font-semibold border-b-2 border-white pb-0.5">For You</span>
                </div>

                {/* Right Actions */}
                <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gray-600 ring-2 ring-white" />
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">♡</span>
                        <span className="text-[10px]">24.5K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">💬</span>
                        <span className="text-[10px]">482</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">🔖</span>
                        <span className="text-[10px]">1.2K</span>
                    </div>
                    <div className="flex flex-col items-center text-white">
                        <span className="text-2xl">↗</span>
                        <span className="text-[10px]">Share</span>
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
                        <span>🎵</span>
                        <span className="truncate">Original sound - {accountName}</span>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
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

// -----------------------------------------------------------------------------
// YouTube Previews
// -----------------------------------------------------------------------------

function YouTubePreview({ caption, media, accountName = 'Your Channel' }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* YouTube Header */}
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
                    <span>▶</span> YouTube
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                    <span>📺</span>
                    <span>🔔</span>
                    <span>🔍</span>
                </div>
            </div>

            {/* Video Thumbnail */}
            <div className="relative aspect-video bg-gray-900">
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}
                <div className="absolute bottom-1 right-1 bg-black/80 px-1 text-[10px] text-white rounded">
                    3:42
                </div>
            </div>

            {/* Video Info */}
            <div className="flex gap-2 p-3">
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-br from-red-400 to-orange-400" />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium line-clamp-2">{caption.slice(0, 60) || 'Video Title'}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                        {accountName} • 12K views • 2 days ago
                    </div>
                </div>
                <span className="text-gray-400">⋮</span>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-[10px] text-gray-600">
                <div className="flex flex-col items-center"><span>🏠</span>Home</div>
                <div className="flex flex-col items-center"><span>🎬</span>Shorts</div>
                <div className="flex flex-col items-center"><span>➕</span></div>
                <div className="flex flex-col items-center"><span>📋</span>Subs</div>
                <div className="flex flex-col items-center"><span>📚</span>Library</div>
            </div>
        </PhoneFrame>
    );
}

function YouTubeShortsPreview({ caption, media, accountName = 'Your Channel' }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gray-900">
                {media.length > 0 && (
                    <img
                        src={media[0].thumbnailUrl || media[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}

                {/* Right Actions */}
                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">👍</span>
                        <span className="text-[10px]">5.2K</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">👎</span>
                        <span className="text-[10px]">Dislike</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">💬</span>
                        <span className="text-[10px]">89</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-2xl">↗</span>
                        <span className="text-[10px]">Share</span>
                    </div>
                </div>

                {/* Bottom Info */}
                <div className="absolute bottom-3 left-3 right-14">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{accountName}</span>
                        <button className="rounded bg-white text-black px-2 py-0.5 text-[10px] font-medium">Subscribe</button>
                    </div>
                    <div className="text-xs text-white line-clamp-2">{caption.slice(0, 60)}...</div>
                </div>
            </div>
        </PhoneFrame>
    );
}

// -----------------------------------------------------------------------------
// Facebook Preview
// -----------------------------------------------------------------------------

function FacebookPreview({ caption, media, accountName = 'Your Page' }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* Facebook Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-white">
                <span className="text-xl font-bold text-blue-600">facebook</span>
                <div className="flex items-center gap-3 text-gray-600">
                    <span>➕</span>
                    <span>🔍</span>
                    <span>💬</span>
                </div>
            </div>

            {/* Post */}
            <div className="border-t-4 border-gray-100">
                {/* Author */}
                <div className="flex items-center gap-2 p-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
                    <div>
                        <div className="text-sm font-semibold">{accountName}</div>
                        <div className="text-[10px] text-gray-500">Just now · 🌐</div>
                    </div>
                    <span className="ml-auto text-gray-400">•••</span>
                </div>

                {/* Caption */}
                <div className="px-3 pb-2 text-xs">{caption.slice(0, 100)}{caption.length > 100 && '...'}</div>

                {/* Media */}
                <div className="aspect-square bg-gray-100">
                    {media.length > 0 && (
                        <img
                            src={media[0].thumbnailUrl || media[0].url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    )}
                </div>

                {/* Reactions */}
                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
                    <div>👍😂❤️ 142</div>
                    <div>24 comments • 8 shares</div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-xs text-gray-600">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>↗ Share</span>
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-lg">
                <span>🏠</span>
                <span>👥</span>
                <span>📺</span>
                <span>🛒</span>
                <span>🔔</span>
                <span>☰</span>
            </div>
        </PhoneFrame>
    );
}

// -----------------------------------------------------------------------------
// Pinterest Preview
// -----------------------------------------------------------------------------

function PinterestPreview({ caption, media }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* Pinterest Header */}
            <div className="flex items-center justify-center py-2">
                <span className="text-xl text-red-600 font-bold">📌</span>
            </div>

            {/* Pin Card */}
            <div className="px-2">
                <div className="overflow-hidden rounded-2xl bg-gray-100">
                    <div className="aspect-[2/3] bg-gradient-to-br from-pink-200 to-red-200">
                        {media.length > 0 && (
                            <img
                                src={media[0].thumbnailUrl || media[0].url}
                                alt=""
                                className="h-full w-full object-cover"
                            />
                        )}
                    </div>
                </div>
                <div className="mt-2 px-1">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-medium line-clamp-2">{caption.slice(0, 40) || 'Pin title'}</div>
                        <button className="rounded-full bg-red-600 px-3 py-1 text-[10px] font-semibold text-white">Save</button>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around py-3 text-lg mt-2">
                <span>🏠</span>
                <span>🔍</span>
                <span>➕</span>
                <span>💬</span>
                <span>👤</span>
            </div>
        </PhoneFrame>
    );
}

// -----------------------------------------------------------------------------
// LinkedIn Preview
// -----------------------------------------------------------------------------

function LinkedInPreview({ caption, media, accountName = 'Your Name' }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* LinkedIn Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-white">
                <span className="text-lg font-bold text-blue-700">in</span>
                <div className="flex-1 mx-2">
                    <div className="bg-gray-100 rounded-sm px-2 py-1 text-[10px] text-gray-500">🔍 Search</div>
                </div>
                <span className="text-gray-600">💬</span>
            </div>

            {/* Post */}
            <div className="border-t border-gray-200">
                {/* Author */}
                <div className="flex items-center gap-2 p-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800" />
                    <div className="flex-1">
                        <div className="text-xs font-semibold">{accountName}</div>
                        <div className="text-[10px] text-gray-500">CEO at Company</div>
                        <div className="text-[10px] text-gray-400">2h • 🌐</div>
                    </div>
                    <span className="text-gray-400">•••</span>
                </div>

                {/* Caption */}
                <div className="px-3 pb-2 text-xs">{caption.slice(0, 120)}{caption.length > 120 && '... more'}</div>

                {/* Media */}
                <div className="aspect-[1.91/1] bg-gray-100">
                    {media.length > 0 && (
                        <img
                            src={media[0].thumbnailUrl || media[0].url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    )}
                </div>

                {/* Reactions */}
                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-gray-500">
                    <div>👍💡❤️ 89</div>
                    <div>12 comments • 4 reposts</div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-[10px] text-gray-600">
                    <span>👍 Like</span>
                    <span>💬 Comment</span>
                    <span>🔄 Repost</span>
                    <span>↗ Send</span>
                </div>
            </div>

            {/* Bottom Nav */}
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

// -----------------------------------------------------------------------------
// Bluesky Preview
// -----------------------------------------------------------------------------

function BlueskyPreview({ caption, media, accountName = 'you.bsky.social' }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* Bluesky Header */}
            <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <span className="text-lg font-bold text-blue-500">🦋</span>
            </div>

            {/* Post */}
            <div className="p-3">
                <div className="flex gap-2">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold">Your Name</span>
                            <span className="text-[10px] text-gray-400">@{accountName}</span>
                            <span className="text-[10px] text-gray-400">• 2m</span>
                        </div>
                        <div className="text-xs mt-1">{caption.slice(0, 100)}{caption.length > 100 && '...'}</div>

                        {/* Media */}
                        {media.length > 0 && (
                            <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-gray-100">
                                <img
                                    src={media[0].thumbnailUrl || media[0].url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-6 mt-2 text-gray-400 text-xs">
                            <span>💬 4</span>
                            <span>🔄 12</span>
                            <span>♡ 47</span>
                            <span>↗</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-3 text-lg mt-auto">
                <span>🏠</span>
                <span>🔍</span>
                <span>🔔</span>
                <span>💬</span>
                <span>👤</span>
            </div>
        </PhoneFrame>
    );
}

// -----------------------------------------------------------------------------
// Google Business Preview
// -----------------------------------------------------------------------------

function GoogleBusinessPreview({ caption, media, accountName = 'Your Business' }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* Google Header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white">
                <span className="text-lg font-medium text-gray-700">G</span>
                <span className="text-sm text-gray-600">Business Profile</span>
            </div>

            {/* Business Card */}
            <div className="m-2 rounded-xl border border-gray-200 overflow-hidden">
                {/* Media */}
                <div className="aspect-video bg-gray-100">
                    {media.length > 0 && (
                        <img
                            src={media[0].thumbnailUrl || media[0].url}
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    )}
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

// -----------------------------------------------------------------------------
// Main PlatformPreview Component
// -----------------------------------------------------------------------------

export interface PlatformPreviewProps {
    platform: Platform;
    postType: PostType;
    caption: string;
    media: MediaItem[];
    accountName?: string;
}

/**
 * Orchestrator component that renders the appropriate platform preview
 */
export function PlatformPreview({ platform, postType, caption, media, accountName }: PlatformPreviewProps) {
    const spec = PLATFORM_SPECS[platform];
    const props = { caption, media, accountName };

    // Route to appropriate preview based on platform and post type
    switch (platform) {
        case 'instagram':
            if (postType === 'reel') return <InstagramReelPreview {...props} />;
            if (postType === 'story') return <InstagramStoryPreview {...props} />;
            return <InstagramFeedPreview {...props} />;

        case 'tiktok':
            return <TikTokPreview {...props} />;

        case 'youtube':
            if (postType === 'reel') return <YouTubeShortsPreview {...props} />;
            return <YouTubePreview {...props} />;

        case 'facebook':
            // Could add FacebookReelPreview, FacebookStoryPreview later
            return <FacebookPreview {...props} />;

        case 'pinterest':
            return <PinterestPreview {...props} />;

        case 'linkedin':
            return <LinkedInPreview {...props} />;

        case 'bluesky':
            return <BlueskyPreview {...props} />;

        case 'google_business':
            return <GoogleBusinessPreview {...props} />;

        default:
            return <InstagramFeedPreview {...props} />;
    }
}
