import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Commission data changes constantly - never let Next.js cache this route's response
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// GET: list ALL oficinas with their comissao config (if any) and lancamento totals.
// Note: comissao_config rows only exist for oficinas whose rate was manually
// overridden - starting from that table hid every oficina still on the default
// rate, even ones with real pending/paid commission.
export async function GET() {
  try {
    const { data: oficinas, error } = await supabaseAdmin
      .from('oficinas')
      .select('id, nome_fantasia, cidade, estado, ativa')
      .order('nome_fantasia');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: configs } = await supabaseAdmin
      .from('comissao_config')
      .select('*');

    const configByOficina: Record<string, { id: string; taxa_padrao: number; taxa_fixa_override: number | null; usa_override: boolean }> = {};
    (configs || []).forEach((c) => { configByOficina[c.oficina_id] = c; });

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

    const result = (oficinas || []).map((ofi) => {
      const config = configByOficina[ofi.id];
      return {
        id: config?.id || null,
        oficina_id: ofi.id,
        taxa_padrao: config?.taxa_padrao ?? 0.10,
        taxa_fixa_override: config?.taxa_fixa_override ?? null,
        usa_override: config?.usa_override ?? false,
        total_pendente: aggregates[ofi.id]?.total_pendente || 0,
        total_pago: aggregates[ofi.id]?.total_pago || 0,
        oficina: ofi,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching comissao configs:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar configuracoes de comissao' },
      { status: 500 }
    );
  }
}

// PATCH: update comissao_config for an oficina, OR mark a comissao_lancamento as pago
// (pass lancamento_id + status to mark a single commission entry as paid)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.lancamento_id) {
      const { data, error } = await supabaseAdmin
        .from('comissao_lancamento')
        .update({
          status: body.status,
          pago_em: body.status === 'pago' ? new Date().toISOString() : null,
        })
        .eq('id', body.lancamento_id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }

    const { oficina_id, taxa_fixa_override, usa_override } = body;

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
