"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
        if (open) {
            document.body.style.overflow = "hidden"
        } else {
            document.body.style.overflow = ""
        }
        return () => {
            document.body.style.overflow = ""
        }
    }, [open])

    if (!mounted) return null
    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={() => onOpenChange(false)}
            />
            {/* Dialog Content Wrapper - handles positioning */}
            <div className="relative z-50 w-full max-w-lg p-4 animate-scale-in">
                {children}
            </div>
        </div>,
        document.body
    )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
}

export function DialogContent({ className, children, ...props }: DialogContentProps) {
    return (
        <div
            className={cn(
                "w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> { }

export function DialogHeader({ className, children, ...props }: DialogHeaderProps) {
    return (
        <div
            className={cn(
                "flex flex-col space-y-1.5 p-6 pb-4",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> { }

export function DialogTitle({ className, children, ...props }: DialogTitleProps) {
    return (
        <h2
            className={cn(
                "text-xl font-semibold leading-none tracking-tight",
                className
            )}
            {...props}
        >
            {children}
        </h2>
    )
}

interface DialogDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> { }

export function DialogDescription({ className, children, ...props }: DialogDescriptionProps) {
    return (
        <p
            className={cn("text-sm text-[var(--text-muted)] mt-1.5", className)}
            {...props}
        >
            {children}
        </p>
    )
}

interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    onClose?: () => void
}

export function DialogClose({ className, onClose, ...props }: DialogCloseProps) {
    return (
        <button
            onClick={onClose}
            className={cn(
                "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none data-[state=open]:bg-slate-100 dark:data-[state=open]:bg-slate-800",
                className
            )}
            {...props}
        >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
        </button>
    )
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> { }

export function DialogFooter({ className, children, ...props }: DialogFooterProps) {
    return (
        <div
            className={cn(
                "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}
