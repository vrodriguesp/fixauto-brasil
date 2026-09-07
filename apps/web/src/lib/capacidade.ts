import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Carga atual da oficina por tipo de servico: quantos eventos de agenda
 * ainda nao concluidos/cancelados existem, agrupados pelo tipo de servico
 * da solicitacao ligada. Usado tanto pro dashboard de capacidade da
 * oficina quanto pro roteamento de novas emergencias.
 */
export async function calcularCargaAtual(
  supabase: SupabaseClient,
  oficinaId: string
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('agenda')
    .select('solicitacao:solicitacoes(tipo)')
    .eq('oficina_id', oficinaId)
    .in('status', ['agendado', 'em_andamento']);

  const carga: Record<string, number> = {};
  for (const evento of data || []) {
    const tipo = (evento as any).solicitacao?.tipo;
    if (!tipo) continue;
    carga[tipo] = (carga[tipo] || 0) + 1;
  }
  return carga;
}

/**
 * True se a oficina ainda tem capacidade declarada livre pro tipo de
 * servico. Oficinas que nunca configuraram capacidade_servicos pro tipo
 * (0 ou ausente) sao tratadas como "sem limite definido" - nao bloqueia
 * quem nunca mexeu nessa configuracao.
 */
export async function oficinaTemCapacidade(
  supabase: SupabaseClient,
  oficina: { id: string; capacidade_servicos?: Record<string, number> | null },
  tipoServico: string
): Promise<boolean> {
  const limite = oficina.capacidade_servicos?.[tipoServico];
  if (!limite || limite <= 0) return true;

  const carga = await calcularCargaAtual(supabase, oficina.id);
  return (carga[tipoServico] || 0) < limite;
}
