import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PlataformaMetricas } from '@fixauto/shared';

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
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Count profiles by tipo
    const { count: totalClientes } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'cliente');

    const { count: totalOficinas } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'oficina');

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

    // GMV: sum of orcamentos.valor_total for aceito this month
    const { data: orcamentosAceitos } = await supabaseAdmin
      .from('orcamentos')
      .select('valor_total')
      .eq('status', 'aceito')
      .gte('created_at', firstDayOfMonth);

    const gmvMes = (orcamentosAceitos || []).reduce(
      (sum, o) => sum + (o.valor_total || 0),
      0
    );

    // Comissao total this month
    const { data: comissoes } = await supabaseAdmin
      .from('comissao_lancamento')
      .select('valor_comissao')
      .gte('created_at', firstDayOfMonth);

    const comissaoTotal = (comissoes || []).reduce(
      (sum, c) => sum + (c.valor_comissao || 0),
      0
    );

    const metricas: PlataformaMetricas = {
      total_clientes: totalClientes || 0,
      total_oficinas: totalOficinas || 0,
      solicitacoes_mes: solicitacoesMes || 0,
      servicos_concluidos_mes: servicosConcluidos || 0,
      gmv_mes: gmvMes,
      comissao_total_mes: comissaoTotal,
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
