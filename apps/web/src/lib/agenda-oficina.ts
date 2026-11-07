import { supabaseAdmin } from './supabase-admin';
import { fusoDoPais } from './fuso';
import { textosAgenda, preencher, dataHora } from './notif-agenda';

// Comum as rotas da oficina que mudam a data ou cancelam um agendamento de
// pedido antes do check-in (migracao 076).

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 500;
/** AAAA-MM-DD que existe de verdade (2026-13-45 nao passa) */
export const dataValida = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export const motivoValido = (m: unknown) => (typeof m === 'string' ? m.trim().slice(0, MOTIVO_MAX) : '');

/** Agendamento de pedido, ainda sem o carro, e quem chama e dono ou equipe (nao mecanico) da oficina. */
export async function agendaDaOficina(agendaId: string, userId: string) {
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, status, tipo, data_inicio, data_fim, data_fim_prevista, solicitacao_id, oficina_id, oficina:oficinas(profile_id, nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(idioma))')
    .eq('id', agendaId).maybeSingle();
  if (!ag) return { erro: 404 as const };
  const of = (ag as any).oficina;
  let pode = of?.profile_id === userId;
  if (!pode) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('cargo').eq('oficina_id', ag.oficina_id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
    pode = !!f && f.cargo !== 'mecanico';
  }
  if (!pode) return { erro: 403 as const };
  if (!ag.solicitacao_id || ag.status !== 'agendado' || ag.tipo !== 'plataforma') return { erro: 409 as const };
  // so a oficina com o orcamento ACEITO deste pedido (uma agenda criada a mao nao basta)
  const { data: orc } = await supabaseAdmin.from('orcamentos').select('id').eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito').maybeSingle();
  if (!orc) return { erro: 409 as const };
  return { ag, of };
}

/** Linha no chat do pedido (no idioma de quem escreve; o chat traduz para quem le) + notificacao ao cliente. */
export async function avisarNoChatENotificar(p: {
  solicitacaoId: string; oficinaId: string; remetenteId: string; idiomaOficina: string | null | undefined; pais: string | null | undefined;
  oficinaNome: string; chave: 'chatData' | 'chatCancelado'; quando?: string; motivo: string;
  notif: { tipo: string; tituloChave: 'dataMudadaTitulo' | 'canceladoTitulo'; msgChave: 'dataMudadaMsg' | 'canceladoMsg' };
}) {
  const fuso = fusoDoPais(p.pais);
  const tOf = textosAgenda(p.idiomaOficina);
  await supabaseAdmin.from('mensagens').insert({
    solicitacao_id: p.solicitacaoId, oficina_id: p.oficinaId, remetente_id: p.remetenteId,
    texto: preencher(tOf[p.chave], { quando: p.quando ? dataHora(p.quando, p.idiomaOficina, fuso) : '', motivo: p.motivo }),
  });
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma)').eq('id', p.solicitacaoId).maybeSingle();
  if (!sol?.cliente_id) return;
  const idiomaCli = (sol as any).cliente?.idioma;
  const tCli = textosAgenda(idiomaCli);
  await supabaseAdmin.from('notificacoes').insert({
    profile_id: sol.cliente_id, tipo: p.notif.tipo, titulo: tCli[p.notif.tituloChave],
    mensagem: preencher(tCli[p.notif.msgChave], { oficina: p.oficinaNome, quando: p.quando ? dataHora(p.quando, idiomaCli, fuso) : '', motivo: p.motivo }),
    dados: { solicitacao_id: p.solicitacaoId },
  });
}
