/**
 * Threads Preview Component
 * Renders a Threads-style post preview (text-first microblog feed).
 *
 * Why: Threads is a distinct platform from Instagram — it's a text-first feed
 * similar to Twitter/X. Without a dedicated preview, the compose modal falls
 * through to InstagramFeedPreview which misrepresents the final output.
 */

'use client';

import { PhoneFrame, MediaPreview, ProfileAvatar, type PreviewProps } from './shared';
import {
    HeartOutline,
    CommentBubble,
    RepostArrows,
    ShareArrow,
    HomeIcon,
    SearchIcon,
    EditPencil,
    PersonIcon,
} from './platform-icons';

/**
 * Threads feed post preview
 * Why: Mimics the real Threads app — black-and-white minimal design,
 * text-first layout with optional media, reply line, simple action bar.
 */
export function ThreadsPreview({ caption, media, accountName = 'youraccount', accountAvatar }: PreviewProps) {
    return (
        <PhoneFrame>
            {/* Threads Header */}
            <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.698 6.542 2.717 2.227-.017 4.074-.59 5.49-1.701 1.328-1.041 2.008-2.417 2.018-4.08-.006-1.27-.396-2.274-1.161-2.985-.787-.731-1.926-1.13-3.382-1.19-.94.008-1.79.18-2.482.556l-.002.001c-.58.313-1.005.756-1.254 1.312-.086.193-.13.39-.13.593 0 .065.003.13.011.197.084.706.536 1.097 1.386 1.202.314.028.722.032 1.213.01l.164-.006c.46-.018.94-.036 1.478-.028l.07 2.118c-.607.008-1.146.028-1.66.048l-.164.006c-.585.025-1.076.022-1.48-.01l-.07-.008c-1.904-.217-3.07-1.46-3.265-3.088a3.953 3.953 0 0 1-.028-.532c0-.583.128-1.139.38-1.65.558-1.122 1.57-1.93 2.908-2.35l.002-.001c.93-.29 2-.442 3.172-.451h.038c1.953.078 3.532.657 4.696 1.718 1.137 1.038 1.727 2.48 1.753 4.286.009.072.013.143.013.216-.015 2.305-.95 4.22-2.78 5.688C17.078 23.22 14.774 23.978 12.186 24z" />
                </svg>
            </div>

            {/* Post */}
            <div className="p-3">
                <div className="flex gap-3">
                    {/* Avatar + thread line */}
                    <div className="flex flex-col items-center">
                        <ProfileAvatar
                            src={accountAvatar}
                            name={accountName}
                            size="lg"
                            className="flex-shrink-0"
                        />
                        {/* Thread line connector */}
                        <div className="mt-1 flex-1 w-0.5 bg-gray-200 rounded-full min-h-[16px]" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold">{accountName}</span>
                            <span className="text-[10px] text-gray-400">• 2m</span>
                        </div>
                        <div className="text-xs mt-1 whitespace-pre-wrap">
                            {caption.slice(0, 200)}{caption.length > 200 && '...'}
                        </div>

                        {/* Optional media */}
                        {media.length > 0 && media[0] && (
                            <div className="mt-2 rounded-lg overflow-hidden bg-gray-100 aspect-video">
                                <MediaPreview media={media[0]} />
                            </div>
                        )}

                        {/* Action bar */}
                        <div className="flex items-center gap-5 mt-2 text-gray-400">
                            <div className="flex items-center gap-1"><HeartOutline className="w-4 h-4" /><span className="text-xs">24</span></div>
                            <div className="flex items-center gap-1"><CommentBubble className="w-4 h-4" /><span className="text-xs">3</span></div>
                            <div className="flex items-center gap-1"><RepostArrows className="w-4 h-4" /><span className="text-xs">8</span></div>
                            <ShareArrow className="w-4 h-4" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="flex items-center justify-around border-t border-gray-100 py-3 mt-auto">
                <HomeIcon className="w-6 h-6" />
                <SearchIcon className="w-6 h-6" />
                <EditPencil className="w-6 h-6" />
                <HeartOutline className="w-6 h-6" />
                <ProfileAvatar src={accountAvatar} name={accountName} size="sm" />
            </div>
        </PhoneFrame>
    );
}
