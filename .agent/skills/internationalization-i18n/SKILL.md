---
name: internationalization-i18n
description: Master internationalization with next-intl, translations, RTL support, and locale management. Use when adding multi-language support to applications.
---

# Internationalization (i18n) Patterns

Expert guide for building multi-language web applications with Next.js.

## When to Use This Skill

- Adding multi-language support
- Setting up translation workflows
- Implementing RTL layouts
- Handling date/number formatting
- Managing locale switching

## Setup with next-intl

```bash
npm install next-intl
```

```typescript
// i18n.ts
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`./messages/${locale}.json`)).default,
}));

// middleware.ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'es', 'fr', 'ar'],
  defaultLocale: 'en',
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
```

## Translation Files

```json
// messages/en.json
{
  "common": {
    "welcome": "Welcome, {name}!",
    "items": "{count, plural, =0 {No items} one {# item} other {# items}}"
  },
  "nav": {
    "home": "Home",
    "settings": "Settings"
  }
}

// messages/es.json
{
  "common": {
    "welcome": "¡Bienvenido, {name}!",
    "items": "{count, plural, =0 {Sin elementos} one {# elemento} other {# elementos}}"
  }
}
```

## Using Translations

```tsx
// Server Component
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('common');
  
  return (
    <div>
      <h1>{t('welcome', { name: 'User' })}</h1>
      <p>{t('items', { count: 5 })}</p>
    </div>
  );
}

// Client Component
'use client';
import { useTranslations } from 'next-intl';

export function ClientComponent() {
  const t = useTranslations('nav');
  return <nav>{t('home')}</nav>;
}
```

## Date/Number Formatting

```tsx
import { useFormatter } from 'next-intl';

function FormattedContent() {
  const format = useFormatter();

  return (
    <div>
      <p>{format.dateTime(new Date(), { dateStyle: 'full' })}</p>
      <p>{format.number(1234.56, { style: 'currency', currency: 'USD' })}</p>
      <p>{format.relativeTime(new Date('2024-01-01'))}</p>
    </div>
  );
}
```

## Language Switcher

```tsx
'use client';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: string) => {
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.push(newPath);
  };

  return (
    <select value={locale} onChange={(e) => switchLocale(e.target.value)}>
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
}
```

## RTL Support

```tsx
// app/[locale]/layout.tsx
import { getLocale } from 'next-intl/server';

const RTL_LOCALES = ['ar', 'he', 'fa'];

export default async function Layout({ children }) {
  const locale = await getLocale();
  const dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className={dir === 'rtl' ? 'font-arabic' : ''}>{children}</body>
    </html>
  );
}
```

```css
/* RTL-aware spacing */
.card {
  margin-inline-start: 1rem; /* Works for both LTR and RTL */
  padding-inline-end: 0.5rem;
}

/* Direction-specific styles */
[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);
}
```

## SEO with hreflang

```tsx
// app/[locale]/layout.tsx
export async function generateMetadata({ params }) {
  return {
    alternates: {
      languages: {
        en: '/en',
        es: '/es',
        'x-default': '/en',
      },
    },
  };
}
```

## Best Practices

1. **Externalize all strings** - No hardcoded text
2. **Use ICU syntax** - For plurals and formatting
3. **Logical properties** - `margin-inline-start` over `margin-left`
4. **Test all locales** - Especially RTL languages
5. **Consider text expansion** - German text is ~30% longer
6. **Use locale-aware formatting** - Dates, numbers, currencies
