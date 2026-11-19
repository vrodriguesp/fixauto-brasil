import type { SupabaseClient } from '@supabase/supabase-js';

// Migracao 074: antes de ser escolhida a oficina nao le o perfil do cliente; o
// nome/codigo/idioma vem de resumo_clientes, sem dados de contato.
// Migracao 086: a oficina nunca le a linha do cliente em profiles (a regra de linha
// era por perfil: quem atendeu o cliente uma vez via o telefone dele em todo pedido
// novo). O "cliente:profiles(...)" dos pedidos volta vazio para a oficina e:
// - completarClientes poe nome/codigo/foto/idioma (resumo_clientes);
// - completarContato poe telefone/e-mail SO nos pedidos em que o orcamento dela foi
//   aceito (contato_clientes, por pedido).
// Migracao 102 (dono 19/11): o NOME e a foto do cliente so chegam a oficina depois de o orcamento ser aceito -
// por pedido (resumo_clientes_pedidos, quando a linha e um pedido: lista, detalhe, formulario, conversa) ou,
// nas telas por cliente (avaliacoes, garantias, agenda), quando ha orcamento aceito com esse cliente. Antes
// disso vem so o codigo/idioma e as telas mostram "Cliente · codigo".
export async function completarClientes<T extends { id?: string | null; solicitacao_id?: string | null; cliente_id?: string | null; cliente?: any }>(sb: SupabaseClient, linhas: T[]): Promise<T[]> {
  const semCliente = linhas.filter((l) => !l.cliente && l.cliente_id);
  if (!semCliente.length) return linhas;
  // linha = pedido (tem id/solicitacao_id): regra por pedido
  const chavePedido = (l: T) => (l.solicitacao_id || l.id || null) as string | null;
  const sols = Array.from(new Set(semCliente.map(chavePedido).filter(Boolean) as string[]));
  const porSol = new Map<string, any>();
  if (sols.length) {
    const { data } = await sb.rpc('resumo_clientes_pedidos', { p_sols: sols });
    for (const c of (data as any[]) || []) porSol.set(c.solicitacao_id, { id: c.id, nome: c.nome, codigo: c.codigo, avatar_url: c.avatar_url, idioma: c.idioma, tipo: c.tipo });
  }
  const faltam = Array.from(new Set(semCliente.filter((l) => !porSol.has(chavePedido(l) || '')).map((l) => l.cliente_id as string)));
  const porId = new Map<string, any>();
  if (faltam.length) {
    const { data } = await sb.rpc('resumo_clientes', { p_ids: faltam });
    for (const c of (data as any[]) || []) porId.set(c.id, c);
  }
  return linhas.map((l) => {
    if (l.cliente || !l.cliente_id) return l;
    const c = porSol.get(chavePedido(l) || '') || porId.get(l.cliente_id);
    return c ? { ...l, cliente: c } : l;
  });
}

/**
 * Endereco completo e coordenadas exatas do pedido (migracao 102): a linha de solicitacoes guarda so a area e
 * ~1 km; a rua esta em solicitacoes_privado, que a RLS so devolve ao motorista do pedido, ao admin e a oficina
 * com orcamento ACEITO. Quem embute privado:solicitacoes_privado(endereco, latitude, longitude) passa por aqui.
 */
export function comEnderecoPrivado<T extends { endereco?: string | null; latitude?: number | null; longitude?: number | null; privado?: any }>(linhas: T[]): T[] {
  return linhas.map((l) => {
    const p = Array.isArray(l.privado) ? l.privado[0] : l.privado;
    if (!p) return l;
    return { ...l, endereco: p.endereco || l.endereco, latitude: p.latitude ?? l.latitude, longitude: p.longitude ?? l.longitude };
  });
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
