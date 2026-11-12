import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { limitarPorIp } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import {
  CODIGO_TENTATIVAS, PENDENTE_HORAS, codigoConfere, apagarPendente, ativarEPublicar,
} from '@/lib/pedido-sem-conta';
import { loginPorToken } from '@/lib/login-token';

export const dynamic = 'force-dynamic';

// Codigo certo: ativa a conta (nova) ou confirma o e-mail (conta existente), so
// entao o pedido vira solicitacao e vai para as oficinas - e a pessoa entra na
// conta neste aparelho (tokenHash de uso unico; dono 12/11: conta nova e antiga).
export async function POST(req: NextRequest) {
  if (!limitarPorIp(req, 'pedido-sem-conta-confirmar', 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Muitas tentativas', codigo: 'MUITAS_TENTATIVAS' }, { status: 429 });
  }
  const b = await req.json().catch(() => ({}));
  const id = b?.id;
  const codigo = typeof b?.codigo === 'string' ? b.codigo.replace(/\D/g, '') : '';
  if (!ehUuid(id)) return NextResponse.json({ error: 'Pedido inválido', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });

  const { data: p } = await supabaseAdmin.from('pedidos_pendentes').select('*').eq('id', id).maybeSingle();
  if (!p) return NextResponse.json({ error: 'Pedido não encontrado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  if (Date.now() - new Date(p.created_at).getTime() > PENDENTE_HORAS * 3600 * 1000) {
    await apagarPendente(p);
    return NextResponse.json({ error: 'Expirado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });
  }
  // a tentativa conta antes de comparar, num passo so no banco (envios em
  // paralelo nao passam do limite); o novo codigo do reenvio NAO zera a conta -
  // esgotou, a pessoa envia o pedido de novo (auditoria 06/11)
  const { data: t } = await supabaseAdmin.rpc('pendente_tentativa', { p_id: id, p_max: CODIGO_TENTATIVAS });
  const tentativa = (t as { codigo_hash: string; tentativas: number }[] | null)?.[0];
  if (!tentativa) {
    return NextResponse.json({ error: 'Tentativas esgotadas', codigo: 'CODIGO_TENTATIVAS' }, { status: 429 });
  }
  if (!codigoConfere(id, codigo, tentativa.codigo_hash)) {
    const restantes = CODIGO_TENTATIVAS - tentativa.tentativas;
    return NextResponse.json({ error: 'Código errado', codigo: restantes > 0 ? 'CODIGO_INVALIDO' : 'CODIGO_TENTATIVAS', restantes }, { status: 400 });
  }

  // reserva: so uma confirmacao cria o pedido (dois toques ao mesmo tempo)
  const { data: reservado } = await supabaseAdmin.from('pedidos_pendentes').delete().eq('id', id).select('id');
  if (!reservado?.length) return NextResponse.json({ error: 'Já confirmado', codigo: 'CODIGO_EXPIRADO' }, { status: 410 });

  try {
    const r = await ativarEPublicar(p);
    if ('erro' in r) {
      return r.erro === 'SEM_ACESSO'
        ? NextResponse.json({ error: 'Sem acesso', codigo: 'SEM_ACESSO' }, { status: 403 })
        : NextResponse.json({ error: 'Avaliação pendente', codigo: 'AVALIACAO_PENDENTE' }, { status: 409 });
    }
    const login = await loginPorToken(p.user_id);
    return NextResponse.json({ solicitacaoId: r.id, numero: r.numero, email: p.email, ...login });
  } catch (e) {
    // devolve o pendente para a pessoa poder tentar de novo
    await supabaseAdmin.from('pedidos_pendentes').insert(p).then(() => {}, () => {});
    console.error('[pedido-sem-conta/confirmar]', e);
    return NextResponse.json({ error: 'Erro interno', codigo: 'GENERICO' }, { status: 500 });
  }
}
