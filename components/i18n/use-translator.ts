'use client';

import { createContext, useContext } from 'react';
import { createTranslator } from '@/lib/i18n/translate';
import type { Locale } from '@/lib/i18n/locales';
import type { MessageKey } from '@/lib/i18n/messages/en';

/** Client components read the locale from a provider set by the layout. English when none is provided. */
export const LocaleContext = createContext<Locale>('en');

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useTranslator() {
  const locale = useLocale();
  return createTranslator(locale) as (key: MessageKey, vars?: Record<string, string | number>) => string;
}
