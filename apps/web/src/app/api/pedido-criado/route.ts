import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionUserId } from '@/lib/api-auth';
import { dentroDoLimite } from '@/lib/rate-limit';
import { ehUuid } from '@/lib/validacao';
import { avisarAdminSeSemOficinas } from '@/lib/concierge';
import { avisarOficinasDoPedido } from '@/lib/avisar-oficinas-pedido';

export const dynamic = 'force-dynamic';

// Chamado depois que o cliente cria um pedido (a criacao e feita no
// navegador, sob RLS). So o dono do pedido; avisa as oficinas do raio e o
// admin se nao ha oficina.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!dentroDoLimite(`pedido-criado:${userId}`, 20, 60 * 60 * 1000)) return NextResponse.json({ ok: true });
  const { solicitacaoId } = await req.json().catch(() => ({}));
  if (!ehUuid(solicitacaoId)) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('cliente_id, tipo, descricao, endereco').eq('id', solicitacaoId).maybeSingle();
  if (!sol || sol.cliente_id !== userId) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const avisadas = await avisarOficinasDoPedido(solicitacaoId).catch((e) => { console.error('[pedido-criado] oficinas', e); return 0; });
  // admin so quando nenhuma oficina perto recebeu (primeira vez; -1 = ja tratado)
  if (avisadas >= 0) {
    await avisarAdminSeSemOficinas('pedido', solicitacaoId, `${sol.tipo} - ${sol.descricao || ''} - ${sol.endereco || ''}`, avisadas).catch((e) =>
      console.error('[pedido-criado]', e)
    );
  }
  return NextResponse.json({ ok: true });
}
