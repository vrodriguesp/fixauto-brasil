import { supabaseAdmin } from './supabase-admin';
import { horaLocalEmUtc, fusoDoPais, moverFimPrevisto } from './fuso';
import { avisarClienteAgendamento, avisarClienteCancelamento } from './email-agendamento';
import { textosAgenda, preencher, dataHora } from './notif-agenda';
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
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const diaLocal = (iso: string | Date, fuso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: fuso });
const SEL_AG = 'id, status, tipo, data_inicio, data_fim, data_fim_prevista, solicitacao_id, oficina_id, oficina:oficinas(profile_id, nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(idioma))';

async function dadosPedido(solicitacaoId: string) {
  const { data } = await supabaseAdmin.from('solicitacoes')
    .select('cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(idioma), veiculo:veiculos(fipe_marca, fipe_modelo)')
    .eq('id', solicitacaoId).maybeSingle();
  const v = (data as any)?.veiculo;
  return { clienteId: (data as any)?.cliente_id as string | undefined, idiomaCli: (data as any)?.cliente?.idioma as string | undefined, carro: [v?.fipe_marca, v?.fipe_modelo].filter(Boolean).join(' ') };
}

async function moverAgenda(ag: any, inicio: string, fimNovo: string | null, pais: string | null | undefined) {
  const fimAntigo = ag.data_fim_prevista || ag.data_fim;
  const fim = fimNovo || (fimAntigo ? moverFimPrevisto(fimAntigo, ag.data_inicio, inicio, pais) : null);
  const { data } = await supabaseAdmin.from('agenda')
    .update({ data_inicio: inicio, ...(fim ? { data_fim: fim, data_fim_prevista: fim } : {}), no_show: false })
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
  userId: string; orcamentoId?: string; agendaId?: string; data: string; hora?: string | null; turno?: 'manha' | 'tarde' | null;
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
  const inicio = horaLocalEmUtc(p.data, p.hora || (p.turno === 'tarde' ? '13:00' : '08:00'), of?.pais);
  if (new Date(inicio).getTime() < Date.now()) return res(409, { error: 'Data no passado', codigo: 'HORARIO_VENCIDO' });
  if (new Date(inicio).getTime() === new Date(ag.data_inicio).getTime()) return res(400, { error: 'Mesma data', codigo: 'DATA_IGUAL_ATUAL' });
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
    nova_data_checkin: p.data, novo_turno: p.hora ? null : (p.turno || 'manha'), nova_hora: p.hora || null, nova_previsao_entrega: p.previsao || null,
    motivo: p.motivo, criado_por: p.userId, data_atual_serve: p.dataAtualServe, combinado: p.combinado,
    data_anterior: ag.data_inicio, fim_anterior: ag.data_fim_prevista || ag.data_fim,
  };
  const tOf = textosAgenda(of?.profile?.idioma), mOf = textosMudanca(of?.profile?.idioma);

  if (p.combinado) {
    if (!(await moverAgenda(ag, inicio, fimNovo, of?.pais))) return res(409, { error: 'Carro já na oficina', codigo: 'NAO_AGENDADO' });
    const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({ ...base, status: 'aprovada', decidido_em: new Date().toISOString(), decidido_por: p.userId }).select('id').single();
    if (error) return res(500, { error: error.message });
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_combinada', por_profile_id: p.userId, detalhe: { de: ag.data_inicio, para: inicio, motivo: p.motivo, revisao_id: rev.id } });
    await supabaseAdmin.from('mensagens').insert({ solicitacao_id: ag.solicitacao_id, oficina_id: ag.oficina_id, remetente_id: p.userId, texto: preencher(mOf.chatCombinado, { quando: dataHora(inicio, of?.profile?.idioma, fuso), motivo: p.motivo }) });
    await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.combinadoTitulo, mensagem: preencher(m.combinadoMsg, { oficina: of?.nome_fantasia || '', quando: dataHora(inicio, l, fuso) }) }; },
      { solicitacao_id: ag.solicitacao_id, orcamento_id: orc!.id, revisao_id: rev.id });
    const emailEnviado = await avisarClienteAgendamento(ag.id, { motivo: p.motivo }).catch(() => false);
    return res(200, { ok: true, revisaoId: rev.id, aplicada: true, data_inicio: inicio, emailEnviado });
  }

  const { data: rev, error } = await supabaseAdmin.from('orcamento_revisoes').insert({ ...base, status: 'pendente' }).select('id').single();
  if (error) {
    if (error.code === '23505') return res(409, { error: 'Já existe uma revisão pendente', codigo: 'REVISAO_PENDENTE' });
    return res(500, { error: error.message });
  }
  await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => {
    const t = textosAgenda(l), m = textosMudanca(l);
    return { titulo: t.propostaTitulo, mensagem: preencher(p.dataAtualServe ? t.propostaMsg : m.propostaNaoServeMsg, { oficina: of?.nome_fantasia || '', quando: dataHora(inicio, l, fuso), motivo: p.motivo }) };
  }, { solicitacao_id: ag.solicitacao_id, orcamento_id: orc!.id, revisao_id: rev.id });
  await supabaseAdmin.from('mensagens').insert({ solicitacao_id: ag.solicitacao_id, oficina_id: ag.oficina_id, remetente_id: p.userId, texto: preencher(tOf.chatProposta, { quando: dataHora(inicio, of?.profile?.idioma, fuso), motivo: p.motivo }) });
  return res(200, { ok: true, revisaoId: rev.id, aplicada: false });
}

