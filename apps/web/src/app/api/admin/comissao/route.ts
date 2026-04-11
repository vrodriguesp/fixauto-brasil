import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET: list all comissao_config with oficina info
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('comissao_config')
      .select('*, oficina:oficinas(id, nome_fantasia, cidade, estado, ativa)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also get aggregated lancamento data per oficina
    const { data: lancamentos } = await supabaseAdmin
      .from('comissao_lancamento')
      .select('oficina_id, valor_comissao, status');

    const aggregates: Record<string, { total_pendente: number; total_pago: number }> = {};
    (lancamentos || []).forEach((l) => {
      if (!aggregates[l.oficina_id]) {
        aggregates[l.oficina_id] = { total_pendente: 0, total_pago: 0 };
      }
      if (l.status === 'pendente') {
        aggregates[l.oficina_id].total_pendente += l.valor_comissao;
      } else {
        aggregates[l.oficina_id].total_pago += l.valor_comissao;
      }
    });

    const result = (data || []).map((config) => ({
      ...config,
      total_pendente: aggregates[config.oficina_id]?.total_pendente || 0,
      total_pago: aggregates[config.oficina_id]?.total_pago || 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching comissao configs:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar configuracoes de comissao' },
      { status: 500 }
    );
  }
}

// PATCH: update comissao_config for an oficina
export async function PATCH(req: NextRequest) {
  try {
    const { oficina_id, taxa_fixa_override, usa_override } = await req.json();

    if (!oficina_id) {
      return NextResponse.json({ error: 'oficina_id obrigatorio' }, { status: 400 });
    }

    // Upsert: create if not exists, update if exists
    const { data, error } = await supabaseAdmin
      .from('comissao_config')
      .upsert(
        {
          oficina_id,
          taxa_fixa_override: usa_override ? taxa_fixa_override : null,
          usa_override: !!usa_override,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'oficina_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating comissao config:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar configuracao de comissao' },
      { status: 500 }
    );
  }
}
