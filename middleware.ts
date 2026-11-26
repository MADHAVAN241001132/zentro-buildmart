import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes Supabase auth cookies and guards the owner portal.
 * Route-level checks in the layouts remain the authority; this is an early redirect.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isOwner = path.startsWith('/owner/') && !path.startsWith('/owner/login');
  const isAdmin = path.startsWith('/admin/') && !path.startsWith('/admin/login');

  if ((isOwner || isAdmin) && !data.user) {
    const loginPath = isAdmin ? '/admin/login' : '/owner/login';
    const redirect = NextResponse.redirect(new URL(loginPath, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/owner/:path*', '/admin/:path*'],
};
