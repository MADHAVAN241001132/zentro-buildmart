'use client';

import type { ReactNode } from 'react';
import { LocaleContext } from '@/components/i18n/use-translator';
import type { Locale } from '@/lib/i18n/locales';

export function LocaleProvider({ locale, children }: { locale: Locale; children?: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
