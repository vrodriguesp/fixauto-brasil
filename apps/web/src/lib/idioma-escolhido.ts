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

// Clique num link de idioma: troca a pagina SEM criar entrada nova no historico
// (teste do dono 07/11: "voltar" depois de trocar o idioma abria a mesma pagina
// no idioma anterior em vez da pagina anterior). O <a href> continua de verdade
// para buscadores; quem ja tratou o clique (pedido sem cadastro) nao e afetado.
export function irParaIdioma(ev: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void; currentTarget: EventTarget }, locale: string) {
  lembrarIdioma(locale);
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const href = (ev.currentTarget as HTMLAnchorElement).getAttribute?.('href');
  if (!href) return;
  ev.preventDefault();
  window.location.replace(href);
}
