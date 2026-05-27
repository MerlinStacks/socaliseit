/**
 * Other Platform Preview Components (Facebook, Pinterest, LinkedIn, Bluesky, Google Business)
 * Includes both feed and story previews where applicable.
 * Why: Each preview mimics the native platform UI with SVG icons instead of emojis.
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';
import { CarouselSlider } from './carousel-slider';
import {
    HomeIcon,
    SearchIcon,
    PlusIcon,
    BellIcon,
    GlobeIcon,
    CommentBubble,
    ShareArrow,
    HeartOutline,
    BookmarkOutline,
    RepostArrows,
    PersonIcon,
    MoreHorizontal,
    FbLikeThumb,
    FbHaha,
    FbLove,
    FbWatchIcon,
    FbMarketplaceIcon,
    FbGroupsIcon,
    FbMenuIcon,
    FbMessengerIcon,
    PinIcon,
    LiInsightIcon,
    LiBriefcaseIcon,
    BskyButterflyIcon,
} from './platform-icons';

export function FacebookPreview({ caption, media, accountName = 'Your Page', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-between px-3 py-2 bg-white">
                <span className="text-xl font-bold text-blue-600">facebook</span>
                <div className="flex items-center gap-3 text-gray-600">
                    <PlusIcon className="w-5 h-5" />
                    <SearchIcon className="w-5 h-5" />
                    <FbMessengerIcon className="w-5 h-5" />
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
                        <div className="flex items-center gap-1 text-[10px] text-gray-500">
                            Just now · <GlobeIcon className="w-2.5 h-2.5 inline" />
                        </div>
                    </div>
                    <MoreHorizontal className="ml-auto w-4 h-4 text-gray-400" />
                </div>

                <div className="px-3 pb-2 text-xs">{caption.slice(0, 100)}{caption.length > 100 && '...'}</div>

                <CarouselSlider
                    media={media}
                    aspectRatio="aspect-square"
                    bgClass="bg-gray-100"
                />

                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
                    <div className="flex items-center gap-0.5">
                        <FbLikeThumb className="w-4 h-4 text-blue-600" />
                        <FbHaha className="w-4 h-4" />
                        <FbLove className="w-4 h-4" />
                        <span className="ml-1">142</span>
                    </div>
                    <div>24 comments • 8 shares</div>
                </div>

                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-xs text-gray-600">
                    <div className="flex items-center gap-1"><FbLikeThumb className="w-4 h-4" /> Like</div>
                    <div className="flex items-center gap-1"><CommentBubble className="w-4 h-4" /> Comment</div>
                    <div className="flex items-center gap-1"><ShareArrow className="w-4 h-4" /> Share</div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-2">
                <HomeIcon className="w-5 h-5" />
                <FbGroupsIcon className="w-5 h-5" />
                <FbWatchIcon className="w-5 h-5" />
                <FbMarketplaceIcon className="w-5 h-5" />
                <BellIcon className="w-5 h-5" />
                <FbMenuIcon className="w-5 h-5" />
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
            <div className="relative flex-1 bg-gradient-to-br from-blue-600 to-blue-800">
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

                {/* Reply section at bottom — single-line to match real Facebook */}
                <div className="absolute bottom-4 left-3 right-3">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 rounded-full border border-white/40 bg-white/10 px-3 py-2 overflow-hidden">
                            <span className="block truncate text-xs text-white/60">Reply to {accountName}...</span>
                        </div>
                        <FbLikeThumb className="w-6 h-6 flex-shrink-0 text-white" />
                    </div>
                </div>
            </div>
        </PhoneFrame>
    );
}

/**
 * Facebook Reels Preview - Full-screen vertical video format
 */
export function FacebookReelPreview({ caption, media, accountName = 'Your Page', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative flex-1 bg-gradient-to-br from-slate-900 via-blue-950 to-black">
                <MediaPreview media={media[0]} dark />

                <div className="absolute left-3 right-3 top-3 flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">Reels</span>
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur">Facebook</span>
                    </div>
                    <SearchIcon className="h-5 w-5" />
                </div>

                <div className="absolute bottom-5 right-3 flex flex-col items-center gap-4 text-white drop-shadow">
                    <div className="flex flex-col items-center gap-1">
                        <FbLikeThumb className="h-7 w-7" />
                        <span className="text-[10px] font-semibold">1.2K</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <CommentBubble className="h-7 w-7" />
                        <span className="text-[10px] font-semibold">48</span>
                    </div>
                    <ShareArrow className="h-7 w-7" />
                    <MoreHorizontal className="h-6 w-6" />
                </div>

                <div className="absolute bottom-5 left-3 right-14 text-white drop-shadow">
                    <div className="mb-2 flex items-center gap-2">
                        <ProfileAvatar
                            src={accountAvatar}
                            name={accountName}
                            size="sm"
                            dark
                            ring
                        />
                        <span className="text-xs font-semibold">{accountName}</span>
                        <button className="rounded-md border border-white/80 px-2 py-0.5 text-[10px] font-semibold text-white">Follow</button>
                    </div>
                    <div className="line-clamp-2 text-xs">{caption.slice(0, 80)}{caption.length > 80 && '...'}</div>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-white/80">
                        <FbWatchIcon className="h-3 w-3" />
                        <span className="truncate">Original audio • {accountName}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-white/10 bg-black py-2 text-white">
                <HomeIcon className="h-5 w-5" />
                <FbWatchIcon className="h-5 w-5 text-blue-400" />
                <PlusIcon className="h-5 w-5" />
                <BellIcon className="h-5 w-5" />
                <FbMenuIcon className="h-5 w-5" />
            </div>
        </PhoneFrame>
    );
}

