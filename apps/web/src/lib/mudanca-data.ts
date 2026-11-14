import { supabaseAdmin } from './supabase-admin';
import { horaLocalEmUtc, fusoDoPais, moverFimPrevisto, diaNaOficina } from './fuso';
import { avisarClienteAgendamento, avisarClienteCancelamento } from './email-agendamento';
import { avisarCancelamentoPeloCliente } from './email-cancelamento-cliente';
import { textosAgenda, preencher, dataJanela } from './notif-agenda';
import { janelaDaSugestao, turnoDaJanela, minutosDe, hhmm, horaCurta, JANELA_MIN, LEGADO, type Janela } from './turnos';
import { ctxDaOficina } from './pedido-datas';
import { textosMudanca } from './notif-mudanca';
import { agendaDaOficina, MOTIVO_MIN } from './agenda-oficina';
import { emTodasAsLinguas, type TextoAviso } from './notif-textos';

// Mudanca de data UNIFICADA (migracao 077, dono 08/11). Toda mudanca de data feita pela
// oficina - pelo orcamento aceito ou pela agenda - passa por aqui:
//  - "pedir ao cliente": proposta pendente; o cliente aceita, mantem a data atual (so se a
//    oficina disse que ela ainda serve), pede outra pelo chat ou cancela com a oficina;
//  - "ja combinei com o cliente": muda na hora; o cliente pode dizer "nao combinei isso"
//    (volta a data anterior e a proposta fica pendente);
//  - mudanca no MESMO dia so com "ja combinei" (o cliente pode ja estar a caminho);
//  - uma proposta por vez: a nova substitui a pendente.
// Depois de cada resposta a oficina recebe o proximo passo; lembretes em lembretesMudanca().

type Res = { status: number; body: Record<string, unknown> };
/** 23:59 em minutos: fim maximo de uma janela no dia */
const ULTIMO_MINUTO = 23 * 60 + 59;
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const diaLocal = (iso: string | Date, fuso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: fuso });
const SEL_AG = 'id, status, tipo, data_inicio, checkin_ate, data_fim, data_fim_prevista, solicitacao_id, oficina_id, oficina:oficinas(profile_id, nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(idioma))';
// janela de chegada de uma revisao de data (check-in v2): nova_hora = inicio, nova_hora_fim = fim; revisao antiga
// sem fim: hora exata = +30 min; so turno = 08-12 / 13-17 (o que o cliente viu)
export function janelaDaRevisao(rev: { nova_hora?: string | null; nova_hora_fim?: string | null; novo_turno?: string | null }): Janela {
  if (rev.nova_hora) {
    const ini = horaCurta(rev.nova_hora);
    // nunca passa de 23:59 (hora exata 23:45 + 30 min dava "24:15" -> data invalida; auditoria Fable R-06)
    const fim = rev.nova_hora_fim ? horaCurta(rev.nova_hora_fim) : hhmm(Math.min((minutosDe(ini) ?? 0) + JANELA_MIN, ULTIMO_MINUTO));
    return { inicio: ini, fim };
  }
  return LEGADO[rev.novo_turno === 'tarde' ? 'tarde' : 'manha'];
}

async function dadosPedido(solicitacaoId: string) {
  const { data } = await supabaseAdmin.from('solicitacoes')
    .select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma), veiculo:veiculos(fipe_marca, fipe_modelo)')
    .eq('id', solicitacaoId).maybeSingle();
  const v = (data as any)?.veiculo;
  return { clienteId: (data as any)?.cliente_id as string | undefined, idiomaCli: (data as any)?.cliente?.idioma as string | undefined, carro: [v?.fipe_marca, v?.fipe_modelo].filter(Boolean).join(' ') };
}

// a janela de chegada anda junto: data_inicio = inicio, checkin_ate = fim da janela (check-in v2)
async function moverAgenda(ag: any, inicio: string, fimNovo: string | null, pais: string | null | undefined, checkinAte: string | null) {
  const fimAntigo = ag.data_fim_prevista || ag.data_fim;
  const fim = fimNovo || (fimAntigo ? moverFimPrevisto(fimAntigo, ag.data_inicio, inicio, pais) : null);
  const { data } = await supabaseAdmin.from('agenda')
    .update({ data_inicio: inicio, checkin_ate: checkinAte, ...(fim ? { data_fim: fim, data_fim_prevista: fim } : {}), no_show: false })
    .eq('id', ag.id).eq('status', 'agendado').select('id');
  return !!data?.length;
}

