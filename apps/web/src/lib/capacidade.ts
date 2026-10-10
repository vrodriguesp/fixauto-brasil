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
 * Carga atual POR FUNCIONARIO: quantos veiculos em_andamento estao
 * atribuidos a cada mecanico da oficina agora. Complementa
 * calcularCargaAtual (que e por tipo de servico, na oficina como um todo)
 * pra dar ao admin visao de como distribuir a capacidade entre a equipe.
 */
export async function calcularCargaPorFuncionario(
  supabase: SupabaseClient,
  oficinaId: string
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('agenda')
    .select('funcionario_id')
    .eq('oficina_id', oficinaId)
    .eq('status', 'em_andamento')
    .not('funcionario_id', 'is', null);

  const carga: Record<string, number> = {};
  for (const evento of data || []) {
    const id = (evento as any).funcionario_id;
    if (!id) continue;
    carga[id] = (carga[id] || 0) + 1;
  }
  return carga;
}

/** Carros que a oficina tem agora (na oficina ou agendados ate hoje), de todos os tipos. */
export async function cargaTotalAtual(supabase: SupabaseClient, oficinaId: string): Promise<number> {
  const fimDeHoje = new Date(); fimDeHoje.setUTCHours(23, 59, 59, 999);
  const { count } = await supabase.from('agenda').select('id', { count: 'exact', head: true })
    .eq('oficina_id', oficinaId)
    .or(`status.eq.em_andamento,and(status.eq.agendado,data_inicio.lte.${fimDeHoje.toISOString()})`);
  return count || 0;
}

/**
 * True se a oficina ainda tem capacidade livre: o limite do tipo de servico
 * (capacidade_servicos) E o limite geral da oficina (capacidade_total,
 * migracao 057). Limite vazio/0 = sem limite - nao bloqueia quem nunca
 * mexeu nessa configuracao.
 */
export async function oficinaTemCapacidade(
  supabase: SupabaseClient,
  oficina: { id: string; capacidade_servicos?: Record<string, number> | null; capacidade_total?: number | null },
  tipoServico: string
): Promise<boolean> {
  const total = oficina.capacidade_total;
  if (total && total > 0 && (await cargaTotalAtual(supabase, oficina.id)) >= total) return false;
  const limite = oficina.capacidade_servicos?.[tipoServico];
  if (!limite || limite <= 0) return true;

  const carga = await calcularCargaAtual(supabase, oficina.id);
  return (carga[tipoServico] || 0) < limite;
}
