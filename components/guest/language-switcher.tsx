'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useTranslator } from '@/components/i18n/use-translator';
import type { Locale } from '@/lib/i18n/locales';

/** English / தமிழ் switcher: compact dropdown on mobile, inline links on desktop. */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const t = useTranslator();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const here = `${pathname}${query ? `?${query}` : ''}`;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const options: { lang: Locale; label: string; short: string }[] = [
    { lang: 'en', label: t('lang.english'), short: 'EN' },
    { lang: 'ta', label: t('lang.tamil'), short: 'தமிழ்' },
  ];

  const activeOption = options.find((o) => o.lang === current) ?? options[0]!;

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Mobile compact dropdown */}
      <div ref={wrapRef} className="relative md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t('lang.label')}
          className="inline-flex min-h-[38px] items-center gap-1 rounded-control border border-gold/50 bg-white/90 px-2 py-1 text-xs font-semibold text-burgundy shadow-xs transition hover:border-burgundy"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
          <span>{activeOption.short}</span>
          <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>

        {open ? (
          <div
            role="menu"
            aria-label={t('lang.label')}
            className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-card border border-gold/60 bg-cream py-1 shadow-hover"
          >
            {options.map((option) => {
              const active = option.lang === current;
              return (
                <a
                  key={option.lang}
                  role="menuitem"
                  href={`/api/locale?lang=${option.lang}&next=${encodeURIComponent(here)}`}
                  lang={option.lang === 'ta' ? 'ta-IN' : 'en-IN'}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-[40px] items-center justify-between px-3 py-2 text-xs font-semibold transition ${
                    active ? 'bg-burgundy text-cream' : 'text-ink hover:bg-gold/15'
                  }`}
                >
                  <span>{option.label}</span>
                  {active ? <Check className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden /> : null}
                </a>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Desktop inline links (unchanged) */}
      <nav aria-label={t('lang.label')} className="hidden items-center gap-1 text-xs font-semibold md:flex">
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
    </>
  );
}
