---
name: accessibility-a11y-patterns
description: Master web accessibility with WCAG compliance, ARIA patterns, keyboard navigation, and screen reader support. Use when auditing or improving accessibility.
---

# Accessibility (A11y) Patterns

Expert guide for building accessible web applications following WCAG 2.1 standards.

## When to Use This Skill

- Auditing applications for accessibility
- Implementing keyboard navigation
- Adding screen reader support
- Fixing accessibility violations
- Building accessible custom components

## WCAG Quick Reference

| Level | Requirement | Example |
|-------|-------------|---------|
| A | Minimum | Alt text, keyboard access |
| AA | Standard (target) | Color contrast 4.5:1, focus visible |
| AAA | Enhanced | Contrast 7:1, sign language |

## Semantic HTML

```tsx
// ❌ Bad: Div soup
<div class="header">
  <div class="nav">
    <div onClick={navigate}>Home</div>
  </div>
</div>

// ✅ Good: Semantic elements
<header>
  <nav aria-label="Main">
    <a href="/">Home</a>
  </nav>
</header>
```

## ARIA Patterns

```tsx
// Accessible button with loading state
function Button({ loading, children, ...props }) {
  return (
    <button
      aria-busy={loading}
      aria-disabled={loading}
      {...props}
    >
      {loading ? <Spinner aria-hidden="true" /> : null}
      <span className={loading ? 'sr-only' : undefined}>{children}</span>
      {loading ? 'Loading...' : null}
    </button>
  );
}

// Accessible modal
function Modal({ isOpen, onClose, title, children }) {
  return (
    <dialog
      open={isOpen}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose} aria-label="Close modal">×</button>
    </dialog>
  );
}
```

## Keyboard Navigation

```tsx
// hooks/use-keyboard-nav.ts
export function useKeyboardNav(items: string[], onSelect: (id: string) => void) {
  const [focusIndex, setFocusIndex] = useState(0);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(items[focusIndex]);
        break;
      case 'Home':
        setFocusIndex(0);
        break;
      case 'End':
        setFocusIndex(items.length - 1);
        break;
    }
  };

  return { focusIndex, handleKeyDown };
}
```

## Focus Management

```tsx
// Focus trap for modals
export function useFocusTrap(ref: RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusable = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    first?.focus();
    element.addEventListener('keydown', handleTab);
    return () => element.removeEventListener('keydown', handleTab);
  }, [isActive, ref]);
}
```

## Screen Reader Utilities

```css
/* Visually hidden but accessible */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

```tsx
// Live region for announcements
function Announcer() {
  const [message, setMessage] = useState('');
  
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
```

## Color Contrast

```typescript
// lib/a11y/contrast.ts
export function getContrastRatio(color1: string, color2: string): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWCAG(ratio: number, level: 'AA' | 'AAA', isLarge = false): boolean {
  if (level === 'AAA') return ratio >= (isLarge ? 4.5 : 7);
  return ratio >= (isLarge ? 3 : 4.5); // AA
}
```

## Testing with axe-core

```typescript
// tests/a11y.test.ts
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('should have no violations', async () => {
    const { container } = render(<MyComponent />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

## Best Practices

1. **Use semantic HTML** - Choose appropriate elements
2. **Provide alt text** - Descriptive for content, empty for decorative
3. **Ensure keyboard access** - All interactions via keyboard
4. **Maintain focus order** - Logical tab sequence
5. **Test with screen readers** - NVDA, VoiceOver, JAWS
6. **Check color contrast** - Use tools like WebAIM
