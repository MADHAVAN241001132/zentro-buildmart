/**
 * Locale rules shared by server and client code. Pure: no Next.js imports.
 */

export const LOCALES = ['en', 'ta'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
/** Persistent preference. Not sensitive, so it is readable by the browser for the language switcher. */
export const LOCALE_COOKIE = 'zb_lang';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** The stored value when it is a supported locale, otherwise English. */
export function normaliseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Value for the document's lang attribute (BCP 47). */
export function htmlLang(locale: Locale): string {
  return locale === 'ta' ? 'ta-IN' : 'en-IN';
}

/**
 * Locale used for Intl formatting. Numbers stay in Western digits with Indian grouping in both languages,
 * so amounts read the same in English and Tamil. Only words and dates change.
 */
export function intlLocale(locale: Locale): string {
  return locale === 'ta' ? 'ta-IN' : 'en-IN';
}

/**
 * A safe in-site path for redirects after a language change. Only same-site absolute paths are kept,
 * so the route cannot be used as an open redirect.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value || value.length > 500) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  return value;
}
