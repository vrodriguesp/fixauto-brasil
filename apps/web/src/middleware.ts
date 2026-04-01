import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '' });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const path = req.nextUrl.pathname;
  const isProtected = path.startsWith('/cliente') || path.startsWith('/oficina');
  const isAuthPage = path === '/login' || path === '/cadastro' || path === '/escolher-tipo';

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/cliente/:path*', '/oficina/:path*', '/login', '/cadastro', '/escolher-tipo'],
};
