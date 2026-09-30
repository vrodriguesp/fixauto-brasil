import { NextRequest, NextResponse } from 'next/server';
import { COMISSAO_CONFIG } from '@fixauto/shared';
import { requireAdmin } from '@/lib/admin-auth';
import { registrarAuditoria } from '@/lib/admin-auditoria';
import { individualVigente, lerPlataformaConfig, type ModoComissao } from '@/lib/comissao-regras';
import { supabaseAdmin } from '@/lib/supabase-admin';


// Commission data changes constantly - never let Next.js cache this route's response
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const MODOS: ModoComissao[] = ['isento', 'fixa', 'desempenho'];

function taxaValida(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0.5;
}

function dataValida(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

// GET: regra global + TODAS as oficinas com a taxa que vale para cada uma
// (e de onde ela vem), taxa individual, selo de fundador e totais.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const [global, { data: oficinas, error }, { data: configs }, { data: lancamentos }] = await Promise.all([
      lerPlataformaConfig(supabaseAdmin),
      supabaseAdmin
        .from('oficinas')
        .select('id, nome_fantasia, cidade, estado, pais, ativa, parceiro_fundador, parceiro_fundador_desde, created_at')
        .order('created_at', { ascending: true }),
      supabaseAdmin.from('comissao_config').select('*'),
      supabaseAdmin.from('comissao_lancamento').select('oficina_id, valor_comissao, status'),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const configByOficina: Record<string, any> = {};
    (configs || []).forEach((c) => { configByOficina[c.oficina_id] = c; });

    const aggregates: Record<string, { total_pendente: number; total_pago: number }> = {};
    (lancamentos || []).forEach((l) => {
      const a = (aggregates[l.oficina_id] ||= { total_pendente: 0, total_pago: 0 });
      if (l.status === 'pendente') a.total_pendente += Number(l.valor_comissao);
      else a.total_pago += Number(l.valor_comissao);
    });

    const taxaGlobalPara = (cfg: any): number => {
      if (global.comissao_servicos_modo === 'isento') return 0;
      if (global.comissao_servicos_modo === 'fixa') return global.comissao_servicos_taxa;
      return cfg?.taxa_calculada != null ? Number(cfg.taxa_calculada) : COMISSAO_CONFIG.TAXA_BASE;
    };

    const result = (oficinas || []).map((ofi) => {
      const cfg = configByOficina[ofi.id];
      const vigente = individualVigente(cfg);
      return {
        oficina_id: ofi.id,
        oficina: ofi,
        individual: cfg?.usa_override
          ? {
              taxa: cfg.taxa_fixa_override != null ? Number(cfg.taxa_fixa_override) : null,
              ate: cfg.override_ate || null,
              motivo: cfg.override_motivo || null,
              vigente,
            }
          : null,
        taxa_calculada: cfg?.taxa_calculada != null ? Number(cfg.taxa_calculada) : null,
        efetiva: vigente
          ? { taxa: Number(cfg.taxa_fixa_override), origem: 'individual' as const }
          : { taxa: taxaGlobalPara(cfg), origem: 'global' as const },
        total_pendente: aggregates[ofi.id]?.total_pendente || 0,
        total_pago: aggregates[ofi.id]?.total_pago || 0,
      };
    });

    return NextResponse.json({ global, oficinas: result });
  } catch (error) {
    console.error('Error fetching comissao configs:', error);
    return NextResponse.json({ error: 'Erro ao buscar configuracoes de comissao' }, { status: 500 });
  }
}

