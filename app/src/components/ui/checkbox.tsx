'use client';

import * as React from 'react';

/**
 * Checkbox Component
 * A simple checkbox for selection state
 */

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

export function Checkbox({
    checked,
    onCheckedChange,
    className = '',
    id,
    ...props
}: CheckboxProps) {
    return (
        <input
            type="checkbox"
            id={id}
            checked={checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            className={`h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer ${className}`}
            {...props}
        />
    );
}
