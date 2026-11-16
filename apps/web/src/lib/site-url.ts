import { routing, localePrefix, hrefNoIdioma, type Locale } from '@/i18n/routing';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://bipfix.com';

// Idioma do SITE para quem recebe (profiles.idioma ou o idioma da tela):
// o proprio idioma se o site tem; "pt..." generico -> Brasil; resto -> ingles.
export function idiomaDoSite(idioma?: string | null): Locale {
  const v = (idioma || '').trim();
  const exato = (routing.locales as readonly string[]).find((l) => l.toLowerCase() === v.toLowerCase());
  if (exato) return exato as Locale;
  if (!v || v.toLowerCase().startsWith('pt')) return 'pt';
  return 'en';
}

// Endereco do site no idioma de quem recebe, para links de e-mail e
// WhatsApp: https://bipfix.com/ee/et, https://bipfix.com/br/pt...
export function siteNoIdioma(idioma?: string | null): string {
  return `${SITE_URL}${localePrefix(idiomaDoSite(idioma))}`;
}

// URL completa de um caminho interno no idioma de quem recebe, com o nome
// traduzido da pagina: urlNoIdioma('et', '/emergencia/acidente/x')
// -> https://bipfix.com/ee/et/avarii/teade/x
export function urlNoIdioma(idioma: string | null | undefined, interno: string): string {
  return `${SITE_URL}${hrefNoIdioma(idiomaDoSite(idioma), interno)}`;
}

// Link de e-mail sem nome de pagina em portugues para as areas logadas das
// pecas (/loja/..., /oficina/pecas...): bipfix.com/v/<base64url>?o=<idioma>,
// resolvido por app/v/[c]/route.ts.
export function linkNeutroPecas(idioma: string | null | undefined, interno: string): string {
  return `${SITE_URL.replace('://www.', '://')}/v/${Buffer.from(interno, 'utf8').toString('base64url')}?o=${encodeURIComponent(idiomaDoSite(idioma))}`;
}
