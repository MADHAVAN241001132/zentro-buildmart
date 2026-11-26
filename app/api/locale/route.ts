import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, safeNextPath } from '@/lib/i18n/locales';

/**
 * Sets the language preference and returns the guest to the page they were on. A plain link, so it
 * works without scripts. Only supported locales are stored, and only same-site paths are followed.
 */
export function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang');
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));
  const destination = new URL(next, request.nextUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });
  if (isLocale(lang)) {
    response.cookies.set(LOCALE_COOKIE, lang, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
  }
  return response;
}
