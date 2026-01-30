---
name: tailwind-glassmorphism-ui
description: Expert guide for creating premium glassmorphism UI components with Tailwind CSS. Covers backdrop blur, translucency strategies, border subtlety, and dark mode optimizations.
---

# Tailwind Glassmorphism UI Skill

This skill provides the design tokens and implementation patterns for the "Glassmorphism" aesthetic. Use this whenever creating new UI components to ensure consistency.

## Core Design Tokens

The "Glass" look relies on 3 key properties:
1.  **Translucency**: Low opacity backgrounds.
2.  **Blur**: `backdrop-blur` to diffuse the background.
3.  **Border**: Subtle, semi-transparent borders to define edges.

### Standard Glass Classes
Use these combinations for different "elevations" of glass.

**1. Base Glass (Cards, Panels)**
```html
<div class="bg-white/10 dark:bg-black/20 backdrop-blur-md border border-white/20 shadow-xl rounded-2xl">
  <!-- Content -->
</div>
```

**2. Heavy Glass (Modals, Overlays)**
```html
<div class="bg-white/30 dark:bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-3xl">
  <!-- Content -->
</div>
```

**3. Interactive Glass (Buttons, Inputs)**
```html
<button class="bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm border border-white/30 transition-all duration-200 rounded-lg px-4 py-2 text-white">
  Click Me
</button>
```

## Component Patterns

### Glass Card
```tsx
export const GlassCard = ({ children, className = "" }) => (
  <div className={`
    relative overflow-hidden
    bg-white/5 dark:bg-slate-900/40
    backdrop-blur-md
    border border-white/10 dark:border-white/5
    shadow-[0_8px_32px_0_rgba(31,38,135,0.07)]
    rounded-2xl
    p-6
    ${className}
  `}>
    {children}
  </div>
);
```

### Glass Header/Navbar
Fixed headers should heavily utilize blur to allow content to scroll underneath beautifully.
```tsx
<header class="fixed top-0 w-full z-50 bg-white/70 dark:bg-slate-950/70 backdrop-blur-lg border-b border-black/5 dark:border-white/5">
  <!-- Nav Content -->
</header>
```

## Typography & Contrast
Glass backgrounds can be noisy. Ensure text remains legible.
- **Headings**: Use `text-slate-900 dark:text-white` for max contrast.
- **Body**: Use `text-slate-600 dark:text-slate-300` for secondary text.
- **Vibrancy**: Avoid pure greys on glass; use slate or zinc to pick up a bit of blue/temperature.

## Tailwind 4 Configuration
Ensure your `theme` configuration allows for these opacity modifiers if not using the default palette.
(In v4, opacity modifiers `/10` work out of the box with standard simplified colors).

## Implementation Checklist
- [ ] Is `backdrop-blur` applied? (sm, md, lg, xl)
- [ ] Is there a subtle 1px border (`border-white/10`)?
- [ ] Is there a shadow to lift it off the background?
- [ ] Does it have a hover state if interactive?
- [ ] Is text contrast sufficient against a variable background?
