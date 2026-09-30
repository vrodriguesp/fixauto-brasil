import { SupabaseClient } from '@supabase/supabase-js';
import { COMISSAO_CONFIG, COMISSAO_PECAS_CONFIG } from '@fixauto/shared';
import { recalcularComissaoConfig } from '@/lib/comissao';
import { recalcularComissaoPecasConfig } from '@/lib/comissao-pecas';
import { currencyForCountry } from '@/lib/currency';

// Hierarquia da comissao - UNICO lugar que decide o que vale:
//   1. condicao individual (definida pelo admin para aquela oficina/fornecedor),
//      enquanto estiver no prazo (override_ate NULL = sem prazo): percentual
//      ou valor fixo por servico;
//   2. senao, a regra global (plataforma_config):
//        isento      -> nada
//        fixa        -> o mesmo percentual para todos
//        desempenho  -> percentual pelo desempenho, dentro da faixa min..max
//                       escolhida pelo admin (ex.: 1%..5%)
//        por_servico -> valor fixo por servico concluido, por moeda (so servicos)
// Quem lanca comissao ou mostra a condicao usa daqui - nunca le
// comissao_config direto, senao a hierarquia se perde.

export type ModoComissao = 'isento' | 'fixa' | 'desempenho' | 'por_servico';
export type OrigemTaxa = 'individual' | 'global';
export type TipoCobranca = 'percentual' | 'valor_fixo';

export interface PlataformaConfig {
  comissao_servicos_modo: ModoComissao;
  comissao_servicos_taxa: number;
  comissao_servicos_min: number;
  comissao_servicos_max: number;
  /** Valor fixo por servico, por moeda da oficina ({ EUR: 5, BRL: 25 }) */
  comissao_servicos_valor_por_moeda: Record<string, number>;
  comissao_pecas_modo: ModoComissao;
  comissao_pecas_taxa: number;
  comissao_pecas_min: number;
  comissao_pecas_max: number;
  updated_at?: string;
}

export interface TaxaEfetiva {
  tipo: TipoCobranca;
  /** Percentual (0..0.5). Quando tipo = valor_fixo, 0 - use valorFixo. */
  taxa: number;
  /** Valor fixo por servico concluido, na moeda da oficina */
  valorFixo: number | null;
  moeda: string | null;
  origem: OrigemTaxa;
  /** Regra global em vigor (mesmo quando a individual e que vale) */
  modoGlobal: ModoComissao;
  taxaGlobal: number | null;
  faixaGlobal: { min: number; max: number } | null;
  /** Prazo e motivo da condicao individual, quando ela e a que vale */
  ate: string | null;
  motivo: string | null;
}

export const CONFIG_PADRAO: PlataformaConfig = {
  comissao_servicos_modo: 'isento',
  comissao_servicos_taxa: 0.1,
  comissao_servicos_min: 0.01,
  comissao_servicos_max: 0.05,
  comissao_servicos_valor_por_moeda: {},
  comissao_pecas_modo: 'isento',
  comissao_pecas_taxa: 0.03,
  comissao_pecas_min: 0.01,
  comissao_pecas_max: 0.03,
};

const num = (v: unknown, padrao: number) => (v == null || v === '' || !Number.isFinite(Number(v)) ? padrao : Number(v));

