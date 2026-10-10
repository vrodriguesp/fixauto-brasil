import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notifCarroChegou, notifEtapa, notifProntoRetirar } from '@/lib/notif-servico';
import { entregarServico } from '@/lib/entrega';
import { conflitosNoPosto, postoAtivo } from '@/lib/postos';
import { diaNaOficina } from '@/lib/fuso';

export const dynamic = 'force-dynamic';

const ACOES = ['checkin', 'etapa', 'atribuir', 'elevador', 'posto_entrar', 'posto_sair', 'posto_reservar', 'posto_mover', 'posto_cancelar'];
const ETAPAS = ['recebido', 'diagnostico', 'aguardando_pecas', 'em_execucao', 'pausa_cliente', 'pausa_pecas', 'pausa_geral', 'teste_final', 'concluido', 'entregue'];

// Andamento do servico na oficina (check-in, etapas, mecanico). Antes cada
// tela gravava direto no banco: o pedido do cliente nao mudava para "em
// andamento" no check-in, o cliente nao era avisado das etapas, e nao ficava
// historico de quem atribuiu/trocou o mecanico. Agora tudo passa aqui:
// - quem pode: o dono da oficina (todas as acoes, inclusive em nome de um
//   mecanico) ou um mecanico com acesso ao portal (check-in e etapas);
// - check-in de agendamento futuro so com confirmacao (antecipar: true),
//   e a data de entrada passa a ser agora;
// - funciona sem nenhum mecanico cadastrado.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const { acao, status, observacao, funcionarioId, antecipar, boxId, ocupacaoId, inicio, fim } = corpo as Record<string, any>;
  let { eventoId } = corpo as Record<string, any>;
  if (!ACOES.includes(acao)) return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
  // mover/cancelar reserva: o carro vem da propria ocupacao
  let ocup: any = null;
  if (['posto_mover', 'posto_cancelar'].includes(acao)) {
    if (typeof ocupacaoId !== 'string') return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    const { data } = await supabaseAdmin.from('posto_ocupacoes').select('*').eq('id', ocupacaoId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
    ocup = data; eventoId = data.agenda_id;
  }
  if (typeof eventoId !== 'string') return NextResponse.json({ error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' }, { status: 400 });

  const { data: ev } = await supabaseAdmin
    .from('agenda')
    .select('id, oficina_id, solicitacao_id, status, data_inicio, data_fim, funcionario_id, box_id, titulo, oficina:oficinas(profile_id, nome_fantasia, endereco, cidade, pais)')
    .eq('id', eventoId)
    .maybeSingle();
  if (!ev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const ehDono = (ev as any).oficina?.profile_id === userId;
  const { data: euFunc } = await supabaseAdmin.from('funcionarios').select('id')
    .eq('oficina_id', ev.oficina_id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
  if (!ehDono && !euFunc) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  if (acao === 'atribuir' && !ehDono) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  // mecanico em nome de quem a acao e feita: o dono escolhe qualquer um da
  // equipe (ou nenhum); o mecanico logado e sempre ele mesmo
  let funcId: string | null = euFunc && !ehDono ? euFunc.id : null;
  if (ehDono && funcionarioId) {
    const { data: f } = await supabaseAdmin.from('funcionarios').select('id').eq('id', funcionarioId).eq('oficina_id', ev.oficina_id).eq('ativo', true).maybeSingle();
    if (!f) return NextResponse.json({ error: 'Mecânico inválido' }, { status: 400 });
    funcId = f.id;
  }
  const historico = (acaoH: string, detalhe: Record<string, unknown> = {}) =>
    supabaseAdmin.from('agenda_historico').insert({ agenda_id: ev.id, acao: acaoH, funcionario_id: funcId, por_profile_id: userId, detalhe });

  // cliente do pedido (so servicos vindos da plataforma)
  const avisarCliente = async (montar: (idioma: string | null, carro: string) => { titulo: string; mensagem: string }) => {
    if (!ev.solicitacao_id) return;
    const { data: sol } = await supabaseAdmin.from('solicitacoes')
      .select('cliente_id, veiculo:veiculos(fipe_marca, fipe_modelo), cliente:profiles!solicitacoes_cliente_id_fkey(idioma)')
      .eq('id', ev.solicitacao_id).maybeSingle();
    if (!sol?.cliente_id) return;
    const v = (sol as any).veiculo;
    const carro = v?.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo}` : '';
    const n = montar((sol as any).cliente?.idioma, carro);
    await supabaseAdmin.from('notificacoes').insert({
      profile_id: sol.cliente_id, tipo: 'servico_atualizado', titulo: n.titulo, mensagem: n.mensagem,
      dados: { solicitacao_id: ev.solicitacao_id },
    });
  };

  if (acao === 'checkin') {
    if (ev.status !== 'agendado') return NextResponse.json({ error: 'Check-in já feito', codigo: 'CHECKIN_JA_FEITO' }, { status: 409 });
    // "outro dia" no fuso da oficina: carro marcado para HOJE (mesmo que mais tarde)
    // nao pede confirmacao de chegada antecipada (teste do painel 10/10)
    const paisOf = (ev as any).oficina?.pais ?? null;
    const futuro = diaNaOficina(ev.data_inicio, paisOf) > diaNaOficina(new Date(), paisOf);
    if (futuro && !antecipar) {
      return NextResponse.json({ error: 'Agendado para outra data', codigo: 'CHECKIN_FUTURO', dataAgendada: ev.data_inicio }, { status: 409 });
    }
    const agora = new Date();
    const mudancas: Record<string, unknown> = { status: 'em_andamento' };
    if (futuro) {
      // carro chegou antes: a entrada passa a ser agora; a entrega prevista fica
      mudancas.data_inicio = agora.toISOString();
    }
    if (funcId) mudancas.funcionario_id = funcId;
    // "Colocar em": check-in e posto num clique (o gatilho da 057 abre a ocupacao)
    if (boxId) {
      const b = await postoAtivo(boxId, ev.oficina_id);
      if (!b) return NextResponse.json({ error: 'Posto inválido', codigo: 'ELEVADOR_INVALIDO' }, { status: 400 });
      const c = await conflitosNoPosto(b, agora, null, ev.id);
      if (c.length) return NextResponse.json({ error: 'Posto ocupado', codigo: 'CONFLITO_POSTO', ocupadoPor: c }, { status: 409 });
      mudancas.box_id = b.id;
    }
    await supabaseAdmin.from('agenda').update(mudancas).eq('id', ev.id);
    await supabaseAdmin.from('manutencao_etapas').insert({
      agenda_id: ev.id, funcionario_id: funcId, status: 'recebido', observacao: typeof observacao === 'string' ? observacao.slice(0, 500) || null : null,
    });
    await historico(futuro ? 'checkin_antecipado' : 'checkin', futuro ? { data_agendada: ev.data_inicio } : {});
    if (ev.solicitacao_id) {
      // o cliente passa a ver "em andamento" (antes ficava "aceita")
      await supabaseAdmin.from('solicitacoes').update({ status: 'em_andamento' }).eq('id', ev.solicitacao_id).in('status', ['aceita', 'em_orcamento', 'aberta']);
    }
    await avisarCliente((idioma, carro) => notifCarroChegou(idioma, { oficina: (ev as any).oficina?.nome_fantasia || '', carro }));
    return NextResponse.json({ ok: true });
  }

  if (acao === 'etapa') {
    if (!ETAPAS.includes(status)) return NextResponse.json({ error: 'Etapa inválida', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    if (ev.status !== 'em_andamento') return NextResponse.json({ error: 'Faça o check-in antes', codigo: 'SEM_CHECKIN' }, { status: 409 });
    // entrega: o mesmo fechamento da confirmacao (garantia, avaliacao, comissao)
    if (status === 'entregue') {
      const entregou = await entregarServico({ eventoId: ev.id, solicitacaoId: ev.solicitacao_id, oficinaDoEvento: ev.oficina_id, oficinaNome: (ev as any).oficina?.nome_fantasia || '', callerId: userId });
      if (!entregou) return NextResponse.json({ error: 'O carro não está em serviço', codigo: 'NAO_EM_SERVICO' }, { status: 409 });
      return NextResponse.json({ ok: true });
    }
    // mesma etapa repetida em seguida (duplo clique): nao grava nem avisa de novo (M-16)
    const { data: ultima } = await supabaseAdmin.from('manutencao_etapas').select('status, created_at')
      .eq('agenda_id', ev.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ultima && ultima.status === status && Date.now() - new Date(ultima.created_at).getTime() < 10 * 60 * 1000) {
      return NextResponse.json({ ok: true, repetida: true });
    }
    await supabaseAdmin.from('manutencao_etapas').insert({
      agenda_id: ev.id, funcionario_id: funcId, status, observacao: typeof observacao === 'string' ? observacao.slice(0, 500) || null : null,
    });
    await historico('etapa', { status });
    const of = (ev as any).oficina;
    await avisarCliente((idioma, carro) => (status === 'concluido'
      ? notifProntoRetirar(idioma, { carro, oficina: of?.nome_fantasia || '', endereco: [of?.endereco, of?.cidade].filter(Boolean).join(', ') })
      : notifEtapa(idioma, { carro, status })));
    return NextResponse.json({ ok: true });
  }

  // Postos (elevador, posto no chao, vaga de espera) por intervalo de horas
  // (migracao 057): o dono mexe em qualquer carro; o mecanico, nos carros dele.
  const podePosto = ehDono || !!(euFunc && ev.funcionario_id === euFunc.id);
  if (acao.startsWith('posto_') || acao === 'elevador') {
    if (!podePosto) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    if (['concluido', 'cancelado'].includes(ev.status)) return NextResponse.json({ error: 'Serviço encerrado', codigo: 'NAO_EM_SERVICO' }, { status: 409 });
  }
  // carro ja na oficina: "elevador" (Quadro de 14 dias) = colocar/tirar agora
  const acaoPosto = acao === 'elevador' && ev.status === 'em_andamento' ? (boxId ? 'posto_entrar' : 'posto_sair') : acao;

  if (acaoPosto === 'posto_entrar') {
    if (ev.status !== 'em_andamento') return NextResponse.json({ error: 'Faça o check-in antes', codigo: 'SEM_CHECKIN' }, { status: 409 });
    const b = await postoAtivo(boxId, ev.oficina_id);
    if (!b) return NextResponse.json({ error: 'Posto inválido', codigo: 'ELEVADOR_INVALIDO' }, { status: 400 });
    const agora = new Date();
    const c = await conflitosNoPosto(b, agora, null, ev.id);
    if (c.length) return NextResponse.json({ error: 'Posto ocupado', codigo: 'CONFLITO_POSTO', ocupadoPor: c }, { status: 409 });
    const { data: aberta } = await supabaseAdmin.from('posto_ocupacoes').select('id, box_id, inicio').eq('agenda_id', ev.id).eq('real', true).is('fim', null).maybeSingle();
    if (aberta?.box_id === b.id) return NextResponse.json({ ok: true });
    if (aberta) await supabaseAdmin.from('posto_ocupacoes').update({ fim: new Date(Math.max(agora.getTime(), new Date(aberta.inicio).getTime() + 1000)).toISOString() }).eq('id', aberta.id);
    // reserva deste carro neste posto (comecando em ate 2 h) vira a ocupacao real
    const { data: reserva } = await supabaseAdmin.from('posto_ocupacoes').select('id').eq('agenda_id', ev.id).eq('box_id', b.id).eq('real', false)
      .lte('inicio', new Date(agora.getTime() + 2 * 3600e3).toISOString()).gt('fim', agora.toISOString()).order('inicio').limit(1).maybeSingle();
    const { error } = reserva
      ? await supabaseAdmin.from('posto_ocupacoes').update({ real: true, inicio: agora.toISOString(), fim: null }).eq('id', reserva.id)
      : await supabaseAdmin.from('posto_ocupacoes').insert({ oficina_id: ev.oficina_id, box_id: b.id, agenda_id: ev.id, inicio: agora.toISOString(), real: true, funcionario_id: ev.funcionario_id, por_profile_id: userId });
    if (error) return NextResponse.json({ error: 'Não foi possível salvar', codigo: 'ERRO' }, { status: 500 });
    await historico('elevador', { anterior: aberta?.box_id ?? null, novo: b.id });
    return NextResponse.json({ ok: true });
  }

  if (acaoPosto === 'posto_sair') {
    const { data: aberta } = await supabaseAdmin.from('posto_ocupacoes').select('id, box_id, inicio').eq('agenda_id', ev.id).eq('real', true).is('fim', null).maybeSingle();
    if (aberta) {
      await supabaseAdmin.from('posto_ocupacoes').update({ fim: new Date(Math.max(Date.now(), new Date(aberta.inicio).getTime() + 1000)).toISOString() }).eq('id', aberta.id);
      await historico('elevador', { anterior: aberta.box_id, novo: null });
    }
    return NextResponse.json({ ok: true });
  }

  // reserva de um intervalo: termina no futuro, comeca em ate 15 dias, ate 12 h;
  // o passado nao se edita (e o registro do que aconteceu)
  if (acaoPosto === 'posto_reservar' || acaoPosto === 'posto_mover') {
    if (ocup?.real) return NextResponse.json({ error: 'Ocupação real não se move', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    const b = await postoAtivo(acaoPosto === 'posto_mover' ? (boxId || ocup.box_id) : boxId, ev.oficina_id);
    if (!b) return NextResponse.json({ error: 'Posto inválido', codigo: 'ELEVADOR_INVALIDO' }, { status: 400 });
    const ini = new Date(inicio ?? ocup?.inicio); const fi = new Date(fim ?? ocup?.fim);
    const agoraMs = Date.now();
    if (!Number.isFinite(ini.getTime()) || !Number.isFinite(fi.getTime()) || fi <= ini || fi.getTime() - ini.getTime() > 12 * 3600e3
        || fi.getTime() <= agoraMs || ini.getTime() > agoraMs + 15 * 86400e3) {
      return NextResponse.json({ error: 'Horário inválido', codigo: 'HORARIO_INVALIDO' }, { status: 400 });
    }
    const c = await conflitosNoPosto(b, ini, fi, ev.id, ocup?.id);
    if (c.length) return NextResponse.json({ error: 'Posto ocupado', codigo: 'CONFLITO_POSTO', ocupadoPor: c }, { status: 409 });
    const obs = typeof observacao === 'string' ? observacao.slice(0, 200) || null : null;
    const { error } = ocup
      ? await supabaseAdmin.from('posto_ocupacoes').update({ box_id: b.id, inicio: ini.toISOString(), fim: fi.toISOString(), ...(observacao !== undefined ? { observacao: obs } : {}) }).eq('id', ocup.id)
      : await supabaseAdmin.from('posto_ocupacoes').insert({ oficina_id: ev.oficina_id, box_id: b.id, agenda_id: ev.id, inicio: ini.toISOString(), fim: fi.toISOString(), real: false, observacao: obs, funcionario_id: ev.funcionario_id, por_profile_id: userId });
    if (error) return NextResponse.json({ error: 'Não foi possível salvar', codigo: 'ERRO' }, { status: 500 });
    await historico('posto_reserva', { box: b.id, inicio: ini.toISOString(), fim: fi.toISOString(), ...(ocup ? { movida: ocup.id } : {}) });
    return NextResponse.json({ ok: true });
  }

  if (acaoPosto === 'posto_cancelar') {
    if (ocup.real) return NextResponse.json({ error: 'Ocupação real não se cancela', codigo: 'DADOS_INVALIDOS' }, { status: 400 });
    await supabaseAdmin.from('posto_ocupacoes').delete().eq('id', ocup.id);
    await historico('posto_reserva', { cancelada: ocup.id, box: ocup.box_id });
    return NextResponse.json({ ok: true });
  }

  // carro ainda agendado: posto PLANEJADO (vira ocupacao real no check-in)
  if (acao === 'elevador') {
    let novo: string | null = null;
    if (boxId) {
      const { data: b } = await supabaseAdmin.from('oficina_boxes').select('id').eq('id', boxId).eq('oficina_id', ev.oficina_id).eq('ativo', true).maybeSingle();
      if (!b) return NextResponse.json({ error: 'Elevador inválido', codigo: 'ELEVADOR_INVALIDO' }, { status: 400 });
      novo = b.id;
    }
    await supabaseAdmin.from('agenda').update({ box_id: novo }).eq('id', ev.id);
    await historico('elevador', { anterior: (ev as any).box_id ?? null, novo });
    return NextResponse.json({ ok: true });
  }

  // atribuir (ou tirar) o mecanico responsavel
  await supabaseAdmin.from('agenda').update({ funcionario_id: funcId }).eq('id', ev.id);
  await historico('atribuido', { anterior: ev.funcionario_id });
  return NextResponse.json({ ok: true });
}
