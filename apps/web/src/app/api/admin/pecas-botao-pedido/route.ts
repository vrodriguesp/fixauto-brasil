import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { configBotaoPedido, lojasReaisPorPais, MIN_LOJAS_MAX } from '@/lib/pecas-botao-pedido';

export const dynamic = 'force-dynamic';

// 21/11 (migracao 113, aprovado pelo dono): botao "Pedir peca" no pedido do motorista (/admin/pecas).
// Interruptor proprio (pecas_botao_pedido_ativo) + minimo de lojas ao alcance (pecas_botao_min_lojas, 0-50).
// So vale com pecas v3 valendo para a pessoa. Contas de teste veem sem o interruptor (com lojas de teste).
// Mesmo padrao de api/admin/pecas-v3 (requireAdmin, upsert id 1, auditoria antes/depois).

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const [cfg, porPais] = await Promise.all([configBotaoPedido(), lojasReaisPorPais()]);
  return NextResponse.json({ ativo: cfg.ativo, minLojas: cfg.minLojas, lojasReaisPorPais: porPais }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));
  const mudar: { pecas_botao_pedido_ativo?: boolean; pecas_botao_min_lojas?: number } = {};
  if (corpo.ativo !== undefined) {
    if (typeof corpo.ativo !== 'boolean') return NextResponse.json({ error: 'ativo deve ser true/false' }, { status: 400 });
    mudar.pecas_botao_pedido_ativo = corpo.ativo;
  }
  if (corpo.minLojas !== undefined) {
    if (typeof corpo.minLojas !== 'number' || !Number.isInteger(corpo.minLojas) || corpo.minLojas < 0 || corpo.minLojas > MIN_LOJAS_MAX) {
      return NextResponse.json({ error: `minLojas deve ser inteiro de 0 a ${MIN_LOJAS_MAX}` }, { status: 400 });
    }
    mudar.pecas_botao_min_lojas = corpo.minLojas;
  }
  if (!Object.keys(mudar).length) return NextResponse.json({ error: 'nada para salvar' }, { status: 400 });

  const antes = await configBotaoPedido();
  const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, ...mudar, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const depois = await configBotaoPedido();
  await registrarAuditoria(supabaseAdmin, {
    adminId: auth.userId, entidade: 'plataforma_config', entidadeId: null, acao: 'pecas_botao_pedido',
    antes: { pecas_botao_pedido_ativo: antes.ativo, pecas_botao_min_lojas: antes.minLojas },
    depois: { pecas_botao_pedido_ativo: depois.ativo, pecas_botao_min_lojas: depois.minLojas },
  });
  return NextResponse.json({ ativo: depois.ativo, minLojas: depois.minLojas });
}
