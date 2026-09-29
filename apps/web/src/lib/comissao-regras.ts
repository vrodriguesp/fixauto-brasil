import { SupabaseClient } from '@supabase/supabase-js';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { recalcularComissaoPecasConfig } from '@/lib/comissao-pecas';

// Hierarquia da comissao - UNICO lugar que decide qual taxa vale:
//   1. taxa individual (definida pelo admin para aquela oficina/fornecedor),
//      enquanto estiver no prazo (override_ate NULL = sem prazo);
//   2. senao, a regra global (plataforma_config): isento (0%), fixa ou
//      desempenho (taxa calculada por resposta/revisoes/avaliacao/volume).
// Quem lanca comissao ou mostra a taxa usa daqui - nunca le
// comissao_config direto, senao a hierarquia se perde.

export type ModoComissao = 'isento' | 'fixa' | 'desempenho';
export type OrigemTaxa = 'individual' | 'global';

export interface PlataformaConfig {
  comissao_servicos_modo: ModoComissao;
  comissao_servicos_taxa: number;
  comissao_pecas_modo: ModoComissao;
  comissao_pecas_taxa: number;
  updated_at?: string;
}

export interface TaxaEfetiva {
  taxa: number;
  origem: OrigemTaxa;
  /** Regra global em vigor (mesmo quando a individual e que vale) */
  modoGlobal: ModoComissao;
  taxaGlobal: number | null;
  /** Prazo e motivo da taxa individual, quando ela e a que vale */
  ate: string | null;
  motivo: string | null;
}

export const CONFIG_PADRAO: PlataformaConfig = {
  comissao_servicos_modo: 'isento',
  comissao_servicos_taxa: 0.1,
  comissao_pecas_modo: 'isento',
  comissao_pecas_taxa: 0.03,
};

export async function lerPlataformaConfig(supabaseAdmin: SupabaseClient): Promise<PlataformaConfig> {
  const { data } = await supabaseAdmin.from('plataforma_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return CONFIG_PADRAO;
  return {
    comissao_servicos_modo: data.comissao_servicos_modo,
    comissao_servicos_taxa: Number(data.comissao_servicos_taxa),
    comissao_pecas_modo: data.comissao_pecas_modo,
    comissao_pecas_taxa: Number(data.comissao_pecas_taxa),
    updated_at: data.updated_at,
  };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A taxa individual vale hoje? (ativa, com valor e dentro do prazo) */
export function individualVigente(
  cfg: { usa_override?: boolean | null; taxa_fixa_override?: number | string | null; override_ate?: string | null } | null | undefined
): boolean {
  if (!cfg?.usa_override || cfg.taxa_fixa_override == null) return false;
  return !cfg.override_ate || cfg.override_ate >= hojeISO();
}

function individual(cfg: any, global: { modo: ModoComissao; taxa: number }): TaxaEfetiva {
  return {
    taxa: Number(cfg.taxa_fixa_override),
    origem: 'individual',
    modoGlobal: global.modo,
    taxaGlobal: global.modo === 'fixa' ? global.taxa : global.modo === 'isento' ? 0 : null,
    ate: cfg.override_ate || null,
    motivo: cfg.override_motivo || null,
  };
}

export async function taxaEfetivaServicos(supabaseAdmin: SupabaseClient, oficinaId: string): Promise<TaxaEfetiva> {
  const [{ data: cfg }, pc] = await Promise.all([
    supabaseAdmin
      .from('comissao_config')
      .select('usa_override, taxa_fixa_override, override_ate, override_motivo')
      .eq('oficina_id', oficinaId)
      .maybeSingle(),
    lerPlataformaConfig(supabaseAdmin),
  ]);
  const global = { modo: pc.comissao_servicos_modo, taxa: pc.comissao_servicos_taxa };
  if (individualVigente(cfg)) return individual(cfg, global);

  let taxa = 0;
  if (global.modo === 'fixa') taxa = global.taxa;
  else if (global.modo === 'desempenho') taxa = (await recalcularComissaoConfig(supabaseAdmin, oficinaId)).taxa;

  return {
    taxa,
    origem: 'global',
    modoGlobal: global.modo,
    taxaGlobal: global.modo === 'desempenho' ? null : taxa,
    ate: null,
    motivo: null,
  };
}

export async function taxaEfetivaPecas(
  supabaseAdmin: SupabaseClient,
  fornecedorTipo: 'loja' | 'oficina',
  fornecedorId: string
): Promise<TaxaEfetiva> {
  const [{ data: cfg }, pc] = await Promise.all([
    supabaseAdmin
      .from('comissao_pecas_config')
      .select('usa_override, taxa_fixa_override, override_ate, override_motivo')
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq('fornecedor_id', fornecedorId)
      .maybeSingle(),
    lerPlataformaConfig(supabaseAdmin),
  ]);
  const global = { modo: pc.comissao_pecas_modo, taxa: pc.comissao_pecas_taxa };
  if (individualVigente(cfg)) return individual(cfg, global);

  let taxa = 0;
  if (global.modo === 'fixa') taxa = global.taxa;
  else if (global.modo === 'desempenho') taxa = (await recalcularComissaoPecasConfig(supabaseAdmin, fornecedorTipo, fornecedorId)).taxa;

  return {
    taxa,
    origem: 'global',
    modoGlobal: global.modo,
    taxaGlobal: global.modo === 'desempenho' ? null : taxa,
    ate: null,
    motivo: null,
  };
}
