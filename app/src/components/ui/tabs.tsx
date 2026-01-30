"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
    value: string
    onValueChange: (value: string) => void
} | null>(null)

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultValue?: string
    value?: string
    onValueChange?: (value: string) => void
}

function Tabs({
    defaultValue,
    value: controlledValue,
    onValueChange,
    className,
    ...props
}: TabsProps) {
    const [value, setValue] = React.useState(defaultValue || "")

    const handleValueChange = React.useCallback(
        (newValue: string) => {
            if (onValueChange) {
                onValueChange(newValue)
            } else {
                setValue(newValue)
            }
        },
        [onValueChange]
    )

    const currentValue = controlledValue !== undefined ? controlledValue : value

    return (
        <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
            <div className={cn("", className)} {...props} />
        </TabsContext.Provider>
    )
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> { }

function TabsList({ className, ...props }: TabsListProps) {
    return (
        <div
            className={cn(
                "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
                className
            )}
            {...props}
        />
    )
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    value: string
}

function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error("TabsTrigger must be used within Tabs")

    const isSelected = context.value === value

    return (
        <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => context.onValueChange(value)}
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                isSelected
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:bg-muted/50 hover:text-foreground",
                className
            )}
            {...props}
        />
    )
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string
}

function TabsContent({ className, value, ...props }: TabsContentProps) {
    const context = React.useContext(TabsContext)
    if (!context) throw new Error("TabsContent must be used within Tabs")

    if (context.value !== value) return null

    return (
        <div
            role="tabpanel"
            className={cn(
                "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                className
            )}
            {...props}
        />
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