/** Cancela o agendamento (oficina ou cliente): pedido aberto de novo, orcamentos recusados no aceite voltam. */
export async function cancelarAgendamento(ag: any, of: any, userId: string, motivo: string, porCliente: boolean) {
  const { data: feito } = await supabaseAdmin.from('agenda').update({ status: 'cancelado' }).eq('id', ag.id).eq('status', 'agendado').select('id');
  if (!feito?.length) return { ok: false as const };
  await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: porCliente ? 'cancelado_cliente' : 'cancelado_oficina', por_profile_id: userId, detalhe: { motivo } });
  await supabaseAdmin.from('orcamentos').update({ status: 'recusado' }).eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito');
  await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('solicitacao_id', ag.solicitacao_id).eq('status', 'pendente');
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: voltam } = await supabaseAdmin.from('orcamentos').update({ status: 'enviado', recusado_no_aceite: false })
    .eq('solicitacao_id', ag.solicitacao_id).neq('oficina_id', ag.oficina_id).eq('status', 'recusado').eq('recusado_no_aceite', true).gte('validade', hoje).select('id');
  await supabaseAdmin.from('solicitacoes').update({ status: voltam?.length ? 'em_orcamento' : 'aberta', reaberta_em: new Date().toISOString() }).eq('id', ag.solicitacao_id);
  const emailEnviado = await avisarClienteCancelamento(ag.id, motivo, true).catch(() => false);
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
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'pendente', combinado: false, contestada_em: new Date().toISOString(), decidido_em: null, decidido_por: null })
      .eq('id', rev.id).eq('status', 'aprovada').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    await moverAgenda(ag, rev.data_anterior, rev.fim_anterior, of?.pais);
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_contestada', por_profile_id: userId, detalhe: { de: (ag as any).data_inicio, para: rev.data_anterior, revisao_id: rev.id } });
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => { const m = textosMudanca(l); return { titulo: m.contestadaTitulo, mensagem: preencher(m.contestadaMsg, { carro: ped.carro, quando: dataHora(rev.data_anterior, l, fuso) }) }; }, dadosOf('contestada'));
    const emailEnviado = await avisarClienteAgendamento(ag.id).catch(() => false);
    return res(200, { ok: true, status: 'pendente', emailEnviado });
  }

  if (rev.status !== 'pendente') return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
  const inicio = horaLocalEmUtc(rev.nova_data_checkin, rev.nova_hora || (rev.novo_turno === 'tarde' ? '13:00' : '08:00'), of?.pais);

  if (decisao === 'aprovar') {
    if (new Date(inicio).getTime() < Date.now()) {
      await supabaseAdmin.from('orcamento_revisoes').update({ status: 'cancelada' }).eq('id', rev.id).eq('status', 'pendente');
      return res(409, { error: 'Horário vencido', codigo: 'HORARIO_VENCIDO' });
    }
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'aprovada', decidido_em: new Date().toISOString(), decidido_por: userId }).eq('id', rev.id).eq('status', 'pendente').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    const fimNovo = rev.nova_previsao_entrega ? horaLocalEmUtc(rev.nova_previsao_entrega, '18:00', of?.pais) : null;
    await moverAgenda(ag, inicio, fimNovo, of?.pais);
    await supabaseAdmin.from('agenda_historico').insert({ agenda_id: ag.id, acao: 'data_proposta_aceita', por_profile_id: userId, detalhe: { de: (ag as any).data_inicio, para: inicio, revisao_id: rev.id } });
    const emailEnviado = await avisarClienteAgendamento(ag.id).catch(() => false);
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => ({ titulo: textosAgenda(l).aceitaTitulo, mensagem: preencher(textosMudanca(l).aceitaMsg, { carro: ped.carro, quando: dataHora(inicio, l, fuso) }) }), dadosOf('aprovada'));
    return res(200, { ok: true, status: 'aprovada', emailEnviado });
  }

  if (decisao === 'manter') {
    // a oficina disse que a data atual nao serve: "manter" nao e opcao
    if (rev.data_atual_serve === false) return res(409, { error: 'A data atual não serve', codigo: 'DATA_ATUAL_NAO_SERVE' });
    const { data: trava } = await supabaseAdmin.from('orcamento_revisoes').update({ status: 'recusada', decidido_em: new Date().toISOString(), decidido_por: userId }).eq('id', rev.id).eq('status', 'pendente').select('id');
    if (!trava?.length) return res(409, { error: 'Revisão já decidida', codigo: 'REVISAO_DECIDIDA' });
    await notificar(of?.profile_id, 'revisao_orcamento_decidida', idiomaOf, (l) => { const m = textosMudanca(l); return { titulo: m.mantidaTitulo, mensagem: preencher(m.mantidaMsg, { carro: ped.carro, quando: dataHora((ag as any).data_inicio, l, fuso) }) }; }, dadosOf('recusada'));
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
    .select('id, created_at, solicitacao_id, oficina_id, orcamento_id, nova_data_checkin, nova_hora, novo_turno, lembrete_cliente_em, vespera_avisado_em')
    .eq('tipo', 'data').eq('status', 'pendente').limit(500);
  let lembretes = 0, vesperas = 0;
  for (const r of pend || []) {
    const { data: ag } = await supabaseAdmin.from('agenda').select(SEL_AG).eq('solicitacao_id', r.solicitacao_id).eq('oficina_id', r.oficina_id).eq('status', 'agendado').maybeSingle();
    if (!ag) continue;
    const of = (ag as any).oficina; const fuso = fusoDoPais(of?.pais);
    const ped = await dadosPedido(r.solicitacao_id);
    const dados = { solicitacao_id: r.solicitacao_id, orcamento_id: r.orcamento_id, revisao_id: r.id };
    const proposto = horaLocalEmUtc(r.nova_data_checkin, r.nova_hora || (r.novo_turno === 'tarde' ? '13:00' : '08:00'), of?.pais);
    if (!r.lembrete_cliente_em && Date.now() - new Date(r.created_at).getTime() > 24 * 3600e3) {
      await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.lembreteTitulo, mensagem: preencher(m.lembreteMsg, { oficina: of?.nome_fantasia || '', quando: dataHora(proposto, l, fuso) }) }; }, dados);
      await supabaseAdmin.from('orcamento_revisoes').update({ lembrete_cliente_em: new Date().toISOString() }).eq('id', r.id);
      lembretes++;
    }
    const amanha = diaLocal(new Date(Date.now() + 24 * 3600e3), fuso);
    if (!r.vespera_avisado_em && diaLocal((ag as any).data_inicio, fuso) === amanha) {
      await notificar(ped.clienteId, 'revisao_orcamento', ped.idiomaCli, (l) => { const m = textosMudanca(l); return { titulo: m.vesperaTitulo, mensagem: preencher(m.vesperaMsgCliente, { oficina: of?.nome_fantasia || '', quando: dataHora((ag as any).data_inicio, l, fuso) }) }; }, dados);
      await notificar(of?.profile_id, 'revisao_orcamento_decidida', of?.profile?.idioma, (l) => { const m = textosMudanca(l); return { titulo: m.vesperaTitulo, mensagem: preencher(m.vesperaMsgOficina, { carro: ped.carro, quando: dataHora((ag as any).data_inicio, l, fuso) }) }; }, { ...dados, decisao: 'pendente' });
      await supabaseAdmin.from('orcamento_revisoes').update({ vespera_avisado_em: new Date().toISOString() }).eq('id', r.id);
      vesperas++;
    }
  }
  return { lembretes, vesperas };
}
