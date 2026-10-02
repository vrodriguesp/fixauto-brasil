import { supabaseAdmin } from './supabase-admin';

// Checagens de relacao para rotas que usam a service role (a mesma regra
// das politicas RLS da migracao 028, feita aqui em TypeScript porque a
// service role ignora RLS). OWASP API1 (BOLA): o id no corpo nunca basta.

export async function ehAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('profiles').select('tipo, ativo').eq('id', userId).maybeSingle();
  return data?.tipo === 'admin' && data.ativo !== false;
}

/** Oficinas de que a pessoa e dona ou funcionaria ativa. */
export async function oficinasDoUsuario(userId: string): Promise<string[]> {
  const [{ data: donas }, { data: func }] = await Promise.all([
    supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId),
    supabaseAdmin.from('funcionarios').select('oficina_id').eq('profile_id', userId).eq('ativo', true),
  ]);
  return Array.from(new Set([...(donas || []).map((o) => o.id), ...(func || []).map((f) => f.oficina_id)]));
}

export async function oficinaDoUsuarioEhDona(userId: string, oficinaId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('oficinas').select('id').eq('id', oficinaId).eq('profile_id', userId).maybeSingle();
  return !!data;
}

async function oficinaEnvolvida(oficinas: string[], solicitacaoId: string): Promise<boolean> {
  if (oficinas.length === 0) return false;
  const [{ data: orc }, { data: ag }] = await Promise.all([
    supabaseAdmin.from('orcamentos').select('id').eq('solicitacao_id', solicitacaoId).in('oficina_id', oficinas).limit(1),
    supabaseAdmin.from('agenda').select('id').eq('solicitacao_id', solicitacaoId).in('oficina_id', oficinas).limit(1),
  ]);
  return !!(orc?.length || ag?.length);
}

/** Cliente dono, oficina envolvida ou admin (conversa, audio). */
export async function participaDaSolicitacao(userId: string, solicitacaoId: string): Promise<boolean> {
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('cliente_id').eq('id', solicitacaoId).maybeSingle();
  if (!sol) return false;
  if (sol.cliente_id === userId) return true;
  if (await oficinaEnvolvida(await oficinasDoUsuario(userId), solicitacaoId)) return true;
  return ehAdmin(userId);
}

/** Conversa de UMA oficina com o cliente: o cliente, essa oficina (dono ou funcionario) ou admin. */
export async function participaDaConversa(userId: string, solicitacaoId: string, oficinaId: string, pagadorId?: string | null): Promise<boolean> {
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('cliente_id').eq('id', solicitacaoId).maybeSingle();
  if (!sol) return false;
  // conversa do responsavel pelo pagamento: ele, a oficina ou admin (o cliente nao)
  if (pagadorId ? pagadorId === userId : sol.cliente_id === userId) return true;
  if ((await oficinasDoUsuario(userId)).includes(oficinaId)) return true;
  return ehAdmin(userId);
}

/** Como acima, mais qualquer oficina enquanto o pedido esta aberto a orcamentos. */
export async function podeVerSolicitacao(userId: string, solicitacaoId: string): Promise<boolean> {
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('cliente_id, status').eq('id', solicitacaoId).maybeSingle();
  if (!sol) return false;
  if (sol.cliente_id === userId) return true;
  const oficinas = await oficinasDoUsuario(userId);
  if (oficinas.length && ['aberta', 'em_orcamento'].includes(sol.status)) return true;
  if (await oficinaEnvolvida(oficinas, solicitacaoId)) return true;
  return ehAdmin(userId);
}
