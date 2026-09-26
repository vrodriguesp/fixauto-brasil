import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PlataformaMetricas } from '@fixauto/shared';
import { requireAdmin } from '@/lib/admin-auth';
import { currencyForCountry } from '@/lib/currency';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    // Concluidas this month
    const { count: servicosConcluidos } = await supabaseAdmin
      .from('solicitacoes')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concluida')
      .gte('created_at', firstDayOfMonth);

    // GMV: sum of orcamentos.valor_total for aceito this month - agrupado
    // por moeda (oficina.pais), ja que oficinas de paises diferentes usam
    // moedas diferentes e somar tudo junto misturaria BRL com EUR.
    const { data: orcamentosAceitos } = await supabaseAdmin
      .from('orcamentos')
      .select('valor_total, oficina:oficinas(pais)')
      .eq('status', 'aceito')
      .gte('created_at', firstDayOfMonth);

    const gmvMesPorMoeda: Record<string, number> = {};
    (orcamentosAceitos || []).forEach((o: any) => {
      const moeda = currencyForCountry(o.oficina?.pais);
      gmvMesPorMoeda[moeda] = (gmvMesPorMoeda[moeda] || 0) + (o.valor_total || 0);
    });

    // Comissao total this month - mesma logica, agrupado por moeda
    const { data: comissoes } = await supabaseAdmin
      .from('comissao_lancamento')
      .select('valor_comissao, oficina:oficinas(pais)')
      .gte('created_at', firstDayOfMonth);

    const comissaoTotalPorMoeda: Record<string, number> = {};
    (comissoes || []).forEach((c: any) => {
      const moeda = currencyForCountry(c.oficina?.pais);
      comissaoTotalPorMoeda[moeda] = (comissaoTotalPorMoeda[moeda] || 0) + (c.valor_comissao || 0);
    });

    const metricas: PlataformaMetricas = {
      total_clientes: totalClientes || 0,
      total_oficinas: totalOficinas || 0,
      solicitacoes_mes: solicitacoesMes || 0,
      servicos_concluidos_mes: servicosConcluidos || 0,
      gmv_mes_por_moeda: gmvMesPorMoeda,
      comissao_total_mes_por_moeda: comissaoTotalPorMoeda,
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
