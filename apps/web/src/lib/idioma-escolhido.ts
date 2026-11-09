// Idioma escolhido EXPLICITAMENTE pela pessoa (seletor, rodape, aviso de
// sugestao). O middleware usa so na home ("/"): se existe, manda para a
// home desse idioma; se nao, decide pelo idioma do navegador. Links diretos
// para outras paginas nunca sao redirecionados.
import { supabase } from '@/lib/supabase';
import { guardarParaTrocaDeIdioma } from '@/lib/rascunho-troca-idioma';

export const COOKIE_IDIOMA = 'bipfix_idioma';
/** Disparado antes de trocar a lingua; detail.esperar(promessa) adia a troca ate gravar. */
export const EVENTO_TROCA_IDIOMA = 'bipfix:antes-trocar-idioma';

// Logado: a escolha explicita tambem vira o idioma da conta (avisos e e-mails).
// So abrir uma pagina em outra lingua (link, anuncio) nao muda a conta -
// regra de Airbnb/Booking/Google, decisao do dono 31/10.
// Devolve a gravacao: quem troca de pagina espera por ela (antes a pagina recarregava antes de
// gravar e a conta ficava na lingua velha - avisos em italiano numa conta usada em ET, dono 08/11).
export function lembrarIdioma(locale: string): Promise<void> {
  const gravar = supabase.auth.getSession().then(async ({ data }) => {
    const id = data.session?.user?.id;
    if (id) await supabase.from('profiles').update({ idioma: locale }).eq('id', id);
  }).catch(() => {});
  try {
    const seguro = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${COOKIE_IDIOMA}=${encodeURIComponent(locale)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax${seguro}`;
  } catch {}
  return gravar;
}

// Clique num link de idioma: troca a pagina SEM criar entrada nova no historico
// (teste do dono 07/11: "voltar" depois de trocar o idioma abria a mesma pagina
// no idioma anterior em vez da pagina anterior). O <a href> continua de verdade
// para buscadores; quem ja tratou o clique (pedido sem cadastro) nao e afetado.
export function irParaIdioma(ev: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void; currentTarget: EventTarget }, locale: string) {
  const gravando = lembrarIdioma(locale);
  if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  const href = (ev.currentTarget as HTMLAnchorElement).getAttribute?.('href');
  if (!href) return;
  ev.preventDefault();
  // a mesma tela na outra lingua: mantem os parametros (?oficina=, ?vista=...) e o que foi digitado
  const destino = href.includes('?') || !window.location.search ? href : href + window.location.search;
  guardarParaTrocaDeIdioma(destino);
  // telas com mais que campos (ex.: fotos do acidente) guardam o proprio rascunho antes de trocar
  const esperas: Promise<unknown>[] = [gravando];
  window.dispatchEvent(new CustomEvent(EVENTO_TROCA_IDIOMA, { detail: { esperar: (p: Promise<unknown>) => esperas.push(p) } }));
  // espera gravar (no maximo 2,5 s) e so entao troca a pagina
  Promise.race([Promise.all(esperas), new Promise((ok) => setTimeout(ok, 2500))]).then(() => window.location.replace(destino));
}
