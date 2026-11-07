import type { SupabaseClient } from '@supabase/supabase-js';

// Migracao 074: a oficina so le o perfil completo do cliente (com telefone e
// e-mail) depois de ser escolhida. Antes disso, o "cliente:profiles(...)" dos
// pedidos volta vazio e o nome/codigo/idioma vem daqui, sem dados de contato.
export async function completarClientes<T extends { cliente_id?: string | null; cliente?: any }>(sb: SupabaseClient, linhas: T[]): Promise<T[]> {
  const faltam = Array.from(new Set(linhas.filter((l) => !l.cliente && l.cliente_id).map((l) => l.cliente_id as string)));
  if (!faltam.length) return linhas;
  const { data } = await sb.rpc('resumo_clientes', { p_ids: faltam });
  const porId = new Map(((data as any[]) || []).map((c) => [c.id, c]));
  return linhas.map((l) => (!l.cliente && l.cliente_id && porId.has(l.cliente_id) ? { ...l, cliente: porId.get(l.cliente_id) } : l));
}
