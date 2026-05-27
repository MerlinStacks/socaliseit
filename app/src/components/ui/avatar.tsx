
import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { clearFailedImageUrl, hasFailedImageUrl, markFailedImageUrl } from "@/lib/failed-image-cache"

const Avatar = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
            className
        )}
        {...props}
    />
))
Avatar.displayName = "Avatar"

/**
 * Why: Uses next/image with unoptimized for external social CDN avatars.
 * Gives us native lazy loading, proper width/height attributes for CLS
 * prevention, and automatic format negotiation when image optimization
 * is configured. Tracks load state and hides itself on error or missing src.
 */
const AvatarImage = React.forwardRef<
    HTMLImageElement,
    React.ImgHTMLAttributes<HTMLImageElement> & { size?: number }
>(({ className, src, onError, onLoad, size = 40, alt = "", ...props }, ref) => {
    const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
        src && !hasFailedImageUrl(src as string) ? 'loading' : 'error'
    );

    // Reset status when src changes
    React.useEffect(() => {
        setStatus(src && !hasFailedImageUrl(src as string) ? 'loading' : 'error');
    }, [src]);

    if (status === 'error' || !src) return null;

    return (
        <Image
            ref={ref}
            src={src as string}
            alt={alt}
            width={size}
            height={size}
            unoptimized
            loading="lazy"
            className={cn("aspect-square h-full w-full object-cover", className)}
            onLoad={(e) => {
                clearFailedImageUrl(src as string);
                setStatus('loaded');
                onLoad?.(e as unknown as React.SyntheticEvent<HTMLImageElement>);
            }}
            onError={(e) => {
                markFailedImageUrl(src as string);
                setStatus('error');
                onError?.(e as unknown as React.SyntheticEvent<HTMLImageElement>);
            }}
            {...(props as Record<string, unknown>)}
        />
    );
})
AvatarImage.displayName = "AvatarImage"

/**
 * Deterministic HSL color from a string.
 * Why: Gives each user a unique, consistent avatar color
 * without relying on external services.
 */
function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
}

const AvatarFallback = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { colorSeed?: string }
>(({ className, colorSeed, style, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "flex h-full w-full items-center justify-center rounded-full text-white font-medium",
            className
        )}
        style={{
            backgroundColor: colorSeed ? stringToColor(colorSeed) : '#64748b',
            ...style,
        }}
        {...props}
    />
))
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
