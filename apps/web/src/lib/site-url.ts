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
// WhatsApp: https://bipfix.com/et, https://bipfix.com/pt-br...
export function siteNoIdioma(idioma?: string | null): string {
  return `${SITE_URL}${localePrefix(idiomaDoSite(idioma))}`;
}

// URL completa de um caminho interno no idioma de quem recebe, com o nome
// traduzido da pagina: urlNoIdioma('et', '/emergencia/acidente/x')
// -> https://bipfix.com/et/avarii/teade/x
export function urlNoIdioma(idioma: string | null | undefined, interno: string): string {
  return `${SITE_URL}${hrefNoIdioma(idiomaDoSite(idioma), interno)}`;
}
