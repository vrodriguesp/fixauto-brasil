// Idioma escolhido EXPLICITAMENTE pela pessoa (seletor, rodape, aviso de
// sugestao). O middleware usa so na home ("/"): se existe, manda para a
// home desse idioma; se nao, decide pelo idioma do navegador. Links diretos
// para outras paginas nunca sao redirecionados.
export const COOKIE_IDIOMA = 'bipfix_idioma';

export function lembrarIdioma(locale: string) {
  try {
    const seguro = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${COOKIE_IDIOMA}=${encodeURIComponent(locale)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${seguro}`;
  } catch {}
}
