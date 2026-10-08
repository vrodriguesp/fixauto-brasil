import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing, LOCALE_PREFIX, HREFLANG, X_DEFAULT_LOCALE, caminhoLocal, hrefNoIdioma, type Locale } from '@/i18n/routing';
import { COOKIE_IDIOMA } from '@/lib/idioma-escolhido';

// O refresh token do Supabase renova a sessao silenciosamente pra sempre -
// sem isso, um admin que loga uma vez fica autenticado por dias/semanas,
// mesmo sem usar o painel. Painel administrativo exige reautenticacao
// periodica independente de atividade (nao é so timeout por inatividade).
const ADMIN_MAX_SESSION_HOURS = 8;

const intlMiddleware = createIntlMiddleware(routing);

// Todo idioma tem prefixo na URL (/pt-br, /pt-pt, /en, /et, /it, /ru).
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
  return { prefix: '', path: pathname, locale: 'pt' };
}

const PREFIXOS_IDIOMA = Object.values(LOCALE_PREFIX);

// Primeiro trecho dos enderecos publicos da versao do Brasil antes de 30/09/2026
const CAMINHOS_ANTIGOS_BR = new Set([
  'para-oficinas', 'seja-parceiro', 'emergencia', 'oficinas', 'guias', 'termos', 'privacidade', 'docs',
  'login', 'cadastro', 'escolher-tipo', 'reset-password', 'definir-senha', 'cliente', 'oficina', 'loja',
]);

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Home internacional: 307 (temporario - depende de quem pede), nao cacheavel.
  if (pathname === '/') {
    // 301 fixo para a home da Estonia (mercado principal). Antes era 307 por
    // Accept-Language: com redirecionamento temporario Google e Yandex
    // guardavam "/" com o snippet antigo do Brasil, e um redirecionamento
    // que muda conforme o visitante parece "sneaky redirect" para o Bing.
    // Quem fala outra lingua ve a sugestao de idioma na pagina (SugestaoIdioma).
    return NextResponse.redirect(new URL(`${LOCALE_PREFIX.et}${req.nextUrl.search}`, req.url), 301);
  }

  // Painel admin nao tem idioma: /pt-br/admin/... (ou qualquer idioma) -> /admin/...
  const adminComIdioma = pathname.match(/^\/(?:pt-br|pt-pt|en|et|it|ru|pt|pt-PT)(\/admin(?:\/.*)?)$/);
  if (adminComIdioma) {
    return NextResponse.redirect(new URL(`${adminComIdioma[1]}${req.nextUrl.search}`, req.url), 308);
  }

  // Enderecos antigos da versao do Brasil (sem prefixo, ate 30/09/2026):
  // 301 permanente para /pt-br/... - preserva o que o Google ja indexou.
  // "/pt/..." (nome interno do idioma) tambem vai para /pt-br.
  const isAdminOrApiEarly = pathname.startsWith('/admin') || pathname.startsWith('/api');
  const temPrefixo = PREFIXOS_IDIOMA.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const imagemInterna = /^\/(pt|pt-PT)\/opengraph-image(\/|$)/.test(pathname);
  // So os caminhos que existiam na versao sem prefixo; qualquer outro vai
  // direto para o 404 (antes: 301 -> /pt-br/... -> 404, cadeia inutil).
  if (!isAdminOrApiEarly && !temPrefixo && !imagemInterna) {
    const resto = pathname === '/pt' ? '/' : pathname.startsWith('/pt/') ? pathname.slice(3) : pathname;
    const primeiro = resto.split('/')[1] || '';
    if (resto === '/' || CAMINHOS_ANTIGOS_BR.has(primeiro)) {
      return NextResponse.redirect(new URL(`${hrefNoIdioma('pt', resto)}${req.nextUrl.search}`, req.url), 301);
    }
    return NextResponse.rewrite(new URL(`/en/pagina-inexistente`, req.url), { status: 404 });
  }

  // Nome antigo (interno, em portugues) dentro de um idioma que tem nome
  // proprio para a pagina: /et/seja-parceiro -> /et/hakka-partneriks (301).
  if (temPrefixo && !imagemInterna) {
    const { prefix, path: resto, locale } = splitLocalePrefix(pathname);
    const traduzido = caminhoLocal(locale, resto);
    if (prefix && resto !== '/' && traduzido !== resto) {
      return NextResponse.redirect(new URL(`${prefix}${traduzido}${req.nextUrl.search}`, req.url), 301);
    }
  }

  // /admin e /api nunca tem prefixo de idioma - next-intl so cuida do
  // resto (matcher abaixo ja exclui essas rotas do intlMiddleware).
  // A imagem de compartilhamento (app/[locale]/opengraph-image.tsx) e anunciada
  // pelo Next com o nome INTERNO do idioma (/pt/opengraph-image,
  // /pt-PT/opengraph-image). O next-intl redirecionaria esses enderecos (pt nao
  // tem prefixo; pt-PT e /pt-pt) - e redes sociais e IAs nao seguem redirect de
  // imagem. Deixa passar direto para a rota, que existe para esses segmentos.
  if (/^\/(pt|pt-PT)\/opengraph-image(\/|$)/.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const isAdminOrApi = req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api');
  const intlRes = isAdminOrApi ? null : intlMiddleware(req);

  const rawPath = req.nextUrl.pathname;
  const { prefix: localePrefix, path, locale: pathLocale } = isAdminOrApi
    ? { prefix: '', path: rawPath, locale: 'pt' as Locale } // painel admin e em portugues
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
      // getAll/setAll (@supabase/ssr atual): le e grava TODOS os pedacos do
      // cookie de login juntos. A versao antiga (get/set por nome) deixava
      // pedacos do login anterior ao trocar de conta - o servidor lia um
      // login ja encerrado e mandava de volta para a tela de entrar.
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(lista, cabecalhos) {
          lista.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, { ...options, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
          );
          Object.entries(cabecalhos || {}).forEach(([k, v]) => res.headers.set(k, v));
        },
      },
    }
  );

  // getUser() valida o token no servidor de autenticacao (e renova a sessao);
  // getSession() so lia o cookie e aceitaria um token forjado (docs do Supabase).
  const { data: { user: usuario } } = await supabase.auth.getUser();

  // path.startsWith('/oficina') tambem casava com "/oficinas" (perfil publico
  // de oficina, sem login) - a pagina de SEO mais importante do site
  // redirecionando pro login antes mesmo de carregar. Precisa checar limite
  // de segmento (path === prefixo OU prefixo seguido de "/").
  const isUnderPath = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const isProtected = isUnderPath('/cliente') || isUnderPath('/oficina') || isUnderPath('/admin') || isUnderPath('/loja');
  const isAuthPage = path === '/login' || path === '/cadastro' || path === '/escolher-tipo';

  // /admin nao tem idioma: o login dele e o da versao em portugues
  const withLocale = (target: string) => new URL(`${localePrefix || LOCALE_PREFIX.pt}${target}`, req.url);

  if (isProtected && !usuario) {
    return NextResponse.redirect(withLocale('/login'));
  }

  if (isProtected && usuario) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tipo, ativo')
      .eq('id', usuario.id)
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
      const lastSignIn = usuario.last_sign_in_at ? new Date(usuario.last_sign_in_at).getTime() : 0;
      const hoursSinceSignIn = (Date.now() - lastSignIn) / (1000 * 60 * 60);
      if (!lastSignIn || hoursSinceSignIn > ADMIN_MAX_SESSION_HOURS) {
        await supabase.auth.signOut({ scope: 'local' });
        return NextResponse.redirect(withLocale('/login?sessao_expirada=1'));
      }
    }

    // Loja route protection: verify user tipo is 'loja_pecas'
    if (isUnderPath('/loja') && (!profile || profile.tipo !== 'loja_pecas')) {
      return NextResponse.redirect(withLocale('/'));
    }
  }

  if (isAuthPage && usuario) {
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
