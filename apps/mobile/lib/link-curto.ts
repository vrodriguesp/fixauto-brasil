// Link curto bipfix.com/r/<numero> (apps/web/src/app/r/[numero]/route.ts) aberto pelo app (App Links).
// O app so trata o link PURO (SMS do motorista) ou com ?o=<idioma> (e-mail de pedido novo da oficina): os dois
// pedem login no site tambem. Qualquer outra variante o site resolve SEM login ou por token e por isso vai ao
// navegador, igual a antes (regra do dono 19/11: link compartilhado nunca morre; revisao Fable S2):
//  ?s=<token>            parar lembretes do motorista (115)
//  ?k=<token> [&o= &d=1] acesso sem senha (089): "ver pedido" / "nao tenho interesse"
//  ?c=1 [&g=1 &of=]      chat com a oficina (agendamento / "a oficina te escreveu", pagador do acidente)
//  ?o=<idioma>&p=1       pedido de novas datas (079) -> pagina do pedido no site (o app nao responde datas)
//  ?l=<idioma>           orcamento para quem nao e o dono do pedido
// Espelho: PARAMS_SO_SITE em apps/web/src/app/api/app-links/route.ts (exclusoes do AASA no iPhone).
export const PARAMS_SO_SITE = ['s', 'k', 'c', 'g', 'p', 'd', 'of', 'l'];

export type DecisaoLink = { tipo: 'app' } | { tipo: 'navegador'; query: string };

export function destinoDoLinkCurto(params: Record<string, string | string[] | undefined> | null | undefined): DecisaoLink {
  const p = params || {};
  const soSite = Object.keys(p).some((k) => PARAMS_SO_SITE.includes(k) && p[k] !== undefined && p[k] !== '');
  if (!soSite) return { tipo: 'app' };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (k === 'numero' || v === undefined) continue;
    q.set(k, Array.isArray(v) ? v[0] : v);
  }
  return { tipo: 'navegador', query: q.toString() };
}
