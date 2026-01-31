/**
 * Button component with variants using CVA
 * Supports primary (gradient), secondary, and ghost styles
 */

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
    // Base styles - includes press feedback animation (scale 97% on active)
    `inline-flex items-center justify-center gap-2 rounded-lg font-medium 
   transition-all duration-150 active:scale-[0.97] active:duration-[50ms]
   focus-visible:outline-none focus-visible:ring-2 
   focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50`,
    {
        variants: {
            variant: {
                primary: `bg-gradient text-white hover:shadow-lg hover:-translate-y-0.5 
                  focus-visible:ring-[var(--accent-gold)]`,
                secondary: `bg-[var(--bg-tertiary)] text-[var(--text-primary)] 
                    border border-[var(--border)] hover:border-[var(--accent-gold)]
                    focus-visible:ring-[var(--accent-gold)]`,
                ghost: `text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] 
                hover:text-[var(--text-primary)] focus-visible:ring-[var(--border)]`,
                danger: `bg-[var(--error)] text-white hover:opacity-90 
                 focus-visible:ring-[var(--error)]`,
            },
            size: {
                sm: 'h-8 px-3 text-sm',
                md: 'h-10 px-4 text-sm',
                lg: 'h-12 px-6 text-base',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md',
        },
    }
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
}

/**
 * Primary button component for actions throughout the app.
 * Uses gradient accent for primary variant.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, isLoading, children, disabled, type = 'button', ...props }, ref) => {
        return (
            <button
                ref={ref}
                type={type}
                className={cn(buttonVariants({ variant, size }), className)}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
