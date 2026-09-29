import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { individualVigente, lerPlataformaConfig } from '@/lib/comissao-regras';
import { COMISSAO_PECAS_CONFIG } from '@fixauto/shared';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// Espelha /api/admin/comissao, mas pra comissao de venda de pecas - que e
// generica por fornecedor_tipo+fornecedor_id (loja_pecas OU oficina com
// vende_pecas=true), diferente da comissao de servico que e so por oficina.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const [{ data: lojas, error: lojasError }, { data: oficinasFornecedoras, error: ofiError }] = await Promise.all([
      supabaseAdmin.from('lojas_pecas').select('id, nome_fantasia, cidade, estado, pais, ativa, parceiro_fundador, parceiro_fundador_desde'),
      supabaseAdmin.from('oficinas').select('id, nome_fantasia, cidade, estado, pais, ativa, parceiro_fundador, parceiro_fundador_desde').eq('vende_pecas', true),
    ]);
    if (lojasError) return NextResponse.json({ error: lojasError.message }, { status: 500 });
    if (ofiError) return NextResponse.json({ error: ofiError.message }, { status: 500 });

    const fornecedores = [
      ...(lojas || []).map((f) => ({ ...f, tipo: 'loja' as const })),
      ...(oficinasFornecedoras || []).map((f) => ({ ...f, tipo: 'oficina' as const })),
    ];

    const [global, { data: configs }, { data: lancamentos }] = await Promise.all([
      lerPlataformaConfig(supabaseAdmin),
      supabaseAdmin.from('comissao_pecas_config').select('*'),
      supabaseAdmin.from('comissao_pecas_lancamento').select('fornecedor_tipo, fornecedor_id, valor_comissao, status'),
    ]);

    const configPorFornecedor = new Map((configs || []).map((c) => [`${c.fornecedor_tipo}:${c.fornecedor_id}`, c]));
    const aggregates = new Map<string, { total_pendente: number; total_pago: number }>();
    (lancamentos || []).forEach((l) => {
      const key = `${l.fornecedor_tipo}:${l.fornecedor_id}`;
      const atual = aggregates.get(key) || { total_pendente: 0, total_pago: 0 };
      if (l.status === 'pendente') atual.total_pendente += Number(l.valor_comissao);
      else atual.total_pago += Number(l.valor_comissao);
      aggregates.set(key, atual);
    });

    const resultado = fornecedores.map((f) => {
      const key = `${f.tipo}:${f.id}`;
      const config = configPorFornecedor.get(key);
      const agg = aggregates.get(key) || { total_pendente: 0, total_pago: 0 };
      return {
        fornecedor_tipo: f.tipo,
        fornecedor_id: f.id,
        fornecedor: f,
        taxa_padrao: config?.taxa_padrao ?? 0.03,
        taxa_calculada: config?.taxa_calculada ?? null,
        taxa_fixa_override: config?.taxa_fixa_override ?? null,
        usa_override: config?.usa_override ?? false,
        override_ate: config?.override_ate ?? null,
        override_motivo: config?.override_motivo ?? null,
        individual_vigente: individualVigente(config),
        // Hierarquia: individual (no prazo) > regra global de pecas
        efetiva: individualVigente(config)
          ? { taxa: Number(config.taxa_fixa_override), origem: 'individual' as const }
          : {
              taxa: global.comissao_pecas_modo === 'isento' ? 0
                : global.comissao_pecas_modo === 'fixa' ? global.comissao_pecas_taxa
                : config?.taxa_calculada != null ? Number(config.taxa_calculada) : COMISSAO_PECAS_CONFIG.TAXA_BASE,
              origem: 'global' as const,
            },
        total_pendente: agg.total_pendente,
        total_pago: agg.total_pago,
      };
    });

    return NextResponse.json({ global, fornecedores: resultado });
  } catch (error) {
    console.error('[admin/comissao-pecas]', error);
    return NextResponse.json({ error: 'Erro ao buscar comissões de peças' }, { status: 500 });
  }
}

// PATCH: atualiza o override de um fornecedor (fornecedor_tipo+fornecedor_id
// + taxa_fixa_override + usa_override), OU marca um lancamento como pago
// (lancamento_id + status).
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();

    if (body.lancamento_id) {
      const { data, error } = await supabaseAdmin
        .from('comissao_pecas_lancamento')
        .update({ status: body.status, pago_em: body.status === 'pago' ? new Date().toISOString() : null })
        .eq('id', body.lancamento_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId: auth.userId, entidade: 'comissao_pecas_lancamento', entidadeId: body.lancamento_id,
        acao: `marcar_${body.status}`, depois: { status: body.status },
      });
      return NextResponse.json(data);
    }

    const { fornecedor_tipo, fornecedor_id, taxa_fixa_override, usa_override, override_ate, override_motivo } = body;
    if (!fornecedor_tipo || !fornecedor_id) {
      return NextResponse.json({ error: 'fornecedor_tipo e fornecedor_id obrigatórios' }, { status: 400 });
    }
    if (usa_override && !(typeof taxa_fixa_override === 'number' && taxa_fixa_override >= 0 && taxa_fixa_override <= 0.5)) {
      return NextResponse.json({ error: 'Taxa inválida (entre 0% e 50%)' }, { status: 400 });
    }
    if (override_ate && !/^\d{4}-\d{2}-\d{2}$/.test(override_ate)) {
      return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
    }

    const { data: antes } = await supabaseAdmin
      .from('comissao_pecas_config')
      .select('usa_override, taxa_fixa_override, override_ate, override_motivo')
      .eq('fornecedor_tipo', fornecedor_tipo)
      .eq('fornecedor_id', fornecedor_id)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from('comissao_pecas_config')
      .upsert(
        {
          fornecedor_tipo,
          fornecedor_id,
          taxa_fixa_override: usa_override ? taxa_fixa_override : null,
          usa_override: !!usa_override,
          override_ate: usa_override ? override_ate || null : null,
          override_motivo: usa_override ? override_motivo?.trim() || null : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fornecedor_tipo,fornecedor_id' }
      )
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await registrarAuditoria(supabaseAdmin, {
      adminId: auth.userId, entidade: fornecedor_tipo === 'loja' ? 'loja' : 'oficina', entidadeId: fornecedor_id,
      acao: usa_override ? 'definir_taxa_individual_pecas' : 'remover_taxa_individual_pecas',
      antes, depois: { usa_override: !!usa_override, taxa_fixa_override, override_ate, override_motivo }, motivo: override_motivo,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[admin/comissao-pecas PATCH]', error);
    return NextResponse.json({ error: 'Erro ao atualizar comissão de peças' }, { status: 500 });
  }
}
