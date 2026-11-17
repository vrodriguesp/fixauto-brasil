import { NextRequest } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { erro, ok, SEM_CACHE } from '@/lib/pecas-confianca';
import { endpointValido, chavePublicaVapid, MAX_INSCRICOES } from '@/lib/push-navegador';

export const dynamic = 'force-dynamic';

// Lote 3c de pecas: inscricao do aviso no navegador (Web Push). GET -> { ativo, publicKey } (chave VAPID
// publica; vazia = push desligado no servidor). POST { endpoint, keys } grava por ENDPOINT (quem entra
// no mesmo navegador fica com a inscricao; o aviso de quem saiu nao chega ali), so https de servico de
// push conhecido, no maximo 5 por pessoa. DELETE { endpoint } (sair da conta / desligar). Tabela sem
// politica de RLS: so esta rota le e grava.
const B64URL = /^[A-Za-z0-9_-]+=*$/;

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return erro(401, 'NAO_AUTENTICADO');
  const { count } = await supabaseAdmin.from('push_navegador').select('id', { count: 'exact', head: true }).eq('profile_id', userId);
  return Response.json({ ativo: (count || 0) > 0, publicKey: chavePublicaVapid() }, { headers: SEM_CACHE });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return erro(401, 'NAO_AUTENTICADO');
    if (!dentroDoLimite(`push-navegador-u:${userId}`, 20, 60 * 60 * 1000)) return erro(429, 'MUITAS_TENTATIVAS');
    const corpo = await req.json().catch(() => ({}));
    const endpoint = corpo?.endpoint;
    if (!endpointValido(endpoint)) {
      try { console.warn('[push/navegador] endpoint recusado:', new URL(String(endpoint)).hostname); } catch { /* nem URL */ }
      return erro(400, 'ENDPOINT_INVALIDO');
    }
    const p256dh = corpo?.keys?.p256dh, auth = corpo?.keys?.auth;
    if (typeof p256dh !== 'string' || typeof auth !== 'string' || !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) return erro(400, 'CHAVES_INVALIDAS');
    const { data: minhas } = await supabaseAdmin.from('push_navegador').select('endpoint').eq('profile_id', userId);
    if (((minhas as any[]) || []).filter((m) => m.endpoint !== endpoint).length >= MAX_INSCRICOES) return erro(409, 'LIMITE_INSCRICOES');
    const ua = (req.headers.get('user-agent') || '').slice(0, 200) || null;
    const { error } = await supabaseAdmin.from('push_navegador').upsert(
      { profile_id: userId, endpoint, p256dh, auth, user_agent: ua, criado_em: new Date().toISOString(), falhas: 0, ultimo_erro: null },
      { onConflict: 'endpoint' },
    );
    if (error) return erro(500, 'ERRO');
    return ok();
  } catch (e) {
    console.error('[push/navegador]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return erro(401, 'NAO_AUTENTICADO');
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo?.endpoint !== 'string') return erro(400, 'ENDPOINT_INVALIDO');
  const { error } = await supabaseAdmin.from('push_navegador').delete().eq('endpoint', corpo.endpoint).eq('profile_id', userId);
  if (error) return erro(500, 'ERRO');
  return ok();
}
