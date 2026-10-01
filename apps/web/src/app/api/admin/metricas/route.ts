import { NextResponse } from 'next/server';
import type { PlataformaMetricas } from '@fixauto/shared';
import { requireAdmin } from '@/lib/admin-auth';
import { currencyForCountry } from '@/lib/currency';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Metrics change constantly - never let Next.js cache this route's response
// (dynamic alone wasn't enough - the internal fetch calls made by
// supabase-js were still being served from Next's Data Cache)
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Count profiles by tipo
    const { count: totalClientes } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'cliente');

    // Count actual oficina businesses, not profiles with tipo='oficina' -
    // that also includes funcionarios (employees), who are profiles of
    // tipo 'oficina' too but don't each represent a separate business.
    const { count: totalOficinas } = await supabaseAdmin
      .from('oficinas')
      .select('*', { count: 'exact', head: true });

    // Solicitacoes this month
    const { count: solicitacoesMes } = await supabaseAdmin
      .from('solicitacoes')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayOfMonth);

    // Servicos concluidos no mes = entregas confirmadas no mes (agenda da
    // plataforma concluida com data_fim no mes). Antes contava pedidos
    // CRIADOS no mes que estavam concluidos - um carro pedido em setembro e
    // entregue em outubro sumia das contas.
    const { data: entregas } = await supabaseAdmin
      .from('agenda')
      .select('solicitacao_id, oficina_id')
      .eq('tipo', 'plataforma')
      .eq('status', 'concluido')
      .not('solicitacao_id', 'is', null)
      .gte('data_fim', firstDayOfMonth);
    const entregasUnicas = new Set<string>();
    (entregas || []).forEach((e: any) => entregasUnicas.add(`${e.solicitacao_id}|${e.oficina_id}`));

    const somar = (alvo: Record<string, number>, moeda: string, v: unknown) => {
      alvo[moeda] = Math.round(((alvo[moeda] || 0) + Number(v || 0)) * 100) / 100;
    };

    // Valor dos servicos entregues no mes (base da comissao, que e lancada na
    // entrega): orcamento aceito de cada entrega, por moeda.
    const gmvMesPorMoeda: Record<string, number> = {};
    const solIds = Array.from(new Set(Array.from(entregasUnicas).map((k) => k.split('|')[0])));
    if (solIds.length) {
      const { data: orcs } = await supabaseAdmin
        .from('orcamentos')
        .select('solicitacao_id, oficina_id, valor_total, oficina:oficinas(pais)')
        .in('solicitacao_id', solIds)
        .eq('status', 'aceito');
      (orcs || []).forEach((o: any) => {
        if (!entregasUnicas.has(`${o.solicitacao_id}|${o.oficina_id}`)) return;
        somar(gmvMesPorMoeda, currencyForCountry(o.oficina?.pais), o.valor_total);
      });
    }

    // Comissao de SERVICOS lancada no mes (o lancamento nasce na entrega)
    const { data: comissoes } = await supabaseAdmin
      .from('comissao_lancamento')
      .select('valor_comissao, oficina:oficinas(pais)')
      .gte('created_at', firstDayOfMonth);
    const comissaoTotalPorMoeda: Record<string, number> = {};
    (comissoes || []).forEach((c: any) => somar(comissaoTotalPorMoeda, currencyForCountry(c.oficina?.pais), c.valor_comissao));

    // Comissao de PECAS lancada no mes (fornecedor = loja ou oficina)
    const { data: comPecas } = await supabaseAdmin
      .from('comissao_pecas_lancamento')
      .select('fornecedor_tipo, fornecedor_id, valor_comissao')
      .gte('created_at', firstDayOfMonth);
    // A receber (pendente), de qualquer mes - servicos e pecas
    const { data: pendServ } = await supabaseAdmin
      .from('comissao_lancamento')
      .select('valor_comissao, oficina:oficinas(pais)')
      .eq('status', 'pendente');
    const { data: pendPecas } = await supabaseAdmin
      .from('comissao_pecas_lancamento')
      .select('fornecedor_tipo, fornecedor_id, valor_comissao')
      .eq('status', 'pendente');

    // pais de cada fornecedor de pecas, para a moeda
    const lojaIds = new Set<string>(); const ofIds = new Set<string>();
    [...(comPecas || []), ...(pendPecas || [])].forEach((p: any) => (p.fornecedor_tipo === 'loja' ? lojaIds : ofIds).add(p.fornecedor_id));
    const paisFornecedor = new Map<string, string>();
    if (lojaIds.size) {
      const { data } = await supabaseAdmin.from('lojas_pecas').select('id, pais').in('id', Array.from(lojaIds));
      (data || []).forEach((l: any) => paisFornecedor.set(`loja|${l.id}`, l.pais));
    }
    if (ofIds.size) {
      const { data } = await supabaseAdmin.from('oficinas').select('id, pais').in('id', Array.from(ofIds));
      (data || []).forEach((o: any) => paisFornecedor.set(`oficina|${o.id}`, o.pais));
    }
    const moedaPeca = (p: any) => currencyForCountry(paisFornecedor.get(`${p.fornecedor_tipo}|${p.fornecedor_id}`));

    const comissaoPecasPorMoeda: Record<string, number> = {};
    (comPecas || []).forEach((p: any) => somar(comissaoPecasPorMoeda, moedaPeca(p), p.valor_comissao));
    const pendentePorMoeda: Record<string, number> = {};
    (pendServ || []).forEach((c: any) => somar(pendentePorMoeda, currencyForCountry(c.oficina?.pais), c.valor_comissao));
    (pendPecas || []).forEach((p: any) => somar(pendentePorMoeda, moedaPeca(p), p.valor_comissao));

    // Regra global vigente, para o painel dizer quando nada e cobrado
    const { data: cfg } = await supabaseAdmin
      .from('plataforma_config')
      .select('comissao_servicos_modo, comissao_pecas_modo')
      .eq('id', 1)
      .maybeSingle();

    const metricas: PlataformaMetricas = {
      total_clientes: totalClientes || 0,
      total_oficinas: totalOficinas || 0,
      solicitacoes_mes: solicitacoesMes || 0,
      servicos_concluidos_mes: entregasUnicas.size,
      gmv_mes_por_moeda: gmvMesPorMoeda,
      comissao_total_mes_por_moeda: comissaoTotalPorMoeda,
      comissao_pecas_mes_por_moeda: comissaoPecasPorMoeda,
      comissao_pendente_por_moeda: pendentePorMoeda,
      modo_comissao_servicos: cfg?.comissao_servicos_modo || 'isento',
      modo_comissao_pecas: cfg?.comissao_pecas_modo || 'isento',
    };

    return NextResponse.json(metricas);
  } catch (error) {
    console.error('Error fetching admin metrics:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar metricas' },
      { status: 500 }
    );
  }
}
