import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { carregarPedido, erro, ok, lancarComissaoSeFalta, SEM_CACHE, JANELA_CONTATO_MS, DIA_MS } from '@/lib/pecas-confianca';

export const dynamic = 'force-dynamic';

// Lote 3 de pecas (admin): pedidos com problema/"nao entregou" e oficinas bloqueadas pelo P-7 (GET);
// "marcar recebido" (a pendencia continua ate a avaliacao) e cancelar como admin (sem pendencia) (POST).
// A rota de hoje GET /api/admin/pedidos-pecas continua igual.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const desde90 = new Date(Date.now() - 90 * DIA_MS).toISOString();
    const sel = 'id, status, created_at, recebido_em, entregue_em, problema, problema_texto, problema_em, cancelado_por, cancelado_motivo, cancelado_em, oficina_id, fornecedor_tipo, loja_id, oficina_fornecedora_id, cotacao:cotacoes_pecas!pedidos_pecas_cotacao_id_fkey(peca_descricao), compradora:oficinas!pedidos_pecas_oficina_id_fkey(nome_fantasia), loja:lojas_pecas(nome_fantasia), oficina_fornecedora:oficinas!pedidos_pecas_oficina_fornecedora_id_fkey(nome_fantasia)';
    const [{ data: comProblema }, { data: semRetorno }, { data: candidatos }] = await Promise.all([
      supabaseAdmin.from('pedidos_pecas').select(sel).eq('v3', true).or(`problema.not.is.null,cancelado_motivo.eq.nao_entregou,cancelado_por.eq.fornecedor`).gte('created_at', desde90).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('pedidos_pecas').select(sel).eq('v3', true).in('status', ['confirmado', 'entregue']).is('recebido_em', null).is('problema', null).order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('pedidos_pecas').select('oficina_id').eq('v3', true).gte('lembretes_feedback', 1).limit(1000),
    ]);
    const linha = (p: any) => ({
      id: p.id, status: p.status, criadoEm: p.created_at, peca: p.cotacao?.peca_descricao || '-', compradora: p.compradora?.nome_fantasia || '-',
      fornecedor: (p.fornecedor_tipo === 'loja' ? p.loja : p.oficina_fornecedora)?.nome_fantasia || '-', fornecedorChave: `${p.fornecedor_tipo}:${p.loja_id || p.oficina_fornecedora_id}`,
      problema: p.problema, problemaTexto: p.problema_texto, canceladoPor: p.cancelado_por, canceladoMotivo: p.cancelado_motivo, recebidoEm: p.recebido_em, entregueEm: p.entregue_em,
    });
    // D-4: casos de "nao entregou" por fornecedor em 90 dias (o admin decide a partir de 3)
    const naoEntregouPorFornecedor: Record<string, number> = {};
    for (const p of (comProblema as any[]) || []) if (p.cancelado_motivo === 'nao_entregou') { const k = `${p.fornecedor_tipo}:${p.loja_id || p.oficina_fornecedora_id}`; naoEntregouPorFornecedor[k] = (naoEntregouPorFornecedor[k] || 0) + 1; }
    // oficinas bloqueadas agora (a mesma funcao da RLS do INSERT, pela service role)
    const ids = Array.from(new Set(((candidatos as any[]) || []).map((c) => c.oficina_id))).slice(0, 200);
    const bloqueadas: { id: string; nome: string }[] = [];
    for (const id of ids) {
      const { data: b } = await supabaseAdmin.rpc('oficina_feedback_pecas_pendente', { p_oficina: id });
      if (b === true) bloqueadas.push({ id, nome: '' });
    }
    if (bloqueadas.length) {
      const { data: nomes } = await supabaseAdmin.from('oficinas').select('id, nome_fantasia').in('id', bloqueadas.map((b) => b.id));
      for (const b of bloqueadas) b.nome = ((nomes as any[]) || []).find((n) => n.id === b.id)?.nome_fantasia || '-';
    }
    return Response.json({ problemas: ((comProblema as any[]) || []).map(linha), semRetorno: ((semRetorno as any[]) || []).map(linha), naoEntregouPorFornecedor, bloqueadas }, { headers: SEM_CACHE });
  } catch (e) {
    console.error('[admin/pedido-peca GET]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const corpo = await req.json().catch(() => ({}));
    const p = await carregarPedido(corpo?.id);
    if (!p) return erro(404, 'NAO_ENCONTRADO');
    const agora = new Date().toISOString();
    if (corpo?.recebido === true) {
      if (p.status === 'cancelado') return erro(409, 'CANCELADO');
      if (p.recebido_em) return ok({ jaRecebido: true });
      const { error } = await supabaseAdmin.from('pedidos_pecas').update({
        recebido_em: agora, entregue_em: p.entregue_em || agora, status: 'entregue',
        ...(p.v3 ? { contato_visivel_ate: new Date(Date.now() + JANELA_CONTATO_MS).toISOString() } : {}),
      }).eq('id', p.id).neq('status', 'cancelado');
      if (error) return erro(500, 'ERRO');
      await lancarComissaoSeFalta(p).catch(() => {});
      await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'pedido_peca', entidadeId: p.id, acao: 'marcar_recebido', antes: { status: p.status, recebido_em: null }, depois: { status: 'entregue', recebido_em: agora }, motivo: typeof corpo?.motivo === 'string' ? corpo.motivo : null });
      return ok();
    }
    if (corpo?.cancelar === true) {
      if (p.status === 'cancelado') return erro(409, 'CANCELADO');
      const { error } = await supabaseAdmin.from('pedidos_pecas').update({
        status: 'cancelado', cancelado_por: 'admin', cancelado_em: agora, ...(p.v3 ? { contato_visivel_ate: agora } : {}),
      }).eq('id', p.id);
      if (error) return erro(500, 'ERRO');
      await registrarAuditoria(supabaseAdmin, { adminId: auth.userId, entidade: 'pedido_peca', entidadeId: p.id, acao: 'cancelar_como_admin', antes: { status: p.status }, depois: { status: 'cancelado', cancelado_por: 'admin' }, motivo: typeof corpo?.motivo === 'string' ? corpo.motivo : null });

      return ok();
    }
    return erro(400, 'ACAO_INVALIDA');
  } catch (e) {
    console.error('[admin/pedido-peca]', (e as Error).message);
    return erro(500, 'ERRO');
  }
}
