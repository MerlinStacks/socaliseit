"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
// Utilizing standard lucide-react which is available
import { ChevronDown, Check } from "lucide-react"

type SelectContextValue = {
    value: string
    onValueChange: (value: string) => void
    open: boolean
    setOpen: (open: boolean) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

const Select = ({
    children,
    value,
    onValueChange,
    open: openProp,
    onOpenChange,
}: {
    children: React.ReactNode
    value: string
    onValueChange: (value: string) => void
    open?: boolean
    onOpenChange?: (open: boolean) => void
}) => {
    const [openState, setOpenState] = React.useState(false)
    const open = openProp ?? openState
    const setOpen = onOpenChange ?? setOpenState

    return (
        <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
            <div className="relative">{children}</div>
        </SelectContext.Provider>
    )
}

const SelectTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
    const context = React.useContext(SelectContext)
    if (!context) throw new Error("SelectTrigger must be used within Select")

    return (
        <button
            ref={ref}
            type="button"
            onClick={() => context.setOpen(!context.open)}
            className={cn(
                "flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus:ring-slate-300",
                className
            )}
            {...props}
        >
            {children}
            <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
    )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef<
    HTMLSpanElement,
    React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string }
>(({ className, placeholder, ...props }, ref) => {
    const context = React.useContext(SelectContext)
    if (!context) throw new Error("SelectValue must be used within Select")

    // Fallback: Display value if no smarter way to show label without children introspection
    return (
        <span
            ref={ref}
            className={cn("block truncate", className)}
            {...props}
        >
            {context.value || placeholder}
        </span>
    )
})
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { position?: "item-aligned" | "popper" }
>(({ className, children, position = "popper", ...props }, ref) => {
    const context = React.useContext(SelectContext)
    if (!context) throw new Error("SelectContent must be used within Select")

    if (!context.open) return null

    return (
        <div
            ref={ref}
            className={cn(
                "absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-md animate-in fade-in-80 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50",
                position === "popper" && "translate-y-1",
                className
            )}
            {...props}
        >
            <div className="p-1">{children}</div>
        </div>
    )
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, value, ...props }, ref) => {
    const context = React.useContext(SelectContext)
    if (!context) throw new Error("SelectItem must be used within Select")

    return (
        <div
            ref={ref}
            className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-slate-100 focus:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-slate-100 dark:hover:bg-slate-800 dark:focus:bg-slate-800 dark:focus:text-slate-50",
                className
            )}
            onClick={() => {
                context.onValueChange(value)
                context.setOpen(false)
            }}
            {...props}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {context.value === value && (
                    <Check className="h-4 w-4" />
                )}
            </span>
            <span className="truncate">{children}</span>
        </div>
    )
})
SelectItem.displayName = "SelectItem"

const SelectGroup = React.forwardRef<
    HTMLDivElement, React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
))
SelectGroup.displayName = "SelectGroup"

const SelectLabel = React.forwardRef<
    HTMLDivElement, React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold", className)} {...props} />
))
SelectLabel.displayName = "SelectLabel"

const SelectSeparator = React.forwardRef<
    HTMLDivElement, React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800", className)} {...props} />
))
SelectSeparator.displayName = "SelectSeparator"


export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
}
