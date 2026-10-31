// Idioma escolhido EXPLICITAMENTE pela pessoa (seletor, rodape, aviso de
// sugestao). O middleware usa so na home ("/"): se existe, manda para a
// home desse idioma; se nao, decide pelo idioma do navegador. Links diretos
// para outras paginas nunca sao redirecionados.
import { supabase } from '@/lib/supabase';

export const COOKIE_IDIOMA = 'bipfix_idioma';

// Logado: a escolha explicita tambem vira o idioma da conta (avisos e e-mails).
// So abrir uma pagina em outra lingua (link, anuncio) nao muda a conta -
// regra de Airbnb/Booking/Google, decisao do dono 31/10.
export function lembrarIdioma(locale: string) {
  supabase.auth.getSession().then(({ data }) => {
    const id = data.session?.user?.id;
    if (id) supabase.from('profiles').update({ idioma: locale }).eq('id', id).then(() => {});
  }).catch(() => {});
  try {
    const seguro = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${COOKIE_IDIOMA}=${encodeURIComponent(locale)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${seguro}`;
  } catch {}
}
