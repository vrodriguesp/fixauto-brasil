import { SupabaseClient } from '@supabase/supabase-js';
import { COMISSAO_PECAS_CONFIG } from '@fixauto/shared';
import type { TipoFornecedorPeca } from '@fixauto/shared';

const JANELA_DIAS = 90;

// Bonus de volume/fidelidade nos ultimos 90 dias - mesma logica de
// lib/comissao.ts (fase de retencao de oficinas), aplicada aqui pro
// fornecedor de peca (loja ou oficina que vende excedente).
const BONUS_VOLUME = [
  { minPedidos: 15, bonus: 0.005 },
  { minPedidos: 5, bonus: 0.0025 },
];

export interface TaxaComissaoPecasInfo {
  taxa: number;
  pedidos90dias: number;
  origem: 'override' | 'calculada';
}

function clamp(taxa: number): number {
  const limitada = Math.min(COMISSAO_PECAS_CONFIG.TAXA_MAX, Math.max(COMISSAO_PECAS_CONFIG.TAXA_MIN, taxa));
  return Math.round(limitada * 10000) / 10000;
}

/**
 * Recalcula e grava em comissao_pecas_config a taxa de um fornecedor de
 * peca (loja_pecas ou oficina fornecedora), a partir do tempo medio de
 * resposta a cotacoes e do volume de pedidos entregues nos ultimos 90
 * dias. Chamar depois que uma resposta e enviada ou um pedido e entregue.
 */
export async function recalcularComissaoPecasConfig(
  supabaseAdmin: SupabaseClient,
  fornecedorTipo: TipoFornecedorPeca,
  fornecedorId: string
): Promise<TaxaComissaoPecasInfo> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const colunaFornecedor = fornecedorTipo === 'loja' ? 'loja_id' : 'oficina_fornecedora_id';

  const [{ data: existingConfig }, { data: respostas }, { count: pedidos90Count }] = await Promise.all([
    supabaseAdmin
      .from('comissao_pecas_config')
      .select('*')
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq('fornecedor_id', fornecedorId)
      .single(),
    supabaseAdmin
      .from('cotacoes_pecas_respostas')
      .select('created_at, cotacao:cotacoes_pecas(created_at)')
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq(colunaFornecedor, fornecedorId)
      .gte('created_at', desde),
    supabaseAdmin
      .from('pedidos_pecas')
      .select('*', { count: 'exact', head: true })
      .eq('fornecedor_tipo', fornecedorTipo)
      .eq(colunaFornecedor, fornecedorId)
      .eq('status', 'entregue')
      .gte('created_at', desde),
  ]);

  if (existingConfig?.usa_override && existingConfig.taxa_fixa_override != null) {
    return { taxa: existingConfig.taxa_fixa_override, pedidos90dias: 0, origem: 'override' };
  }

  const resps = respostas || [];
  const temposResposta = resps
    .map((r: any) => {
      const cotacaoCriada = r.cotacao?.created_at;
      if (!cotacaoCriada) return null;
      return (new Date(r.created_at).getTime() - new Date(cotacaoCriada).getTime()) / 3600000;
    })
    .filter((h: number | null): h is number => h != null && h >= 0);

  const mediaTempoResposta = temposResposta.length > 0
    ? temposResposta.reduce((s: number, h: number) => s + h, 0) / temposResposta.length
    : 0;

  const totalPedidos90 = pedidos90Count || 0;

  let taxa: number = COMISSAO_PECAS_CONFIG.TAXA_BASE;

  if (mediaTempoResposta > 0 && mediaTempoResposta < 2) taxa -= COMISSAO_PECAS_CONFIG.BONUS_RESPOSTA_2H;
  else if (mediaTempoResposta > 0 && mediaTempoResposta < 6) taxa -= COMISSAO_PECAS_CONFIG.BONUS_RESPOSTA_6H;

  const bonusVolume = BONUS_VOLUME.find((b) => totalPedidos90 >= b.minPedidos);
  if (bonusVolume) taxa -= bonusVolume.bonus;

  taxa = clamp(taxa);

  await supabaseAdmin.from('comissao_pecas_config').upsert(
    {
      fornecedor_tipo: fornecedorTipo,
      fornecedor_id: fornecedorId,
      taxa_padrao: COMISSAO_PECAS_CONFIG.TAXA_BASE,
      taxa_calculada: taxa,
      media_tempo_resposta_horas: Math.round(mediaTempoResposta * 100) / 100,
      total_pedidos_90dias: totalPedidos90,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fornecedor_tipo,fornecedor_id' }
  );

  return { taxa, pedidos90dias: totalPedidos90, origem: 'calculada' };
}

/** So le a taxa atual (sem recalcular) - usa quando so precisa do numero rapido. */
export async function obterTaxaComissaoPecas(
  supabaseAdmin: SupabaseClient,
  fornecedorTipo: TipoFornecedorPeca,
  fornecedorId: string
): Promise<TaxaComissaoPecasInfo> {
  const { data: config } = await supabaseAdmin
    .from('comissao_pecas_config')
    .select('taxa_calculada, taxa_fixa_override, usa_override')
    .eq('fornecedor_tipo', fornecedorTipo)
    .eq('fornecedor_id', fornecedorId)
    .single();

  if (config?.usa_override && config.taxa_fixa_override != null) {
    return { taxa: config.taxa_fixa_override, pedidos90dias: 0, origem: 'override' };
  }
  if (config?.taxa_calculada != null) {
    return { taxa: config.taxa_calculada, pedidos90dias: 0, origem: 'calculada' };
  }
  return recalcularComissaoPecasConfig(supabaseAdmin, fornecedorTipo, fornecedorId);
}