export function PinterestPreview({ caption, media, accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-center py-2">
                <PinIcon className="w-6 h-6 text-red-600" />
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

            <div className="flex items-center justify-around py-3 mt-2">
                <HomeIcon className="w-5 h-5" />
                <SearchIcon className="w-5 h-5" />
                <PlusIcon className="w-5 h-5" />
                <CommentBubble className="w-5 h-5" />
                <PersonIcon className="w-5 h-5" />
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
                    <div className="flex items-center gap-1 bg-gray-100 rounded-sm px-2 py-1 text-[10px] text-gray-500">
                        <SearchIcon className="w-3 h-3" /> Search
                    </div>
                </div>
                <FbMessengerIcon className="w-5 h-5 text-gray-600" />
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
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            2h • <GlobeIcon className="w-2.5 h-2.5 inline" />
                        </div>
                    </div>
                    <MoreHorizontal className="w-4 h-4 text-gray-400" />
                </div>

                <div className="px-3 pb-2 text-xs">{caption.slice(0, 120)}{caption.length > 120 && '... more'}</div>

                <div className="aspect-[1.91/1] bg-gray-100">
                    <MediaPreview media={media[0]} />
                </div>

                <div className="flex items-center justify-between px-3 py-2 text-[10px] text-gray-500">
                    <div className="flex items-center gap-0.5">
                        <FbLikeThumb className="w-4 h-4 text-blue-600" />
                        <LiInsightIcon className="w-4 h-4 text-yellow-500" />
                        <FbLove className="w-4 h-4" />
                        <span className="ml-1">89</span>
                    </div>
                    <div>12 comments • 4 reposts</div>
                </div>

                <div className="flex items-center justify-around border-t border-gray-200 py-2 text-[10px] text-gray-600">
                    <div className="flex items-center gap-1"><FbLikeThumb className="w-4 h-4" /> Like</div>
                    <div className="flex items-center gap-1"><CommentBubble className="w-4 h-4" /> Comment</div>
                    <div className="flex items-center gap-1"><RepostArrows className="w-4 h-4" /> Repost</div>
                    <div className="flex items-center gap-1"><ShareArrow className="w-4 h-4" /> Send</div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-2 text-[10px] text-gray-600">
                <div className="flex flex-col items-center gap-0.5"><HomeIcon className="w-5 h-5" />Home</div>
                <div className="flex flex-col items-center gap-0.5"><FbGroupsIcon className="w-5 h-5" />Network</div>
                <div className="flex flex-col items-center gap-0.5"><PlusIcon className="w-5 h-5" />Post</div>
                <div className="flex flex-col items-center gap-0.5"><BellIcon className="w-5 h-5" />Notifs</div>
                <div className="flex flex-col items-center gap-0.5"><LiBriefcaseIcon className="w-5 h-5" />Jobs</div>
            </div>
        </PhoneFrame>
    );
}

export function BlueskyPreview({ caption, media, accountName = 'you.bsky.social', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <BskyButterflyIcon className="w-6 h-6 text-blue-500" />
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

                        <div className="flex items-center gap-6 mt-2 text-gray-400">
                            <div className="flex items-center gap-1"><CommentBubble className="w-4 h-4" /><span className="text-xs">4</span></div>
                            <div className="flex items-center gap-1"><RepostArrows className="w-4 h-4" /><span className="text-xs">12</span></div>
                            <div className="flex items-center gap-1"><HeartOutline className="w-4 h-4" /><span className="text-xs">47</span></div>
                            <ShareArrow className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-around border-t border-gray-100 py-3 mt-auto">
                <HomeIcon className="w-6 h-6" />
                <SearchIcon className="w-6 h-6" />
                <BellIcon className="w-6 h-6" />
                <CommentBubble className="w-6 h-6" />
                <PersonIcon className="w-6 h-6" />
            </div>
        </PhoneFrame>
    );
}

export function GoogleBusinessPreview({ caption, media, accountName = 'Your Business' }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center gap-2 px-3 py-2 bg-white">
                {/* Google "G" logo styled as authentic multi-color */}
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
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
