
import * as React from "react"
import { cn } from "@/lib/utils"

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
 * Why: Plain <img> renders a broken‐image box when src is empty or fails,
 * which sits on top of AvatarFallback and hides the initials.
 * This version tracks load state and hides itself on error or missing src.
 */
const AvatarImage = React.forwardRef<
    HTMLImageElement,
    React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, onError, onLoad, ...props }, ref) => {
    const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
        src ? 'loading' : 'error'
    );

    // Reset status when src changes
    React.useEffect(() => {
        setStatus(src ? 'loading' : 'error');
    }, [src]);

    if (status === 'error' || !src) return null;

    return (
        <img
            ref={ref}
            src={src}
            className={cn("aspect-square h-full w-full object-cover", className)}
            onLoad={(e) => {
                setStatus('loaded');
                onLoad?.(e);
            }}
            onError={(e) => {
                setStatus('error');
                onError?.(e);
            }}
            {...props}
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
