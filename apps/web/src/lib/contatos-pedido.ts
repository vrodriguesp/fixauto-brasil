import { supabaseAdmin } from './supabase-admin';

// Historico de contato com as oficinas de um pedido, para o admin (dono 16/11: "colocar
// no admin para eu acompanhar"). Tudo das tabelas existentes, com data: avisos do sino
// (e o resultado do e-mail gravado neles), convites, links de acesso (089: enviado,
// aberto, entrou), orcamentos e "nao tenho interesse" (motivo e origem painel/e-mail).
// Limite conhecido: uma dispensa desfeita, ou apagada quando a oficina orca, some daqui.
export type TipoEvento = 'avisada' | 'convidada' | 'lembrada' | 'link_enviado' | 'link_visto' | 'link_entrou' | 'orcou' | 'dispensou';
export type ContatoOficina = { oficina_id: string; nome: string; eventos: { tipo: TipoEvento; em: string; detalhe?: string }[] };

const TIPO_AVISO: Record<string, TipoEvento> = { nova_solicitacao: 'avisada', pedido_convite: 'convidada', cobranca_admin_solicitacao: 'lembrada' };

export async function contatosDoPedido(solicitacaoId: string): Promise<ContatoOficina[]> {
  const [{ data: avisos }, { data: convites }, { data: links }, { data: orcs }, { data: disps }] = await Promise.all([
    supabaseAdmin.from('notificacoes').select('profile_id, tipo, created_at, dados').eq('dados->>solicitacao_id', solicitacaoId).in('tipo', Object.keys(TIPO_AVISO)),
    supabaseAdmin.from('pedido_convites').select('oficina_id, origem, created_at').eq('solicitacao_id', solicitacaoId),
    supabaseAdmin.from('links_acesso').select('oficina_id, criado_em, visto_em, usado_em').eq('solicitacao_id', solicitacaoId).eq('finalidade', 'oficina'),
    supabaseAdmin.from('orcamentos').select('oficina_id, created_at, status').eq('solicitacao_id', solicitacaoId),
    supabaseAdmin.from('pedido_dispensas').select('oficina_id, created_at, motivo, origem, comentario').eq('solicitacao_id', solicitacaoId),
  ]);
  const perfis = Array.from(new Set(((avisos || []) as any[]).map((a) => a.profile_id as string)));
  const idsDiretos = new Set<string>([
    ...((convites || []) as any[]).map((c) => c.oficina_id), ...((links || []) as any[]).map((l) => l.oficina_id),
    ...((orcs || []) as any[]).map((o) => o.oficina_id), ...((disps || []) as any[]).map((d) => d.oficina_id),
  ].filter(Boolean));
  const [{ data: porPerfil }, { data: porId }] = await Promise.all([
    perfis.length ? supabaseAdmin.from('oficinas').select('id, nome_fantasia, profile_id').in('profile_id', perfis) : Promise.resolve({ data: [] as any[] }),
    idsDiretos.size ? supabaseAdmin.from('oficinas').select('id, nome_fantasia, profile_id').in('id', Array.from(idsDiretos)) : Promise.resolve({ data: [] as any[] }),
  ]);
  const oficinas = new Map<string, { id: string; nome: string; profile_id: string | null }>();
  for (const o of [...((porPerfil || []) as any[]), ...((porId || []) as any[])]) oficinas.set(o.id, { id: o.id, nome: o.nome_fantasia || '', profile_id: o.profile_id });
  const oficinaDoPerfil = new Map(Array.from(oficinas.values()).filter((o) => o.profile_id).map((o) => [o.profile_id as string, o.id]));

  const eventos = new Map<string, ContatoOficina['eventos']>();
  const add = (oficinaId: string | null | undefined, tipo: TipoEvento, em: string | null | undefined, detalhe?: string) => {
    if (!oficinaId || !em || !oficinas.has(oficinaId)) return;
    const lista = eventos.get(oficinaId) || [];
    lista.push({ tipo, em, ...(detalhe ? { detalhe } : {}) });
    eventos.set(oficinaId, lista);
  };
  const comConviteNoSino = new Set<string>();
  for (const a of (avisos || []) as { profile_id: string; tipo: string; created_at: string; dados: any }[]) {
    const oficinaId = oficinaDoPerfil.get(a.profile_id);
    const email = a.dados?.email as string | undefined;
    if (a.tipo === 'pedido_convite' && oficinaId) comConviteNoSino.add(oficinaId);
    add(oficinaId, TIPO_AVISO[a.tipo], a.created_at, email ? `e-mail: ${email}` : undefined);
  }
  // convite sem aviso no sino (acesso mantido ao mudar o tipo, ou anterior a 089)
  for (const c of (convites || []) as { oficina_id: string; origem: string; created_at: string }[]) {
    if (!comConviteNoSino.has(c.oficina_id)) add(c.oficina_id, 'convidada', c.created_at, c.origem === 'tipo_alterado' ? 'acesso mantido (tipo alterado)' : c.origem);
  }
  for (const l of (links || []) as { oficina_id: string; criado_em: string; visto_em: string | null; usado_em: string | null }[]) {
    add(l.oficina_id, 'link_enviado', l.criado_em);
    add(l.oficina_id, 'link_visto', l.visto_em);
    add(l.oficina_id, 'link_entrou', l.usado_em);
  }
  for (const o of (orcs || []) as { oficina_id: string; created_at: string; status: string }[]) add(o.oficina_id, 'orcou', o.created_at, o.status);
  for (const d of (disps || []) as { oficina_id: string; created_at: string; motivo: string; origem: string | null; comentario: string | null }[]) {
    add(d.oficina_id, 'dispensou', d.created_at, [d.motivo, d.origem === 'email' ? 'pelo e-mail' : 'pelo painel', d.comentario].filter(Boolean).join(' · '));
  }
  const lista: ContatoOficina[] = [];
  for (const [id, evs] of Array.from(eventos.entries())) {
    evs.sort((a, b) => a.em.localeCompare(b.em));
    lista.push({ oficina_id: id, nome: oficinas.get(id)!.nome, eventos: evs });
  }
  return lista.sort((a, b) => a.eventos[0].em.localeCompare(b.eventos[0].em) || a.nome.localeCompare(b.nome));
}
