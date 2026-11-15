import type { SupabaseClient } from '@supabase/supabase-js';

// Migracao 074: antes de ser escolhida a oficina nao le o perfil do cliente; o
// nome/codigo/idioma vem de resumo_clientes, sem dados de contato.
// Migracao 086: a oficina nunca le a linha do cliente em profiles (a regra de linha
// era por perfil: quem atendeu o cliente uma vez via o telefone dele em todo pedido
// novo). O "cliente:profiles(...)" dos pedidos volta vazio para a oficina e:
// - completarClientes poe nome/codigo/foto/idioma (resumo_clientes);
// - completarContato poe telefone/e-mail SO nos pedidos em que o orcamento dela foi
//   aceito (contato_clientes, por pedido).
export async function completarClientes<T extends { cliente_id?: string | null; cliente?: any }>(sb: SupabaseClient, linhas: T[]): Promise<T[]> {
  const faltam = Array.from(new Set(linhas.filter((l) => !l.cliente && l.cliente_id).map((l) => l.cliente_id as string)));
  if (!faltam.length) return linhas;
  const { data } = await sb.rpc('resumo_clientes', { p_ids: faltam });
  const porId = new Map(((data as any[]) || []).map((c) => [c.id, c]));
  return linhas.map((l) => (!l.cliente && l.cliente_id && porId.has(l.cliente_id) ? { ...l, cliente: porId.get(l.cliente_id) } : l));
}

/** Telefone e e-mail do cliente, pedido a pedido (so onde a oficina foi escolhida - 086). */
export async function completarContato<T extends { id?: string | null; cliente_id?: string | null; cliente?: any }>(sb: SupabaseClient, linhas: T[]): Promise<T[]> {
  const ids = Array.from(new Set(linhas.map((l) => l.id).filter(Boolean) as string[]));
  if (!ids.length) return linhas;
  const { data } = await sb.rpc('contato_clientes', { p_sols: ids });
  const porSol = new Map(((data as any[]) || []).map((c) => [c.solicitacao_id, c]));
  return linhas.map((l) => {
    const c = l.id ? porSol.get(l.id) : null;
    // sem contato liberado neste pedido: o que vier no cliente nao traz telefone/e-mail
    const base = l.cliente ? { ...l.cliente, telefone: null, email: null } : l.cliente;
    if (!c) return { ...l, cliente: base };
    return { ...l, cliente: { ...(base || { id: c.cliente_id }), telefone: c.telefone ?? null, email: c.email ?? null } };
  });
}

/** Clientes da oficina: nome (resumo_clientes) e contato por pedido (contato_clientes). */
export async function completarClientesEContato<T extends { id?: string | null; cliente_id?: string | null; cliente?: any }>(sb: SupabaseClient, linhas: T[]): Promise<T[]> {
  return completarContato(sb, await completarClientes(sb, linhas));
}
