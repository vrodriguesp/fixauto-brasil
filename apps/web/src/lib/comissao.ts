import { SupabaseClient } from '@supabase/supabase-js';
import { COMISSAO_CONFIG } from '@fixauto/shared';

const JANELA_DIAS = 90;

// Bonus adicional por volume/fidelidade nos ultimos 90 dias - alem dos
// bonus de performance (resposta rapida, poucas revisoes, boa avaliacao)
// que ja existiam no design (COMISSAO_CONFIG) mas nunca tinham sido de
// fato calculados. Incentiva a oficina a manter o fluxo de servicos
// passando pela plataforma, nao so a atender bem quando aparece um.
const BONUS_VOLUME = [
  { minServicos: 25, bonus: 0.02 },
  { minServicos: 10, bonus: 0.01 },
];

export interface TaxaComissaoInfo {
  taxa: number;
  servicos90dias: number;
  origem: 'calculada';
}

function clamp(taxa: number): number {
  const limitada = Math.min(COMISSAO_CONFIG.TAXA_MAX, Math.max(COMISSAO_CONFIG.TAXA_MIN, taxa));
  return Math.round(limitada * 10000) / 10000;
}

/**
 * Recalcula e grava em comissao_config a taxa de uma oficina, a partir de
 * dados reais: tempo medio de resposta a solicitacoes, media de revisoes
 * por orcamento, media de avaliacao dos clientes e volume de servicos nos
 * ultimos 90 dias. Chamar depois de qualquer evento que mude uma dessas
 * metricas (orcamento enviado/revisado, servico concluido, nova avaliacao).
 *
 * E so a taxa "por desempenho". Qual taxa vale de fato (individual do
 * admin > regra global) e decidido em lib/comissao-regras.ts.
 */
export async function recalcularComissaoConfig(
  supabaseAdmin: SupabaseClient,
  oficinaId: string
): Promise<TaxaComissaoInfo> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: orcamentos }, { data: oficina }, { count: servicos90Count }] = await Promise.all([
    supabaseAdmin
      .from('orcamentos')
      .select('created_at, revisao_numero, solicitacao:solicitacoes(created_at)')
      .eq('oficina_id', oficinaId)
      .gte('created_at', desde),
    supabaseAdmin.from('oficinas').select('avaliacao_media').eq('id', oficinaId).single(),
    supabaseAdmin
      .from('comissao_lancamento')
      .select('*', { count: 'exact', head: true })
      .eq('oficina_id', oficinaId)
      .gte('created_at', desde),
  ]);

  const orcs = orcamentos || [];
  const temposResposta = orcs
    .map((o: any) => {
      const solCriada = o.solicitacao?.created_at;
      if (!solCriada) return null;
      return (new Date(o.created_at).getTime() - new Date(solCriada).getTime()) / 3600000;
    })
    .filter((h: number | null): h is number => h != null && h >= 0);

  const mediaTempoResposta = temposResposta.length > 0
    ? temposResposta.reduce((s: number, h: number) => s + h, 0) / temposResposta.length
    : 0;

  const mediaRevisoes = orcs.length > 0
    ? orcs.reduce((s: number, o: any) => s + (o.revisao_numero || 0), 0) / orcs.length
    : 0;

  const mediaAvaliacao = oficina?.avaliacao_media || 0;
  const totalServicos90 = servicos90Count || 0;

  let taxa: number = COMISSAO_CONFIG.TAXA_BASE;

  if (mediaTempoResposta > 0 && mediaTempoResposta < 2) taxa -= COMISSAO_CONFIG.BONUS_RESPOSTA_2H;
  else if (mediaTempoResposta > 0 && mediaTempoResposta < 4) taxa -= COMISSAO_CONFIG.BONUS_RESPOSTA_4H;

  if (mediaRevisoes < 1.0 && orcs.length > 0) taxa -= (COMISSAO_CONFIG.BONUS_REVISAO_1_5 + COMISSAO_CONFIG.BONUS_REVISAO_1_0);
  else if (mediaRevisoes < 1.5 && orcs.length > 0) taxa -= COMISSAO_CONFIG.BONUS_REVISAO_1_5;

  if (mediaAvaliacao >= 4.5) taxa -= COMISSAO_CONFIG.BONUS_AVALIACAO_4_5;
  else if (mediaAvaliacao >= 4.0) taxa -= COMISSAO_CONFIG.BONUS_AVALIACAO_4_0;

  const bonusVolume = BONUS_VOLUME.find((b) => totalServicos90 >= b.minServicos);
  if (bonusVolume) taxa -= bonusVolume.bonus;

  taxa = clamp(taxa);

  await supabaseAdmin.from('comissao_config').upsert(
    {
      oficina_id: oficinaId,
      taxa_padrao: COMISSAO_CONFIG.TAXA_BASE,
      taxa_calculada: taxa,
      media_tempo_resposta_horas: Math.round(mediaTempoResposta * 100) / 100,
      media_revisoes_orcamento: Math.round(mediaRevisoes * 100) / 100,
      media_avaliacao_clientes: Math.round(mediaAvaliacao * 100) / 100,
      total_servicos_concluidos: totalServicos90,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'oficina_id' }
  );

  return { taxa, servicos90dias: totalServicos90, origem: 'calculada' };
}
