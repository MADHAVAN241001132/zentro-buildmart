import { en, type MessageKey } from './messages/en';
import { ta } from './messages/ta';
import { intlLocale, type Locale } from './locales';

export type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Locale, Partial<Record<MessageKey, string>>> = { en, ta };

/** Substitutes {name} placeholders. Unknown placeholders are left visible so gaps are easy to spot. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * The message for a key in a locale. A missing Tamil entry falls back to English. A key missing from
 * English as well is returned as the key itself, so the gap is visible.
 */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const message = DICTIONARIES[locale][key] ?? en[key] ?? key;
  return interpolate(message, vars);
}

/** A translator bound to one locale. Works in server and client components alike. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, vars?: Vars) => translate(locale, key, vars);
}

/** Keys with no Tamil entry. Used by tests and the admin readiness check. */
export function missingTamilKeys(): MessageKey[] {
  return (Object.keys(en) as MessageKey[]).filter((key) => !ta[key]);
}

/** Rupee amount from paise. Digits stay Western with Indian grouping in both languages. */
export function formatRupees(paise: number, locale: Locale): string {
  const rupees = paise / 100;
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: 'latn',
  }).format(rupees);
  return `₹${formatted}`;
}

/** Calendar date for display, in the store's time zone. */
export function formatDate(value: Date | string, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
    numberingSystem: 'latn',
  }).format(date);
}
