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
  const isProtected = path.startsWith('/cliente') || path.startsWith('/oficina') || path.startsWith('/admin') || path.startsWith('/loja');
  const isAuthPage = path === '/login' || path === '/cadastro' || path === '/escolher-tipo';

  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isProtected && session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo, ativo')
      .eq('id', session.user.id)
      .single();

    // Deactivated accounts (admin action) can't use any protected area
    if (profile && profile.ativo === false) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL('/login?desativado=1', req.url));
    }

    // Admin route protection: verify user tipo is 'admin'
    if (path.startsWith('/admin') && (!profile || profile.tipo !== 'admin')) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // Loja route protection: verify user tipo is 'loja_pecas'
    if (path.startsWith('/loja') && (!profile || profile.tipo !== 'loja_pecas')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/cliente/:path*', '/oficina/:path*', '/admin/:path*', '/loja/:path*', '/login', '/cadastro', '/escolher-tipo'],
};