export async function lerPlataformaConfig(supabaseAdmin: SupabaseClient): Promise<PlataformaConfig> {
  const { data } = await supabaseAdmin.from('plataforma_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return CONFIG_PADRAO;
  const valores: Record<string, number> = {};
  Object.entries((data.comissao_servicos_valor_por_moeda as Record<string, unknown>) || {}).forEach(([m, v]) => {
    if (Number.isFinite(Number(v))) valores[m] = Number(v);
  });
  return {
    comissao_servicos_modo: data.comissao_servicos_modo,
    comissao_servicos_taxa: num(data.comissao_servicos_taxa, CONFIG_PADRAO.comissao_servicos_taxa),
    comissao_servicos_min: num(data.comissao_servicos_min, CONFIG_PADRAO.comissao_servicos_min),
    comissao_servicos_max: num(data.comissao_servicos_max, CONFIG_PADRAO.comissao_servicos_max),
    comissao_servicos_valor_por_moeda: valores,
    comissao_pecas_modo: data.comissao_pecas_modo,
    comissao_pecas_taxa: num(data.comissao_pecas_taxa, CONFIG_PADRAO.comissao_pecas_taxa),
    comissao_pecas_min: num(data.comissao_pecas_min, CONFIG_PADRAO.comissao_pecas_min),
    comissao_pecas_max: num(data.comissao_pecas_max, CONFIG_PADRAO.comissao_pecas_max),
    updated_at: data.updated_at,
  };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type CfgIndividual = {
  usa_override?: boolean | null;
  taxa_fixa_override?: number | string | null;
  override_tipo?: string | null;
  valor_fixo_override?: number | string | null;
  override_ate?: string | null;
  override_motivo?: string | null;
} | null | undefined;

/** A condicao individual vale hoje? (ativa, com valor e dentro do prazo) */
export function individualVigente(cfg: CfgIndividual): boolean {
  if (!cfg?.usa_override) return false;
  const temValor = cfg.override_tipo === 'valor_fixo' ? cfg.valor_fixo_override != null : cfg.taxa_fixa_override != null;
  if (!temValor) return false;
  return !cfg.override_ate || cfg.override_ate >= hojeISO();
}

/**
 * A taxa por desempenho e calculada numa escala propria (base: 5%..15% em
 * servicos, 1%..3% em pecas - menor = melhor desempenho). Aqui ela e levada,
 * na mesma proporcao, para a faixa que o admin escolheu (ex.: 1%..5%).
 */
export function naFaixa(taxaCalculada: number, escala: { TAXA_MIN: number; TAXA_MAX: number }, min: number, max: number): number {
  const amplitude = escala.TAXA_MAX - escala.TAXA_MIN;
  const pos = amplitude > 0 ? Math.min(1, Math.max(0, (taxaCalculada - escala.TAXA_MIN) / amplitude)) : 1;
  return Math.round((min + pos * (max - min)) * 10000) / 10000;
}

/** Quanto se cobra por um servico/pedido de `valor`, pela condicao que vale. */
export function valorDaComissao(info: Pick<TaxaEfetiva, 'tipo' | 'taxa' | 'valorFixo'>, valor: number): number {
  const bruto = info.tipo === 'valor_fixo' ? Math.min(info.valorFixo || 0, valor) : valor * info.taxa;
  return Math.max(0, Math.round(bruto * 100) / 100);
}

/** Condicao de servicos de uma oficina (sincrono - dados ja carregados). */
export function resolverServicos(cfg: CfgIndividual, pc: PlataformaConfig, moeda: string, taxaCalculada: number | null): TaxaEfetiva {
  const modo = pc.comissao_servicos_modo;
  const faixa = { min: pc.comissao_servicos_min, max: pc.comissao_servicos_max };
  const valorGlobal = pc.comissao_servicos_valor_por_moeda[moeda];
  const base = {
    moeda,
    modoGlobal: modo,
    taxaGlobal: modo === 'fixa' ? pc.comissao_servicos_taxa : modo === 'isento' ? 0 : null,
    faixaGlobal: modo === 'desempenho' ? faixa : null,
  };

  if (individualVigente(cfg)) {
    const fixo = cfg!.override_tipo === 'valor_fixo';
    return {
      ...base,
      tipo: fixo ? 'valor_fixo' : 'percentual',
      taxa: fixo ? 0 : Number(cfg!.taxa_fixa_override),
      valorFixo: fixo ? Number(cfg!.valor_fixo_override) : null,
      origem: 'individual',
      ate: cfg!.override_ate || null,
      motivo: cfg!.override_motivo || null,
    };
  }

  const global = { ...base, origem: 'global' as const, ate: null, motivo: null };
  if (modo === 'por_servico') {
    // sem valor definido para a moeda desta oficina -> nada a cobrar
    return { ...global, tipo: 'valor_fixo', taxa: 0, valorFixo: valorGlobal != null ? valorGlobal : 0 };
  }
  let taxa = 0;
  if (modo === 'fixa') taxa = pc.comissao_servicos_taxa;
  else if (modo === 'desempenho') taxa = naFaixa(taxaCalculada ?? COMISSAO_CONFIG.TAXA_BASE, COMISSAO_CONFIG, faixa.min, faixa.max);
  return { ...global, tipo: 'percentual', taxa, valorFixo: null };
}

/** Condicao de pecas de um fornecedor (sincrono). Pecas: so percentual. */
export function resolverPecas(cfg: CfgIndividual, pc: PlataformaConfig, taxaCalculada: number | null): TaxaEfetiva {
  const modo = pc.comissao_pecas_modo;
  const faixa = { min: pc.comissao_pecas_min, max: pc.comissao_pecas_max };
  const base = {
    tipo: 'percentual' as const,
    valorFixo: null,
    moeda: null,
    modoGlobal: modo,
    taxaGlobal: modo === 'fixa' ? pc.comissao_pecas_taxa : modo === 'isento' ? 0 : null,
    faixaGlobal: modo === 'desempenho' ? faixa : null,
  };
  if (individualVigente(cfg)) {
    return { ...base, taxa: Number(cfg!.taxa_fixa_override), origem: 'individual', ate: cfg!.override_ate || null, motivo: cfg!.override_motivo || null };
  }
  let taxa = 0;
  if (modo === 'fixa') taxa = pc.comissao_pecas_taxa;
  else if (modo === 'desempenho') taxa = naFaixa(taxaCalculada ?? COMISSAO_PECAS_CONFIG.TAXA_BASE, COMISSAO_PECAS_CONFIG, faixa.min, faixa.max);
  return { ...base, taxa, origem: 'global', ate: null, motivo: null };
}

export async function taxaEfetivaServicos(supabaseAdmin: SupabaseClient, oficinaId: string): Promise<TaxaEfetiva> {
  const [{ data: cfg }, { data: oficina }, pc] = await Promise.all([
    supabaseAdmin
      .from('comissao_config')
      .select('usa_override, taxa_fixa_override, override_tipo, valor_fixo_override, override_ate, override_motivo')
      .eq('oficina_id', oficinaId)
      .maybeSingle(),
    supabaseAdmin.from('oficinas').select('pais').eq('id', oficinaId).maybeSingle(),
    lerPlataformaConfig(supabaseAdmin),
  ]);
  const moeda = currencyForCountry(oficina?.pais);
  const precisaCalcular = !individualVigente(cfg) && pc.comissao_servicos_modo === 'desempenho';
  const calculada = precisaCalcular ? (await recalcularComissaoConfig(supabaseAdmin, oficinaId)).taxa : null;
  return resolverServicos(cfg, pc, moeda, calculada);
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
  const precisaCalcular = !individualVigente(cfg) && pc.comissao_pecas_modo === 'desempenho';
  const calculada = precisaCalcular ? (await recalcularComissaoPecasConfig(supabaseAdmin, fornecedorTipo, fornecedorId)).taxa : null;
  return resolverPecas(cfg, pc, calculada);
}
