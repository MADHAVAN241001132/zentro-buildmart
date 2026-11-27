import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes Supabase auth cookies and guards the owner and admin portals.
 * Route-level checks in the layouts remain the authority; this is an early redirect.
 * Wrapped completely in try/catch to guarantee zero 500 Internal Server Errors from middleware.
 */
export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return response;

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    const isOwner = (path === '/owner' || path.startsWith('/owner/')) && !path.startsWith('/owner/login');
    const isAdmin = (path === '/admin' || path.startsWith('/admin/')) && !path.startsWith('/admin/login');

    if ((isOwner || isAdmin) && !data?.user) {
      const loginPath = isAdmin ? '/admin/login' : '/owner/login';
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = loginPath;
      redirectUrl.search = '';
      const redirect = NextResponse.redirect(redirectUrl);
      response.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value);
      });
      return redirect;
    }

    return response;
  } catch (err) {
    console.error('Middleware execution error caught gracefully:', err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: ['/owner/:path*', '/admin/:path*'],
};
