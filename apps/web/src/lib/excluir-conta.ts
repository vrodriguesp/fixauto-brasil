import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';

// aviso as oficinas que tinham orcamento num pedido cancelado pela exclusao da conta
const AVISO_CANCELADO: Record<string, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Pedido cancelado pelo cliente', mensagem: 'O cliente excluiu a conta e o pedido em que você orçou foi cancelado.' },
  'pt-PT': { titulo: 'Pedido cancelado pelo cliente', mensagem: 'O cliente eliminou a conta e o pedido em que orçamentou foi cancelado.' },
  en: { titulo: 'Request cancelled by the customer', mensagem: 'The customer deleted their account and the request you quoted was cancelled.' },
  et: { titulo: 'Klient tühistas päringu', mensagem: 'Klient kustutas oma konto ja päring, millele pakkumise tegid, tühistati.' },
  it: { titulo: 'Richiesta annullata dal cliente', mensagem: "Il cliente ha eliminato l'account e la richiesta che avevi preventivato è stata annullata." },
  ru: { titulo: 'Клиент отменил заявку', mensagem: 'Клиент удалил аккаунт, и заявка, на которую вы дали смету, отменена.' },
};

/**
 * Exclusao de conta (pelo proprio usuario ou pelo admin): sem historico apaga
 * tudo; com historico desativa o login e anonimiza os dados pessoais, mantendo
 * pedidos/orcamentos/comissoes anonimos (sao da oficina tambem; apagar em
 * cascata levaria a comissao devida - auditoria B-03/M13). Carro em servico
 * agora: recusa (CARRO_EM_SERVICO).
 */
export async function excluirOuAnonimizarConta(userId: string): Promise<{ modo?: 'apagada' | 'anonimizada'; erro?: string }> {
  const [{ data: sols }, { data: emerg }, { data: ofs }, { data: lojas }] = await Promise.all([
    supabaseAdmin.from('solicitacoes').select('id, status').eq('cliente_id', userId),
    supabaseAdmin.from('emergencias').select('id').eq('profile_id', userId),
    supabaseAdmin.from('oficinas').select('id').eq('profile_id', userId),
    supabaseAdmin.from('lojas_pecas').select('id').eq('profile_id', userId),
  ]);
  const solIds = (sols || []).map((s) => s.id);
  const ofIds = (ofs || []).map((o) => o.id);

  // carro na oficina agora: do cliente ou, se for oficina, carros dos clientes dela
  const emServico = [
    ...(solIds.length ? ((await supabaseAdmin.from('agenda').select('id').in('solicitacao_id', solIds).eq('status', 'em_andamento')).data || []) : []),
    ...(ofIds.length ? ((await supabaseAdmin.from('agenda').select('id').in('oficina_id', ofIds).eq('status', 'em_andamento')).data || []) : []),
  ];
  if (emServico.length) return { erro: 'CARRO_EM_SERVICO' };

  // tambem conta como historico: conversas, avaliacoes, ser o "outro motorista"
  // de um acidente ou membro de equipe (apagar levaria junto a conversa da
  // oficina e a avaliacao da media - auditoria M13)
  const [{ count: nMsg }, { count: nAval }, { count: nOutro }, { count: nFunc }] = await Promise.all([
    supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('remetente_id', userId),
    supabaseAdmin.from('avaliacoes').select('id', { count: 'exact', head: true }).eq('cliente_id', userId),
    supabaseAdmin.from('emergencia_outro_veiculo').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
  ]);
  const semHistorico = !solIds.length && !(emerg || []).length && !ofIds.length && !(lojas || []).length && !nMsg && !nAval && !nOutro && !nFunc;
  if (semHistorico) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) return { erro: error.message };
    return { modo: 'apagada' };
  }

  // 1) login: deixa de existir para o usuario
  const emailAnonimo = `excluida-${userId}@conta-excluida.invalid`;
  const { error: eAuth } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email: emailAnonimo, email_confirm: true, password: crypto.randomBytes(32).toString('hex'),
    phone: '', user_metadata: {}, ban_duration: '876000h',
  } as any);
  if (eAuth) return { erro: eAuth.message };

  // 2) dados pessoais
  await supabaseAdmin.from('profiles').update({ nome: '—', email: emailAnonimo, telefone: null, avatar_url: null, ativo: false }).eq('id', userId);
  await supabaseAdmin.from('notificacoes').delete().eq('profile_id', userId);
  // veiculos sem pedido saem; os de pedidos ficam sem placa/cor/apelido
  const { data: veics } = await supabaseAdmin.from('veiculos').select('id, solicitacoes(id)').eq('profile_id', userId);
  const semPedido = (veics || []).filter((v: any) => !(v.solicitacoes || []).length).map((v: any) => v.id);
  if (semPedido.length) await supabaseAdmin.from('veiculos').delete().in('id', semPedido);
  await supabaseAdmin.from('veiculos').update({ placa: null, cor: null, apelido: null }).eq('profile_id', userId);
  await supabaseAdmin.from('emergencias').update({ nome: '—', email: null, telefone: null }).eq('profile_id', userId);
  await supabaseAdmin.from('emergencia_outro_veiculo').update({ nome: '—', email: null, telefone: null, placa: null }).eq('profile_id', userId);
  await supabaseAdmin.from('funcionarios').update({ ativo: false, acesso_portal: false, nome: '—', telefone: null }).eq('profile_id', userId);

  // 3) o que estava aberto e cancelado (as oficinas deixam de ver o pedido)
  const abertos = (sols || []).filter((s) => ['aberta', 'em_orcamento', 'aceita'].includes(s.status)).map((s) => s.id);
  if (abertos.length) {
    // oficinas que orcaram esses pedidos ficam sabendo
    const { data: orcsAbertos } = await supabaseAdmin.from('orcamentos').select('oficina:oficinas(profile_id, profile:profiles!oficinas_profile_id_fkey(idioma))').in('solicitacao_id', abertos);
    await supabaseAdmin.from('solicitacoes').update({ status: 'cancelada' }).in('id', abertos);
    await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).in('solicitacao_id', abertos).eq('status', 'agendado');
    const porPerfil = new Map<string, string | null>();
    for (const o of (orcsAbertos || []) as any[]) if (o.oficina?.profile_id) porPerfil.set(o.oficina.profile_id, o.oficina.profile?.idioma || null);
    if (porPerfil.size) {
      await supabaseAdmin.from('notificacoes').insert(Array.from(porPerfil).map(([p, idioma]) => ({
        profile_id: p, tipo: 'pedido_cancelado', ...AVISO_CANCELADO[(idioma && AVISO_CANCELADO[idioma]) ? idioma : 'en'], dados: {},
      })));
    }
  }
  // oficina/loja: some das buscas; comissoes e historico ficam para o acerto
  if (ofIds.length) {
    await supabaseAdmin.from('oficinas').update({ ativa: false }).in('id', ofIds);
    await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).in('oficina_id', ofIds).eq('status', 'agendado');
    // orcamentos em aberto da oficina excluida nao podem mais ser aceitos; equipe perde o acesso
    await supabaseAdmin.from('orcamentos').update({ status: 'expirado' }).in('oficina_id', ofIds).in('status', ['enviado', 'visualizado']);
    await supabaseAdmin.from('funcionarios').update({ ativo: false, acesso_portal: false }).in('oficina_id', ofIds);
  }
  if ((lojas || []).length) await supabaseAdmin.from('lojas_pecas').update({ ativa: false }).eq('profile_id', userId);

  return { modo: 'anonimizada' };
}
