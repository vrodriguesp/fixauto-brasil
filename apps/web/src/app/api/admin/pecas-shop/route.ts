import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { interruptoresLote5 } from '@/lib/pecas-lote5';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pecas lote 5 (20/11, migracao 105): interruptor do Shop (pecas_shop_ativo) + moderacao (ocultar/mostrar item ou promocao com motivo). Tudo com auditoria.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const [sw, { data: promos }, { data: itens }] = await Promise.all([
    interruptoresLote5(),
    supabaseAdmin.from('promocoes_pecas').select('id, titulo, preco, preco_anterior, visibilidade, destaque, valido_ate, oculta, oculta_motivo, loja:lojas_pecas(nome_fantasia)').order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('pecas_catalogo').select('id, nome, preco, visibilidade, ativo, oculto, oculto_motivo, atualizado_em, loja:lojas_pecas(nome_fantasia)').order('atualizado_em', { ascending: false }).limit(100),
  ]);
  return NextResponse.json({ shop: sw.shop, v3: sw.v3, promocoes: promos || [], itens: itens || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const corpo = await req.json().catch(() => ({}));

  if (corpo.chave === 'shop') {
    if (typeof corpo.ativo !== 'boolean') return NextResponse.json({ error: 'ativo deve ser true/false' }, { status: 400 });
    const coluna = 'pecas_shop_ativo';
    const antes = await interruptoresLote5();
    const { error } = await supabaseAdmin.from('plataforma_config').upsert({ id: 1, [coluna]: corpo.ativo, updated_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: 'plataforma_config', entidadeId: null, acao: coluna,
      antes: { [coluna]: antes.shop }, depois: { [coluna]: corpo.ativo },
    });
    return NextResponse.json({ ativo: corpo.ativo });
  }

  if (corpo.tipo === 'item' || corpo.tipo === 'promocao') {
    if (!UUID.test(String(corpo.id || '')) || typeof corpo.oculto !== 'boolean') return NextResponse.json({ error: 'id/oculto' }, { status: 400 });
    const motivo = typeof corpo.motivo === 'string' ? corpo.motivo.trim().slice(0, 300) : '';
    if (corpo.oculto && motivo.length < 3) return NextResponse.json({ error: 'motivo obrigatório' }, { status: 400 });
    const tabela = corpo.tipo === 'item' ? 'pecas_catalogo' : 'promocoes_pecas';
    const pref = corpo.tipo === 'item' ? 'oculto' : 'oculta';
    const { data: antes } = await supabaseAdmin.from(tabela).select(`id, ${pref}, ${pref}_motivo`).eq('id', corpo.id).maybeSingle();
    if (!antes) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
    const novo = { [pref]: corpo.oculto, [`${pref}_motivo`]: corpo.oculto ? motivo : null, [`${pref}_em`]: corpo.oculto ? new Date().toISOString() : null };
    const { error } = await supabaseAdmin.from(tabela).update(novo).eq('id', corpo.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: tabela, entidadeId: corpo.id, acao: corpo.oculto ? 'ocultar' : 'mostrar', antes, depois: novo, motivo: motivo || null,
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'pedido inválido' }, { status: 400 });
}
