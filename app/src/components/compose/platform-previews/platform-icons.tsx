/**
 * Platform-authentic SVG icons for post composer previews.
 * Why: Unicode emojis render inconsistently across OS/browser and don't match
 * the native look of each social platform. These inline SVGs replicate the
 * real icon shapes used in Instagram, TikTok, YouTube, etc.
 *
 * Every icon accepts `className` for sizing/coloring and uses `currentColor`
 * so it inherits the parent text colour.
 */

'use client';

interface IconProps {
    className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Universal / shared icons                                                  */
/* -------------------------------------------------------------------------- */

/** Outline heart — Instagram, TikTok, Threads, Bluesky action bars */
export function HeartOutline({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
    );
}

/** Speech-bubble comment icon */
export function CommentBubble({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

/** Paper-plane / send / share arrow */
export function ShareArrow({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    );
}

/** Bookmark outline */
export function BookmarkOutline({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
    );
}

/** Home outline */
export function HomeIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    );
}

/** Home filled */
export function HomeFill({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
    );
}

/** Magnifying glass */
export function SearchIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    );
}

/** Plus circle / create */
export function PlusIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
    );
}

/** Bell / notification */
export function BellIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}

/** Globe */
export function GlobeIcon({ className = 'w-3 h-3' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    );
}

/** Three-dot horizontal menu */
export function MoreHorizontal({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
        </svg>
    );
}

/** Three-dot vertical menu */
export function MoreVertical({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
        </svg>
    );
}

/** Music note */
export function MusicNote({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" fill="currentColor" />
            <circle cx="18" cy="16" r="3" fill="currentColor" />
            <path d="M9 5l12-2" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
    );
}

/** Repost / retweet arrows */
export function RepostArrows({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
    );
}

/** Person / user outline */
export function PersonIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  Instagram-specific                                                        */
/* -------------------------------------------------------------------------- */

/** Instagram Reels icon (clapperboard) */
export function IgReelsIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="7" y1="17" x2="22" y2="17" />
        </svg>
    );
}

/** Instagram DM / paper plane (outline, mirrored look) */
export function IgDirectIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  YouTube-specific                                                          */
/* -------------------------------------------------------------------------- */

/** YouTube play button (red pill shape) */
export function YtPlayIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.4-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4L16 12l-6.5 3.6z" />
        </svg>
    );
}

/** Cast / screencast icon */
export function YtCastIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
            <line x1="2" y1="20" x2="2.01" y2="20" />
        </svg>
    );
}

/** YouTube Shorts lightning bolt */
export function YtShortsIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33-1.2-.5L18 9.06c1.8-.88 1.8-3.24 0-4.12L14.22 3.01a2.34 2.34 0 0 0-2.44 0L8 5.06l-1.2-.5c-1.8-.88-3.8.37-3.8 2.06v3.76c0 .65.37 1.25.97 1.56l1.2.5L4 13.06c-1.8.88-1.8 3.24 0 4.12l3.78 1.93c.77.4 1.67.4 2.44 0L14 17.18l1.2.5c1.8.88 3.8-.37 3.8-2.06V11.86c0-.65-.37-1.25-.97-1.56l-.26-.11z" />
        </svg>
    );
}

/** Subscriptions icon */
export function YtSubscriptionsIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M4 4h16" />
            <path d="M6 2h12" />
            <polygon points="10 10 10 16 15 13 10 10" fill="currentColor" />
        </svg>
    );
}

/** Library icon */
export function YtLibraryIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <polygon points="10 8 10 16 16 12 10 8" fill="currentColor" />
        </svg>
    );
}

/** Thumb up outline */
export function YtThumbUp({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
    );
}

/** Thumb down outline */
export function YtThumbDown({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
            <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  Facebook-specific                                                         */
/* -------------------------------------------------------------------------- */

/** Facebook like thumb (filled) */
export function FbLikeThumb({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21h4V9H2v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
        </svg>
    );
}

/** Facebook haha reaction */
export function FbHaha({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="#F7B928" />
            <path d="M8 13s1.5 3 4 3 4-3 4-3" fill="#6D4C1E" />
            <path d="M7 9c.6-.4 1.3-.3 1.7.2l.3.5.3-.5c.4-.5 1.1-.6 1.7-.2" stroke="#6D4C1E" strokeWidth="0.8" fill="none" />
            <path d="M13 9c.6-.4 1.3-.3 1.7.2l.3.5.3-.5c.4-.5 1.1-.6 1.7-.2" stroke="#6D4C1E" strokeWidth="0.8" fill="none" />
        </svg>
    );
}

/** Facebook/LinkedIn love reaction */
export function FbLove({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="#E5383B">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    );
}

/** Facebook Watch/video icon */
export function FbWatchIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polygon points="10 8 10 16 16 12 10 8" fill="currentColor" />
        </svg>
    );
}

/** Facebook Marketplace / storefront */
export function FbMarketplaceIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l1.5-5h15L21 9" />
            <path d="M3 9h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
            <path d="M9 9v3a3 3 0 0 0 6 0V9" />
        </svg>
    );
}

/** Facebook groups / two people */
export function FbGroupsIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

/** Hamburger menu */
export function FbMenuIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
    );
}

/** Messenger bubble icon */
export function FbMessengerIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.903 1.432 5.49 3.667 7.186V22l3.455-1.896A11.29 11.29 0 0 0 12 20.485c5.523 0 10-4.144 10-9.242C22 6.145 17.523 2 12 2zm1.09 12.45l-2.545-2.714-4.97 2.714 5.467-5.8 2.609 2.714 4.905-2.714-5.466 5.8z" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  LinkedIn-specific                                                         */
/* -------------------------------------------------------------------------- */

/** LinkedIn insight / lightbulb */
export function LiInsightIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 21h6v-2H9v2zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
        </svg>
    );
}

/** Briefcase */
export function LiBriefcaseIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  Pinterest-specific                                                        */
/* -------------------------------------------------------------------------- */

/** Pinterest pin icon */
export function PinIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
        </svg>
    );
}

/* -------------------------------------------------------------------------- */
/*  Bluesky-specific                                                          */
/* -------------------------------------------------------------------------- */

/** Bluesky butterfly logo */
export function BskyButterflyIcon({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 600 530" fill="currentColor">
            <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
        </svg>
    );
}

/** Edit / compose pencil */
export function EditPencil({ className = 'w-5 h-5' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}
