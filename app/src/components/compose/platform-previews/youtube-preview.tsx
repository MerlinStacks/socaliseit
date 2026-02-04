/**
 * YouTube Preview Components (Video, Shorts)
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';

export function YouTubePreview({ caption, media, accountName = 'Your Channel', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-1 text-red-600 font-bold text-sm">
                    <span>▶</span> YouTube
                </div>
                <div className="flex items-center gap-3 text-gray-600">
                    <span>📺</span><span>🔔</span><span>🔍</span>
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
                    <div className="text-xs font-medium line-clamp-2">{caption.slice(0, 60) || 'Video Title'}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{accountName} • 12K views • 2 days ago</div>
                </div>
                <span className="text-gray-400">⋮</span>
            </div>

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

export function YouTubeShortsPreview({ caption, media, accountName = 'Your Channel', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame dark>
            <div className="relative aspect-[9/16] bg-gray-900">
                <MediaPreview media={media[0]} dark />

                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 text-white">
                    <div className="flex flex-col items-center"><span className="text-2xl">👍</span><span className="text-[10px]">5.2K</span></div>
                    <div className="flex flex-col items-center"><span className="text-2xl">👎</span><span className="text-[10px]">Dislike</span></div>
                    <div className="flex flex-col items-center"><span className="text-2xl">💬</span><span className="text-[10px]">89</span></div>
                    <div className="flex flex-col items-center"><span className="text-2xl">↗</span><span className="text-[10px]">Share</span></div>
                </div>

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

