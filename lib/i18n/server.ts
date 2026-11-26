import 'server-only';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normaliseLocale, type Locale } from '@/lib/i18n/locales';

/** The guest's chosen language, from the persistent cookie. English when none is set. */
export async function currentLocale(): Promise<Locale> {
  const jar = await cookies();
  return normaliseLocale(jar.get(LOCALE_COOKIE)?.value);
}
