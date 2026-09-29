import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing, LOCALE_PREFIX, HREFLANG, type Locale } from '@/i18n/routing';

// O refresh token do Supabase renova a sessao silenciosamente pra sempre -
// sem isso, um admin que loga uma vez fica autenticado por dias/semanas,
// mesmo sem usar o painel. Painel administrativo exige reautenticacao
// periodica independente de atividade (nao é so timeout por inatividade).
const ADMIN_MAX_SESSION_HOURS = 8;

const intlMiddleware = createIntlMiddleware(routing);

// "pt" (Brasil) nao tem prefixo na URL; os outros tem (/pt-pt, /en, /et, /it).
// Separa o prefixo do resto do path pra comparar rotas protegidas independente
// do idioma, e pra poder remontar redirects preservando o idioma atual.
const PREFIX_TO_LOCALE: [string, Locale][] = (Object.entries(LOCALE_PREFIX) as [Locale, string][])
  .filter(([, p]) => p)
  .map(([l, p]) => [p, l]);

function splitLocalePrefix(pathname: string): { prefix: string; path: string; locale: Locale } {
  for (const [prefix, locale] of PREFIX_TO_LOCALE) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { prefix, path: pathname.slice(prefix.length) || '/', locale };
    }
  }
  return { prefix: '', path: pathname, locale: routing.defaultLocale };
}

export async function middleware(req: NextRequest) {
  // /admin e /api nunca tem prefixo de idioma - next-intl so cuida do
  // resto (matcher abaixo ja exclui essas rotas do intlMiddleware).
  const isAdminOrApi = req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api');
  const intlRes = isAdminOrApi ? null : intlMiddleware(req);

  const rawPath = req.nextUrl.pathname;
  const { prefix: localePrefix, path, locale: pathLocale } = isAdminOrApi
    ? { prefix: '', path: rawPath, locale: routing.defaultLocale }
    : splitLocalePrefix(rawPath);

  // Repassa o idioma resolvido pro layout raiz via header de REQUISICAO
  // (headers() no server component so le headers de request, nao de
  // response) - precisa reconstruir a response com os headers novos,
  // preservando os cookies que o next-intl ja tenha setado (ex: NEXT_LOCALE).
  const htmlLang = HREFLANG[pathLocale];

  let res: NextResponse;
  if (intlRes && !intlRes.headers.get('location')) {
    // next-intl faz um rewrite interno (locale "pt" sem prefixo -> internamente
    // /pt/...) via header "x-middleware-rewrite". Reconstruir a response do
    // zero aqui perderia esse rewrite (a pagina real vive em /[locale]/*,
    // entao "/" sem rewrite vira 404) - precisa copiar esse header especifico
    // pra cima da nossa response, que carrega o x-locale-html.
    const forwardedHeaders = new Headers(req.headers);
    forwardedHeaders.set('x-locale-html', htmlLang);
    res = NextResponse.next({ request: { headers: forwardedHeaders } });
    const rewrite = intlRes.headers.get('x-middleware-rewrite');
    if (rewrite) res.headers.set('x-middleware-rewrite', rewrite);
    intlRes.cookies.getAll().forEach((c) => res.cookies.set(c));
    // Bing usa o Content-Language (mais que hreflang) para saber o idioma da
    // pagina; o Google usa hreflang + <html lang>. Mandar os tres.
    res.headers.set('Content-Language', htmlLang);
  } else if (intlRes) {
    res = intlRes; // redirect do proprio next-intl (ex: "/" -> "/et" na 1a visita)
  } else {
    const forwardedHeaders = new Headers(req.headers);
    forwardedHeaders.set('x-locale-html', htmlLang);
    res = NextResponse.next({ request: { headers: forwardedHeaders } });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // path.startsWith('/oficina') tambem casava com "/oficinas" (perfil publico
  // de oficina, sem login) - a pagina de SEO mais importante do site
  // redirecionando pro login antes mesmo de carregar. Precisa checar limite
  // de segmento (path === prefixo OU prefixo seguido de "/").
  const isUnderPath = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const isProtected = isUnderPath('/cliente') || isUnderPath('/oficina') || isUnderPath('/admin') || isUnderPath('/loja');
  const isAuthPage = path === '/login' || path === '/cadastro' || path === '/escolher-tipo';

  const withLocale = (target: string) => new URL(`${localePrefix}${target}`, req.url);

  if (isProtected && !session) {
    return NextResponse.redirect(withLocale('/login'));
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
      return NextResponse.redirect(withLocale('/login?desativado=1'));
    }

    // Admin route protection: verify user tipo is 'admin'
    if (isUnderPath('/admin') && (!profile || profile.tipo !== 'admin')) {
      return NextResponse.redirect(new URL('/', req.url));
    }

    // Admin exige reautenticacao periodica - o refresh token do Supabase
    // renovaria a sessao silenciosamente por tempo indefinido, o que nao
    // e aceitavel pra um painel administrativo (diferente de cliente/
    // oficina, onde ficar logado por dias e ate desejavel).
    if (isUnderPath('/admin') && profile?.tipo === 'admin') {
      const lastSignIn = session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : 0;
      const hoursSinceSignIn = (Date.now() - lastSignIn) / (1000 * 60 * 60);
      if (!lastSignIn || hoursSinceSignIn > ADMIN_MAX_SESSION_HOURS) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL('/login?sessao_expirada=1', req.url));
      }
    }

    // Loja route protection: verify user tipo is 'loja_pecas'
    if (isUnderPath('/loja') && (!profile || profile.tipo !== 'loja_pecas')) {
      return NextResponse.redirect(withLocale('/'));
    }
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(withLocale('/'));
  }

  return res;
}

export const config = {
  matcher: [
    // tudo, exceto arquivos estaticos/internos do Next e a pasta /api
    '/((?!api|_next|_vercel|.*\\..*).*)',
  ],
};