// aviso na lingua da conta + as 6 linguas em dados.textos (a tela mostra a lingua de quem le)
async function notificar(profileId: string | undefined, tipo: string, idioma: string | null | undefined, montar: (l: string) => TextoAviso, dados: Record<string, unknown>) {
  if (!profileId) return;
  const n = montar(idioma || 'en');
  await supabaseAdmin.from('notificacoes').insert({ profile_id: profileId, tipo, titulo: n.titulo, mensagem: n.mensagem, dados: { ...dados, textos: emTodasAsLinguas(montar) } });
}

export async function proporMudanca(p: {
  userId: string; orcamentoId?: string; agendaId?: string; data: string; hora?: string | null; horaFim?: string | null; turno?: 'manha' | 'tarde' | null;
  previsao?: string | null; motivo: string; dataAtualServe: boolean; combinado: boolean;
}): Promise<Res> {
  if (p.motivo.length < MOTIVO_MIN) return res(400, { error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' });
  // contexto: agenda (ainda sem o carro) + orcamento aceito + oficina, e quem chama pode agir
  let ag: any, of: any;
  if (p.agendaId) {
    const x = await agendaDaOficina(p.agendaId, p.userId);
    if ('erro' in x) { const e = (x as { erro: number }).erro; return res(e, { error: 'Não permitido', codigo: e === 409 ? 'NAO_AGENDADO' : undefined }); }
    ag = x.ag; of = x.of;
  } else {
    const { data: o } = await supabaseAdmin.from('orcamentos').select('id, status, solicitacao_id, oficina_id').eq('id', p.orcamentoId || '').maybeSingle();
    if (!o) return res(404, { error: 'Não encontrado' });
    if (o.status !== 'aceito') return res(409, { error: 'Orçamento não está aceito', codigo: 'ORCAMENTO_INDISPONIVEL' });
    const { data: a } = await supabaseAdmin.from('agenda').select('id').eq('solicitacao_id', o.solicitacao_id).eq('oficina_id', o.oficina_id).eq('status', 'agendado').maybeSingle();
    if (!a) return res(409, { error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' });
    const x = await agendaDaOficina(a.id, p.userId);
    if ('erro' in x) { const e = (x as { erro: number }).erro; return res(e, { error: 'Não permitido', codigo: e === 409 ? 'NAO_AGENDADO' : undefined }); }
    ag = x.ag; of = x.of;
  }
  const { data: orc } = await supabaseAdmin.from('orcamentos').select('id, valor_total, revisao_numero').eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito').single();
  const fuso = fusoDoPais(of?.pais);
  // janela proposta (check-in v2): hora exata da agenda = +30 min; faixa do seletor = inicio..fim; so turno
  // (cliente antigo) = 1a faixa do perfil nesse turno. O servidor grava sempre inicio E fim (as telas so leem).
  let janela: Janela;
  if (p.hora) {
    // hora exata (agenda) sem fim: a janela de 30 min tem de caber no dia (23:45 + 30 min = "24:15" dava 500; R-06)
    if (!(p.horaFim && (minutosDe(p.horaFim) ?? 0) - (minutosDe(p.hora) ?? 0) >= JANELA_MIN) && (minutosDe(p.hora) ?? 0) + JANELA_MIN > ULTIMO_MINUTO) return res(400, { error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' });
    const fimH = p.horaFim && (minutosDe(p.horaFim) ?? 0) - (minutosDe(p.hora) ?? 0) >= JANELA_MIN ? p.horaFim : hhmm((minutosDe(p.hora) ?? 0) + JANELA_MIN);
    janela = { inicio: p.hora, fim: fimH };
  } else {
    const { data: ofCtx } = await supabaseAdmin.from('oficinas').select('horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim').eq('id', ag.oficina_id).maybeSingle();
    janela = janelaDaSugestao(p.data, p.turno === 'tarde' ? 'tarde' : 'manha', ctxDaOficina(ofCtx));
  }
  const inicio = horaLocalEmUtc(p.data, janela.inicio, of?.pais);
  const checkinAte = horaLocalEmUtc(p.data, janela.fim, of?.pais);
  if (new Date(inicio).getTime() < Date.now()) return res(409, { error: 'Data no passado', codigo: 'HORARIO_VENCIDO' });
  if (new Date(inicio).getTime() === new Date(ag.data_inicio).getTime() && (!ag.checkin_ate || new Date(checkinAte).getTime() === new Date(ag.checkin_ate).getTime())) return res(400, { error: 'Mesma data', codigo: 'DATA_IGUAL_ATUAL' });
  // no mesmo dia so com "ja combinei": o cliente pode ja estar a caminho
  if (!p.combinado && diaLocal(inicio, fuso) === diaLocal(ag.data_inicio, fuso)) return res(409, { error: 'Mesmo dia', codigo: 'MESMO_DIA_SO_COMBINADO' });
  const fimNovo = p.previsao ? horaLocalEmUtc(p.previsao, '18:00', of?.pais) : null;
  if (fimNovo && new Date(fimNovo).getTime() < new Date(inicio).getTime()) return res(400, { error: 'Previsão antes da chegada', codigo: 'PREVISAO_ANTES_DA_DATA' });

  // uma proposta por vez: a nova substitui a que esperava o cliente
  await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('orcamento_id', orc!.id).eq('tipo', 'data').eq('status', 'pendente');
  const ped = await dadosPedido(ag.solicitacao_id);
  const base = {
    tipo: 'data', orcamento_id: orc!.id, solicitacao_id: ag.solicitacao_id, oficina_id: ag.oficina_id,
    numero: (orc!.revisao_numero || 0) + 1, valor_anterior: orc!.valor_total, valor_novo: orc!.valor_total, itens: [],
    nova_data_checkin: p.data, novo_turno: turnoDaJanela(janela), nova_hora: janela.inicio, nova_hora_fim: janela.fim, nova_previsao_entrega: p.previsao || null,
    motivo: p.motivo, criado_por: p.userId, data_atual_serve: p.dataAtualServe, combinado: p.combinado,
    data_anterior: ag.data_inicio, fim_anterior: ag.data_fim_prevista || ag.data_fim, checkin_ate_anterior: ag.checkin_ate ?? null,
  };
  const tOf = textosAgenda(of?.profile?.idioma), mOf = textosMudanca(of?.profile?.idioma);

  if (p.combinado) {
    if (!(await moverAgenda(ag, inicio, fimNovo, of?.pais, checkinAte))) return res(409, { error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' });
    const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({ ...base, status: 'aprovada', decidido_em: new Date().toISOString(), decidido_por: p.userId }).select('id').single();
    if (error) return res(500, { error: error.message });
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_combinada', por_profile_id: p.userId, detalhe: { de: ag.data_inicio, para: inicio, motivo: p.motivo, revisao_id: rev.id } });
    await supabaseAdmin.from('mensagens').insert({ solicitacao_id: ag.solicitacao_id, oficina_id: ag.oficina_id, remetente_id: p.userId, texto: preencher(mOf.chatCombinado, { quando: dataJanela(inicio, checkinAte, of?.profile?.idioma, fuso), motivo: p.motivo }) });
    await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.combinadoTitulo, mensagem: preencher(m.combinadoMsg, { oficina: of?.nome_fantasia || '', quando: dataJanela(inicio, checkinAte, l, fuso) }) }; },
      { solicitacao_id: ag.solicitacao_id, orcamento_id: orc!.id, revisao_id: rev.id });
    const emailEnviado = await avisarClienteAgendamento(ag.id, { motivo: p.motivo }).catch(() => false);
    return res(200, { ok: true, revisaoId: rev.id, aplicada: true, data_inicio: inicio, checkin_ate: checkinAte, emailEnviado });
  }

  const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({ ...base, status: 'pendente' }).select('id').single();
  if (error) {
    if (error.code === '23505') return res(409, { error: 'Já existe uma revisão pendente', codigo: 'REVISAO_PENDENTE' });
    return res(500, { error: error.message });
  }
  await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => {
    const t = textosAgenda(l), m = textosMudanca(l);
    return { titulo: t.propostaTitulo, mensagem: preencher(p.dataAtualServe ? t.propostaMsg : m.propostaNaoServeMsg, { oficina: of?.nome_fantasia || '', quando: dataJanela(inicio, checkinAte, l, fuso), motivo: p.motivo }) };
  }, { solicitacao_id: ag.solicitacao_id, orcamento_id: orc!.id, revisao_id: rev.id });
  await supabaseAdmin.from('mensagens').insert({ solicitacao_id: ag.solicitacao_id, oficina_id: ag.oficina_id, remetente_id: p.userId, texto: preencher(tOf.chatProposta, { quando: dataJanela(inicio, checkinAte, of?.profile?.idioma, fuso), motivo: p.motivo }) });
  return res(200, { ok: true, revisaoId: rev.id, aplicada: false });
}

/** Cancela o agendamento (oficina ou cliente): pedido aberto de novo, orcamentos recusados no aceite voltam. */
export async function cancelarAgendamento(ag: any, of: any, userId: string, motivo: string, porCliente: boolean) {
  const { data: feito } = await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).eq('id', ag.id).eq('status', 'agendado').select('id');
  if (!feito?.length) return { ok: false as const };
  await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: porCliente ? 'cancelado_cliente' : 'cancelado_oficina', por_profile_id: userId, detalhe: { motivo } });
  await supabaseAdmin.from('orcamentos').update({ status: 'recusado' }).eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito');
  await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('solicitacao_id', ag.solicitacao_id).eq('status', 'pendente');
  // validade no fuso da oficina, igual a orcamentoVencido (079; antes o dia em UTC)
  const hoje = diaNaOficina(new Date(), of?.pais);
  const { data: voltam } = await supabaseAdmin.from('orcamentos').update({ status: 'enviado', recusado_no_aceite: false })
    .eq('solicitacao_id', ag.solicitacao_id).neq('oficina_id', ag.oficina_id).eq('status', 'recusado').eq('recusado_no_aceite', true).gte('validade', hoje).select('id');
  await supabaseAdmin.from('solicitacoes').update({ status: voltam?.length ? 'em_orcamento' : 'aberta', reaberta_em: new Date().toISOString() }).eq('id', ag.solicitacao_id);
  // cancelado pelo CLIENTE: e-mail 'voce cancelou' (com o .ics) ao cliente e 'horario livre' a oficina (auditoria 09/11)
  const emailEnviado = porCliente
    ? await avisarCancelamentoPeloCliente(ag.id, null).then(() => true).catch(() => false)
    : await avisarClienteCancelamento(ag.id, motivo, true).catch(() => false);
  return { ok: true as const, orcamentosDeVolta: voltam?.length || 0, emailEnviado };
}

/** Resposta do CLIENTE a uma mudanca de data. */
export async function decidirMudanca(rev: any, decisao: 'aprovar' | 'manter' | 'cancelar' | 'contestar', userId: string): Promise<Res> {
  const { data: ag } = await supabaseAdmin.from('agenda').select(SEL_AG).eq('solicitacao_id', rev.solicitacao_id).eq('oficina_id', rev.oficina_id).eq('status', 'agendado').maybeSingle();
  if (!ag) {
    if (rev.status === 'pendente') await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('id', rev.id);
    return res(409, { error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' });
  }
  const of = (ag as any).oficina;
  const fuso = fusoDoPais(of?.pais);
  const ped = await dadosPedido(rev.solicitacao_id);
  const idiomaOf = of?.profile?.idioma;
  const dadosOf = (d: string) => ({ solicitacao_id: rev.solicitacao_id, orcamento_id: rev.orcamento_id, revisao_id: rev.id, decisao: d });

  if (decisao === 'contestar') {
    // "nao combinei isso": desfaz a mudanca combinada e a proposta volta a esperar o cliente
    if (!(rev.status === 'aprovada' && rev.combinado && !rev.contestada_em && rev.data_anterior)) return res(409, { error: 'Nada a contestar', codigo: 'REVISAO_DECIDIDA' });
    // so desfaz se a agenda ainda esta na data que ESTA mudanca criou (outra mudanca depois - ja aceita - vale)
    // e se a data antiga ainda nao passou (auditoria 09/11)
    const criada = horaLocalEmUtc(rev.nova_data_checkin, janelaDaRevisao(rev).inicio, of?.pais);
    if (Date.parse((ag as any).data_inicio) !== Date.parse(criada) || Date.parse(rev.data_anterior) <= Date.now()) return res(409, { error: 'Nada a contestar', codigo: 'REVISAO_DECIDIDA' });
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'pendente', combinado: false, contestada_em: new Date().toISOString(), decidido_em: null, decidido_por: null })
      .eq('id', rev.id).eq('status', 'aprovada').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    await moverAgenda(ag, rev.data_anterior, rev.fim_anterior, of?.pais, rev.checkin_ate_anterior ?? null);
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_contestada', por_profile_id: userId, detalhe: { de: (ag as any).data_inicio, para: rev.data_anterior, revisao_id: rev.id } });
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => { const m = textosMudanca(l); return { titulo: m.contestadaTitulo, mensagem: preencher(m.contestadaMsg, { carro: ped.carro, quando: dataJanela(rev.data_anterior, rev.checkin_ate_anterior, l, fuso) }) }; }, dadosOf('contestada'));
    const emailEnviado = await avisarClienteAgendamento(ag.id).catch(() => false);
    return res(200, { ok: true, status: 'pendente', emailEnviado });
  }

  if (rev.status !== 'pendente') return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
  const janelaRev = janelaDaRevisao(rev);
  const inicio = horaLocalEmUtc(rev.nova_data_checkin, janelaRev.inicio, of?.pais);
  const checkinAte = horaLocalEmUtc(rev.nova_data_checkin, janelaRev.fim, of?.pais);

  if (decisao === 'aprovar') {
    if (new Date(inicio).getTime() < Date.now()) {
      await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('id', rev.id).eq('status', 'pendente');
      return res(409, { error: 'Horário vencido', codigo: 'HORARIO_VENCIDO' });
    }
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'aprovada', decidido_em: new Date().toISOString(), decidido_por: userId }).eq('id', rev.id).eq('status', 'pendente').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    const fimNovo = rev.nova_previsao_entrega ? horaLocalEmUtc(rev.nova_previsao_entrega, '18:00', of?.pais) : null;
    await moverAgenda(ag, inicio, fimNovo, of?.pais, checkinAte);
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_proposta_aceita', por_profile_id: userId, detalhe: { de: (ag as any).data_inicio, para: inicio, revisao_id: rev.id } });
    const emailEnviado = await avisarClienteAgendamento(ag.id).catch(() => false);
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => ({ titulo: textosAgenda(l).aceitaTitulo, mensagem: preencher(textosMudanca(l).aceitaMsg, { carro: ped.carro, quando: dataJanela(inicio, checkinAte, l, fuso) }) }), dadosOf('aprovada'));
    return res(200, { ok: true, status: 'aprovada', emailEnviado });
  }

  if (decisao === 'manter') {
    // a oficina disse que a data atual nao serve: "manter" nao e opcao
    if (rev.data_atual_serve === false) return res(409, { error: 'A data atual não serve', codigo: 'DATA_ATUAL_NAO_SERVE' });
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'recusada', decidido_em: new Date().toISOString(), decidido_por: userId }).eq('id', rev.id).eq('status', 'pendente').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => { const m = textosMudanca(l); return { titulo: m.mantidaTitulo, mensagem: preencher(m.mantidaMsg, { carro: ped.carro, quando: dataJanela((ag as any).data_inicio, (ag as any).checkin_ate, l, fuso) }) }; }, dadosOf('recusada'));
    return res(200, { ok: true, status: 'recusada' });
  }

  // cancelar com esta oficina: o pedido volta a ficar aberto com os outros orcamentos
  const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'recusada', decidido_em: new Date().toISOString(), decidido_por: userId }).eq('id', rev.id).eq('status', 'pendente').select('id');
  if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
  const mCli = textosMudanca(ped.idiomaCli);
  const c = await cancelarAgendamento(ag, of, userId, mCli.chatCanceladoCliente, true);
  if (!c.ok) return res(409, { error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' });
  await supabaseAdmin.from('mensagens').insert({ solicitacao_id: rev.solicitacao_id, oficina_id: rev.oficina_id, remetente_id: userId, texto: mCli.chatCanceladoCliente });
  await notificar(of?.profile_id, 'agendamento_cancelado_cliente', idiomaOf, (l) => { const m = textosMudanca(l); return { titulo: m.canceladoClienteTitulo, mensagem: preencher(m.canceladoClienteMsg, { carro: ped.carro }) }; }, dadosOf('cancelada'));
  return res(200, { ok: true, status: 'cancelada', orcamentosDeVolta: c.orcamentosDeVolta });
}

/** Lembretes (de hora em hora): cliente sem responder ha 24 h; vespera da data marcada sem resposta. */
export async function lembretesMudanca() {
  const { data: pend } = await supabaseAdmin.from('orcamento_revisoes')
    .select('id, created_at, solicitacao_id, oficina_id, orcamento_id, nova_data_checkin, nova_hora, nova_hora_fim, novo_turno, lembrete_cliente_em, vespera_avisado_em')
    .eq('tipo', 'data').eq('status', 'pendente').limit(500);
  let lembretes = 0, vesperas = 0;
  for (const r of pend || []) {
    const { data: ag } = await supabaseAdmin.from('agenda').select(SEL_AG).eq('solicitacao_id', r.solicitacao_id).eq('oficina_id', r.oficina_id).eq('status', 'agendado').maybeSingle();
    if (!ag) continue;
    const of = (ag as any).oficina; const fuso = fusoDoPais(of?.pais);
    const ped = await dadosPedido(r.solicitacao_id);
    const dados = { solicitacao_id: r.solicitacao_id, orcamento_id: r.orcamento_id, revisao_id: r.id };
    const jr = janelaDaRevisao(r);
    const proposto = horaLocalEmUtc(r.nova_data_checkin, jr.inicio, of?.pais);
    const propostoAte = horaLocalEmUtc(r.nova_data_checkin, jr.fim, of?.pais);
    if (!r.lembrete_cliente_em && Date.now() - new Date(r.created_at).getTime() > 24 * 3600e3) {
      await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.lembreteTitulo, mensagem: preencher(m.lembreteMsg, { oficina: of?.nome_fantasia || '', quando: dataJanela(proposto, propostoAte, l, fuso) }) }; }, dados);
      await supabaseAdmin.from('orcamento_revisoes').update({ lembrete_cliente_em: new Date().toISOString() }).eq('id', r.id);
      lembretes++;
    }
    const amanha = diaLocal(new Date(Date.now() + 24 * 3600e3), fuso);
    if (!r.vespera_avisado_em && diaLocal((ag as any).data_inicio, fuso) === amanha) {
      await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.vesperaTitulo, mensagem: preencher(m.vesperaMsgCliente, { oficina: of?.nome_fantasia || '', quando: dataJanela((ag as any).data_inicio, (ag as any).checkin_ate, l, fuso) }) }; }, dados);
      await notificar(of?.profile_id, 'revisao_orcamento_decidida', of?.profile?.idioma, (l) => { const m = textosMudanca(l); return { titulo: m.vesperaTitulo, mensagem: preencher(m.vesperaMsgOficina, { carro: ped.carro, quando: dataJanela((ag as any).data_inicio, (ag as any).checkin_ate, l, fuso) }) }; }, { ...dados, decisao: 'pendente' });
      await supabaseAdmin.from('orcamento_revisoes').update({ vespera_avisado_em: new Date().toISOString() }).eq('id', r.id);
      vesperas++;
    }
  }
  return { lembretes, vesperas };
}