// PATCH com { acao }:
//   'global'            -> regra global (modo + taxa) de servicos e de pecas
//   'individual'        -> taxa individual de uma oficina (taxa null remove)
//   'fundador'          -> liga/desliga o selo de parceiro fundador (oficina ou loja)
//   'oferta_fundadores' -> aplica a mesma taxa individual a todas as oficinas fundadoras
//   (sem acao, com lancamento_id) -> marca um lancamento como pago/pendente
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const adminId = auth.userId;

  try {
    const body = await req.json();

    if (body.lancamento_id) {
      if (body.status !== 'pago' && body.status !== 'pendente') {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin
        .from('comissao_lancamento')
        .update({ status: body.status, pago_em: body.status === 'pago' ? new Date().toISOString() : null })
        .eq('id', body.lancamento_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'comissao_lancamento', entidadeId: body.lancamento_id,
        acao: `marcar_${body.status}`, depois: { status: body.status },
      });
      return NextResponse.json(data);
    }

    // Compatibilidade com o formato antigo { oficina_id, taxa_fixa_override, usa_override }
    const acao: string = body.acao || (body.oficina_id && 'usa_override' in body ? 'individual' : '');
    if (acao === 'individual' && !body.acao) {
      body.taxa = body.usa_override ? body.taxa_fixa_override : null;
    }

    if (acao === 'global') {
      const { servicos_modo, servicos_taxa, pecas_modo, pecas_taxa, motivo } = body;
      if (!MODOS.includes(servicos_modo) || !MODOS.includes(pecas_modo) || !taxaValida(servicos_taxa) || !taxaValida(pecas_taxa)) {
        return NextResponse.json({ error: 'Modo ou taxa inválidos (taxa entre 0% e 50%)' }, { status: 400 });
      }
      const antes = await lerPlataformaConfig(supabaseAdmin);
      const depois = {
        comissao_servicos_modo: servicos_modo,
        comissao_servicos_taxa: servicos_taxa,
        comissao_pecas_modo: pecas_modo,
        comissao_pecas_taxa: pecas_taxa,
      };
      const { error } = await supabaseAdmin
        .from('plataforma_config')
        .upsert({ id: 1, ...depois, updated_at: new Date().toISOString(), updated_by: adminId });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'plataforma_config', acao: 'alterar_comissao_global', antes, depois, motivo,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'individual') {
      const { oficina_id, taxa, ate, motivo } = body;
      if (!oficina_id) return NextResponse.json({ error: 'oficina_id obrigatório' }, { status: 400 });
      if (taxa != null && !taxaValida(taxa)) {
        return NextResponse.json({ error: 'Taxa inválida (entre 0% e 50%)' }, { status: 400 });
      }
      if (ate != null && ate !== '' && !dataValida(ate)) {
        return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
      }
      const { data: antes } = await supabaseAdmin
        .from('comissao_config')
        .select('usa_override, taxa_fixa_override, override_ate, override_motivo')
        .eq('oficina_id', oficina_id)
        .maybeSingle();
      const depois = taxa == null
        ? { usa_override: false, taxa_fixa_override: null, override_ate: null, override_motivo: null }
        : { usa_override: true, taxa_fixa_override: taxa, override_ate: ate || null, override_motivo: motivo?.trim() || null };
      const { error } = await supabaseAdmin
        .from('comissao_config')
        .upsert({ oficina_id, ...depois, updated_at: new Date().toISOString() }, { onConflict: 'oficina_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'oficina', entidadeId: oficina_id,
        acao: taxa == null ? 'remover_taxa_individual' : 'definir_taxa_individual', antes, depois, motivo,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'fundador') {
      const { oficina_id, loja_id, valor } = body;
      const tabela = oficina_id ? 'oficinas' : loja_id ? 'lojas_pecas' : null;
      const id = oficina_id || loja_id;
      if (!tabela || typeof valor !== 'boolean') {
        return NextResponse.json({ error: 'Informe oficina_id ou loja_id e valor' }, { status: 400 });
      }
      const { data: antes } = await supabaseAdmin.from(tabela).select('parceiro_fundador, parceiro_fundador_desde').eq('id', id).single();
      const depois = { parceiro_fundador: valor, parceiro_fundador_desde: valor ? (antes?.parceiro_fundador_desde || new Date().toISOString()) : null };
      const { error } = await supabaseAdmin.from(tabela).update(depois).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: oficina_id ? 'oficina' : 'loja', entidadeId: id,
        acao: valor ? 'marcar_fundador' : 'desmarcar_fundador', antes, depois, motivo: body.motivo,
      });
      return NextResponse.json({ ok: true });
    }

    if (acao === 'oferta_fundadores') {
      const { taxa, ate, motivo } = body;
      if (!taxaValida(taxa)) return NextResponse.json({ error: 'Taxa inválida (entre 0% e 50%)' }, { status: 400 });
      if (ate != null && ate !== '' && !dataValida(ate)) return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
      const { data: fundadoras } = await supabaseAdmin.from('oficinas').select('id').eq('parceiro_fundador', true);
      const ids = (fundadoras || []).map((o) => o.id);
      if (ids.length === 0) return NextResponse.json({ error: 'Nenhuma oficina marcada como parceira fundadora' }, { status: 400 });
      const agora = new Date().toISOString();
      const { error } = await supabaseAdmin.from('comissao_config').upsert(
        ids.map((oficina_id) => ({
          oficina_id, usa_override: true, taxa_fixa_override: taxa,
          override_ate: ate || null, override_motivo: motivo?.trim() || 'Oferta parceiros fundadores', updated_at: agora,
        })),
        { onConflict: 'oficina_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await registrarAuditoria(supabaseAdmin, {
        adminId, entidade: 'oficina', acao: 'oferta_fundadores',
        depois: { taxa, ate: ate || null, oficinas: ids }, motivo,
      });
      return NextResponse.json({ ok: true, oficinas: ids.length });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Error updating comissao config:', error);
    return NextResponse.json({ error: 'Erro ao atualizar configuracao de comissao' }, { status: 500 });
  }
}
