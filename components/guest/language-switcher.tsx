'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslator } from '@/components/i18n/use-translator';
import type { Locale } from '@/lib/i18n/locales';

/** English / தமிழ் toggle. Plain links to /api/locale, so it works before scripts load. */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const t = useTranslator();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const here = `${pathname}${query ? `?${query}` : ''}`;
  const options: { lang: Locale; label: string }[] = [
    { lang: 'en', label: t('lang.english') },
    { lang: 'ta', label: t('lang.tamil') },
  ];
  return (
    <nav aria-label={t('lang.label')} className="flex items-center gap-1 text-xs font-semibold">
      {options.map((option) => (
        <a
          key={option.lang}
          href={`/api/locale?lang=${option.lang}&next=${encodeURIComponent(here)}`}
          lang={option.lang === 'ta' ? 'ta-IN' : 'en-IN'}
          aria-current={option.lang === current ? 'true' : undefined}
          className={`rounded-control px-2 py-1 ${option.lang === current ? 'bg-burgundy text-cream' : 'text-ink hover:bg-card'}`}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}
