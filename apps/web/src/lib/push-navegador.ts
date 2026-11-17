import * as webpush from 'web-push';
import { supabaseAdmin } from './supabase-admin';

// Web Push do navegador (lote 3c de pecas, D-8; Mapa_lote3.md sec. 7). Sem gatilho no banco: a propria
// rota chama enviarPushNavegador depois do sino, so nos eventos que o dono escolheu (loja: cotacao
// urgente com e-mail imediato, pedido confirmado, mensagem; oficina: oferta recebida, cancelamento,
// problema; nunca o resumo). Fire-and-forget com prazo de 10 s; TTL 1 h; urgency 'high' so em "hoje".
// 404/410 apaga a inscricao; 3 falhas seguidas apagam. Sem chaves VAPID no .env (ou sem inscricao)
// nada sai - o e-mail e o sino continuam sendo o canal garantido.
// WEB_PUSH_URL_TESTE (so no .env.local do ambiente de teste, como o EXPO_PUSH_URL do lib/push.ts): o
// pedido criptografado vai para o servidor falso da suite em vez do endpoint do navegador.

export const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.samsungosp\.com$/];
export const MAX_INSCRICOES = 5;

export const chavePublicaVapid = () => process.env.VAPID_PUBLIC_KEY || '';
const configurado = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** endpoint aceito: https e host de um servico de push conhecido */
export function endpointValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && HOSTS_PUSH.some((h) => h.test(u.hostname));
  } catch { return false; }
}

type Aviso = { titulo: string; mensagem: string; link: string; urgente?: boolean };

/** manda o aviso para todas as inscricoes do perfil; devolve quantas aceitaram */
export async function enviarPushNavegador(profileId: string, aviso: Aviso): Promise<number> {
  if (!profileId || !configurado()) return 0;
  const { data: inscricoes, error } = await supabaseAdmin.from('push_navegador').select('id, endpoint, p256dh, auth, falhas').eq('profile_id', profileId).limit(MAX_INSCRICOES);
  if (error || !inscricoes?.length) return 0;
  // so caminho relativo do proprio site (o service worker tambem recusa outro)
  const link = aviso.link.startsWith('/') && !aviso.link.startsWith('//') ? aviso.link : '/';
  const payload = JSON.stringify({ titulo: aviso.titulo.slice(0, 120), mensagem: aviso.mensagem.slice(0, 300), link });
  const teste = process.env.WEB_PUSH_URL_TESTE;
  let aceitas = 0;
  for (const i of inscricoes as { id: string; endpoint: string; p256dh: string; auth: string; falhas: number }[]) {
    try {
      const det = webpush.generateRequestDetails({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, payload, {
        TTL: 3600,
        urgency: aviso.urgente ? 'high' : 'normal',
        vapidDetails: { subject: process.env.VAPID_SUBJECT || 'mailto:suporte@bipfix.com', publicKey: process.env.VAPID_PUBLIC_KEY as string, privateKey: process.env.VAPID_PRIVATE_KEY as string },
      });
      // Content-Length sai do cabecalho: o fetch do Node calcula pelo corpo
      const cab = Object.fromEntries(Object.entries(det.headers as Record<string, string | number>).filter(([k]) => k.toLowerCase() !== 'content-length').map(([k, v]) => [k, String(v)]));
      const r = await fetch(teste || det.endpoint, { method: det.method, headers: cab, body: det.body as unknown as BodyInit, signal: AbortSignal.timeout(10000) });
      if (r.status === 404 || r.status === 410) { await supabaseAdmin.from('push_navegador').delete().eq('id', i.id); continue; }
      if (r.ok) { aceitas++; await supabaseAdmin.from('push_navegador').update({ ultimo_ok: new Date().toISOString(), falhas: 0, ultimo_erro: null }).eq('id', i.id); continue; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      const falhas = (Number(i.falhas) || 0) + 1;
      if (falhas >= 3) await supabaseAdmin.from('push_navegador').delete().eq('id', i.id);
      else await supabaseAdmin.from('push_navegador').update({ falhas, ultimo_erro: String((e as Error).message || e).slice(0, 200) }).eq('id', i.id);
      // so o host no log (o endpoint e um identificador do aparelho)
      try { console.error('[push-navegador] falha', new URL(i.endpoint).hostname, (e as Error).message); } catch { /* segue */ }
    }
  }
  return aceitas;
}
