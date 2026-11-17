import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { interruptorPecasV3Global } from '@/lib/pecas-v3';
import { VALIDADE_COTACAO_DIAS } from '@/lib/pecas-formato';

export const dynamic = 'force-dynamic';

// Interruptor global do lote 1 de pecas (17/11, /admin/pecas). Desligado: so as contas
// de teste veem a tela nova. Ao LIGAR, as cotacoes abertas/respondidas ganham pelo menos
// 7 dias a partir de agora (senao as reais antigas venceriam na hora seguinte, sem aviso
// e sem ninguem ter visto "vale 7 dias"). Mesmo padrao do interruptor do SMS (api/admin/sms).

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ ativo: await interruptorPecasV3Global() });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  if (typeof corpo.ativo !== 'boolean') return NextResponse.json({ error: 'ativo deve ser true/false' }, { status: 400 });
  const antes = await interruptorPecasV3Global();
  const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, pecas_v3_ativo: corpo.ativo, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // greatest(expira_em, agora + 7 dias): so as que venceriam antes disso
  let prazoEstendido = 0;
  if (corpo.ativo && !antes) {
    const novo = new Date(Date.now() + VALIDADE_COTACAO_DIAS * 86400000).toISOString();
    const { data: estendidas, error: eExt } = await supabaseAdmin.from('cotacoes_pecas')
      .update({ expira_em: novo })
      .in('status', ['aberta', 'respondida'])
      .lt('expira_em', novo)
      .select('id');
    if (eExt) console.error('[admin/pecas-v3] estender expira_em:', eExt.message);
    prazoEstendido = estendidas?.length || 0;
  }
  // entidade_id e uuid: sem id (o '1' do SMS falhava em silencio)
  await registrarAuditoria(supabaseAdmin, {
    adminId: auth.userId, entidade: 'plataforma_config', entidadeId: null, acao: 'pecas_v3_ativo',
    antes: { pecas_v3_ativo: antes }, depois: { pecas_v3_ativo: corpo.ativo, ...(corpo.ativo && !antes ? { prazo_estendido: prazoEstendido } : {}) },
  });
  return NextResponse.json({ ativo: corpo.ativo });
}
