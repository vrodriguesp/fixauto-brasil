import { supabaseAdmin } from './supabase-admin';
import { horaLocalEmUtc, diaNaOficina, fusoDoPais } from './fuso';
import { dataValida } from './agenda-oficina';
import { emTodasAsLinguas, type TextoAviso } from './notif-textos';
import { textosNovasDatas, listaDeDatas, diaETurno } from './notif-novas-datas';
import { preencher, dataJanela } from './notif-agenda';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { SITE_URL, idiomaDoSite } from './site-url';
import { linkPedido } from './link-acesso';
import { orcamentoVencido } from './orcamento-validade';
import { conflitoHorario, janelaDoSlot, janelaDaSugestao, turnoDaJanela, minutosDe, JANELA_MIN, type Janela, type ContextoOficina } from './turnos';

// "Tenho interesse, mande novas datas" (migracao 079, dono 11/11, docs/DESENHO_079_novas_datas.md).
//  - o motorista pede quando TODOS os horarios do orcamento ja passaram (fuso da oficina), com
//    ate 3 sugestoes (dia + turno, futuras, ate 30 dias, sem repetir) e uma mensagem curta;
//  - um pedido pendente por orcamento (indice unico no banco);
//  - a oficina confirma uma sugestao ainda futura (vira horario origem='cliente' e o orcamento e
//    aceito/agendado pelo mesmo nucleo do aceite) ou manda de 1 a 3 horarios novos (orcamento igual,
//    sem nova revisao, comissao intacta);
//  - o pendente cai (cancelado) quando o pedido expira, e cancelado ou aceito com outra oficina;
//  - cron de hora em hora: lembrete a oficina depois de 24 h sem resposta (uma vez);
//  - SEM aviso preventivo: a oficina so e chamada quando o cliente pede (dono 11/11);
//  - orcamento vencido (validade antes de hoje, fuso da oficina): nem pedido nem resposta (ORCAMENTO_VENCIDO).

type Res = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

export const MAX_SUGESTOES = 3;
export const MAX_DIAS_SUGESTAO = 30;
export const MAX_HORARIOS_NOVOS = 3;
export const MAX_DIAS_HORARIO = 120;
export const MENSAGEM_MAX = 300;
export const ESTADOS_ORCAMENTO = ['enviado', 'visualizado'];
export const ESTADOS_PEDIDO = ['aberta', 'em_orcamento', 'no_show'];
export type Turno = 'manha' | 'tarde';
export type Sugestao = { data: string; turno: Turno };
const TURNOS: Turno[] = ['manha', 'tarde'];

// ---------- regras puras ----------
// check-in v2: cada horario tem a JANELA gravada (hora_inicio/hora_fim); linha antiga = 08-12 / 13-17
type SlotJ = { data_checkin: string; turno: string; hora_inicio?: string | null; hora_fim?: string | null };
/** fim da janela (hora local da oficina) em ms - mesma regra do aceite (HORARIO_VENCIDO) */
export const fimDoTurno = (data: string, turno: string, pais?: string | null, janela?: Janela | null) => Date.parse(horaLocalEmUtc(data, (janela || janelaDoSlot({ turno })).fim, pais));
export const turnoAindaVale = (data: string, turno: string, pais?: string | null, agora = Date.now(), janela?: Janela | null) => fimDoTurno(data, turno, pais, janela) > agora;
/** inicio da janela (hora local da oficina) em ms */
export const inicioDoTurno = (data: string, turno: string, pais?: string | null, janela?: Janela | null) => Date.parse(horaLocalEmUtc(data, (janela || janelaDoSlot({ turno })).inicio, pais));
/** a oficina so confirma a data sugerida (aceite automatico) com a janela comecando daqui a 2 h ou mais (revisao Fable S2);
 *  a janela da sugestao e a 1a faixa do perfil/grade nesse turno (spec v2 2.13) */
export const ANTECEDENCIA_CONFIRMAR_MS = 2 * 3600e3;
export const podeConfirmarSugestao = (s: { data: string; turno: string }, pais?: string | null, agora = Date.now(), ctx?: ContextoOficina | null) =>
  inicioDoTurno(s.data, s.turno, pais, ctx ? janelaDaSugestao(s.data, s.turno as Turno, ctx) : null) - agora >= ANTECEDENCIA_CONFIRMAR_MS;
/** nenhum horario ainda escolhivel (sem horario conta como sem datas) */
export const semDatasFuturas = (slots: SlotJ[], pais?: string | null, agora = Date.now()) =>
  !slots.some((s) => turnoAindaVale(s.data_checkin, s.turno, pais, agora, janelaDoSlot(s)));
/** contexto do perfil da oficina para as faixas (horario + recepcao + almoco) */
export const ctxDaOficina = (of: any): ContextoOficina => ({
  horario: of?.horario_funcionamento, recepcao_inicio: of?.recepcao_inicio, recepcao_fim: of?.recepcao_fim, almoco_inicio: of?.almoco_inicio, almoco_fim: of?.almoco_fim,
});
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:00)?$/;
const somarDias = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** sugestoes do motorista (de amanha ate 30 dias, fuso da oficina): null = invalidas */
export function validarSugestoes(bruto: unknown, pais?: string | null, agora = Date.now()): Sugestao[] | null {
  if (bruto == null) return [];
  if (!Array.isArray(bruto) || bruto.length > MAX_SUGESTOES) return null;
  const hoje = diaNaOficina(new Date(agora), pais);
  const limite = somarDias(hoje, MAX_DIAS_SUGESTAO);
  const vistos = new Set<string>();
  const out: Sugestao[] = [];
  for (const s of bruto) {
    const data = (s as any)?.data, turno = (s as any)?.turno;
    if (!dataValida(data) || !TURNOS.includes(turno)) return null;
    if (data <= hoje || data > limite) return null;
    const k = `${data}|${turno}`;
    if (vistos.has(k)) return null;
    vistos.add(k); out.push({ data, turno });
  }
  return out.sort((a, b) => (a.data + a.turno).localeCompare(b.data + b.turno));
}

/** horarios novos da oficina; a previsao de entrega cai para a data + prazo do orcamento. Check-in v2: cada horario
 *  vem com a janela (hora_inicio/hora_fim, minimo 30 min) e o turno e derivado dela; sem janela (cliente antigo)
 *  vale a 1a faixa do perfil nesse turno (mesma regra da confirmacao da sugestao). */
export type HorarioNovo = { data_checkin: string; turno: Turno; hora_inicio: string; hora_fim: string; data_previsao_entrega: string };
export function validarHorariosNovos(bruto: unknown, prazoDias: number, pais?: string | null, agora = Date.now(), ctx?: ContextoOficina | null):
  { ok: true; horarios: HorarioNovo[] } | { ok: false; codigo: string } {
  if (!Array.isArray(bruto) || bruto.length < 1 || bruto.length > MAX_HORARIOS_NOVOS) return { ok: false, codigo: 'DADOS_INVALIDOS' };
  const limite = somarDias(diaNaOficina(new Date(agora), pais), MAX_DIAS_HORARIO);
  const vistos = new Set<string>();
  const horarios: HorarioNovo[] = [];
  for (const h of bruto) {
    const data = (h as any)?.data, prev = (h as any)?.previsao;
    if (!dataValida(data) || data > limite) return { ok: false, codigo: 'DADOS_INVALIDOS' };
    const hi = (h as any)?.hora_inicio, hf = (h as any)?.hora_fim;
    let janela: Janela;
    if (hi != null || hf != null) {
      if (!HORA_RE.test(String(hi)) || !HORA_RE.test(String(hf))) return { ok: false, codigo: 'DADOS_INVALIDOS' };
      janela = { inicio: String(hi).slice(0, 5), fim: String(hf).slice(0, 5) };
      if ((minutosDe(janela.fim) ?? 0) - (minutosDe(janela.inicio) ?? 0) < JANELA_MIN) return { ok: false, codigo: 'DADOS_INVALIDOS' };
    } else {
      const t0 = (h as any)?.turno;
      if (!TURNOS.includes(t0)) return { ok: false, codigo: 'DADOS_INVALIDOS' };
      janela = janelaDaSugestao(data, t0, ctx);
    }
    const turno = turnoDaJanela(janela);
    if (!turnoAindaVale(data, turno, pais, agora, janela)) return { ok: false, codigo: 'HORARIO_VENCIDO' };
    if (prev != null && prev !== '' && !dataValida(prev)) return { ok: false, codigo: 'DADOS_INVALIDOS' };
    const previsao = prev ? String(prev) : somarDias(data, Math.max(0, Number(prazoDias) || 0));
    if (previsao < data) return { ok: false, codigo: 'PREVISAO_ANTES_DA_DATA' };
    const k = `${data}|${janela.inicio}|${janela.fim}`;
    if (vistos.has(k)) return { ok: false, codigo: 'DADOS_INVALIDOS' };
    vistos.add(k); horarios.push({ data_checkin: data, turno, hora_inicio: janela.inicio, hora_fim: janela.fim, data_previsao_entrega: previsao });
  }
  return { ok: true, horarios };
}

// ---------- apoio ----------
const carroDe = (v: any) => [v?.fipe_marca, v?.fipe_modelo].filter(Boolean).join(' ');
const SEL_ORC = 'id, status, prazo_dias, validade, valor_total, revisao_numero, solicitacao_id, oficina_id, '
  + 'disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(id, data_checkin, turno, hora_inicio, hora_fim, data_previsao_entrega), '
  + 'solicitacao:solicitacoes(id, numero, status, cliente_id, cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma), veiculo:veiculos(fipe_marca, fipe_modelo)), '
  + 'oficina:oficinas(id, nome_fantasia, pais, horario_funcionamento, recepcao_inicio, recepcao_fim, almoco_inicio, almoco_fim, profile_id, profile:profiles!oficinas_profile_id_fkey(nome, email, idioma))';

async function lerOrcamento(orcamentoId: string) {
  const { data } = await supabaseAdmin.from('orcamentos').select(SEL_ORC).eq('id', orcamentoId).maybeSingle();
  return data as any;
}

async function notificar(profileId: string | undefined | null, tipo: string, idioma: string | null | undefined, montar: (l: string) => TextoAviso, dados: Record<string, unknown>) {
  if (!profileId) return;
  const n = montar(idioma || 'en');
  const { error } = await supabaseAdmin.from('notificacoes').insert({ profile_id: profileId, tipo, titulo: n.titulo, mensagem: n.mensagem, dados: { ...dados, textos: emTodasAsLinguas(montar) } });
  if (error) console.error('[pedido-datas] aviso:', error.message);
}

const caixa = (corpo: string) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:white;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">${corpo}</div>`;
const botao = (href: string, texto: string) => `<p><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1e40af;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(texto)}</a></p>`;
const lista = (itens: string[]) => `<ul>${itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
const site = () => SITE_URL.replace('://www.', '://');

/** Equipe da oficina que pode responder (dono ou funcionario ativo que nao seja mecanico). */
async function podeResponder(oficina: any, userId: string) {
  if (oficina?.profile_id === userId) return true;
  const { data: f } = await supabaseAdmin.from('funcionarios').select('cargo').eq('oficina_id', oficina?.id).eq('profile_id', userId).eq('ativo', true).maybeSingle();
  return !!f && f.cargo !== 'mecanico';
}

/** Cancela os pedidos pendentes (do pedido inteiro ou de um orcamento). Com `avisarExceto` (aceite de um
 *  orcamento), as OUTRAS oficinas que tinham pedido pendente recebem "o cliente fechou com outra oficina". */
export async function cancelarPedidosDatasPendentes(p: { solicitacaoId?: string; orcamentoId?: string; avisarExceto?: string }) {
  if (!p.solicitacaoId && !p.orcamentoId) return 0;
  let q = supabaseAdmin.from('orcamento_pedido_datas').update({ status: 'cancelado' }).eq('status', 'pendente');
  if (p.solicitacaoId) q = q.eq('solicitacao_id', p.solicitacaoId);
  if (p.orcamentoId) q = q.eq('orcamento_id', p.orcamentoId);
  const { data, error } = await q.select('id, oficina_id, orcamento_id, solicitacao_id');
  if (error) throw new Error(error.message);
  if (p.avisarExceto) {
    for (const c of (data || []).filter((x) => x.oficina_id !== p.avisarExceto)) {
      const orc = await lerOrcamento(c.orcamento_id);
      const carro = carroDe(orc?.solicitacao?.veiculo);
      await notificar(orc?.oficina?.profile_id, 'pedido_novas_datas_cancelado', orc?.oficina?.profile?.idioma, (l) => { const t = textosNovasDatas(l); return { titulo: t.fechouOutraTitulo, mensagem: preencher(t.fechouOutraMsg, { carro: carro || '-' }) }; },
        { solicitacao_id: c.solicitacao_id, orcamento_id: c.orcamento_id, pedido_datas_id: c.id });
    }
  }
  return data?.length || 0;
}

/** validade do orcamento ate pelo menos a maior data nova (a oficina esta dizendo que o preco vale ate la;
 *  sem contar revisao - revisao Fable S1) */
async function estenderValidade(orc: any, datas: string[]) {
  const maior = datas.slice().sort().at(-1);
  if (maior && (!orc.validade || String(orc.validade).slice(0, 10) < maior)) await supabaseAdmin.from('orcamentos').update({ validade: maior }).eq('id', orc.id);
}

/** Pedido de datas que nao pode mais ser respondido: codigo certo para a oficina (revisao Fable S4). */
async function codigoPedidoFechado(orcamentoId: string): Promise<Res> {
  const { data } = await supabaseAdmin.from('orcamento_pedido_datas').select('status').eq('orcamento_id', orcamentoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data || data.status === 'cancelado') return res(409, { error: 'Pedido cancelado', codigo: 'ORCAMENTO_INDISPONIVEL' });
  return res(409, { error: 'Pedido já respondido', codigo: 'PEDIDO_DATAS_RESPONDIDO' });
}

// ---------- motorista: pedir novas datas ----------
export async function pedirNovasDatas(userId: string, orcamentoId: string, corpo: any): Promise<Res> {
  const orc = await lerOrcamento(orcamentoId);
  if (!orc) return res(404, { error: 'Não encontrado' });
  const sol = orc.solicitacao, of = orc.oficina;
  if (sol?.cliente_id !== userId) return res(403, { error: 'Acesso negado' });
  if (sol?.status === 'expirada') return res(409, { error: 'Pedido expirado', codigo: 'PEDIDO_EXPIRADO' });
  if (!ESTADOS_ORCAMENTO.includes(orc.status) || !ESTADOS_PEDIDO.includes(sol?.status)) return res(409, { error: 'Orçamento não está disponível', codigo: 'ORCAMENTO_INDISPONIVEL' });
  if (orcamentoVencido(orc.validade, of?.pais)) return res(409, { error: 'Orçamento vencido', codigo: 'ORCAMENTO_VENCIDO' });
  if (!semDatasFuturas(orc.disponibilidade || [], of?.pais)) return res(409, { error: 'Ainda há horários', codigo: 'DATAS_AINDA_VALIDAS' });
  const sugestoes = validarSugestoes(corpo?.sugestoes, of?.pais);
  if (!sugestoes) return res(400, { error: 'Sugestão inválida', codigo: 'SUGESTAO_INVALIDA' });
  const mensagem = typeof corpo?.mensagem === 'string' ? corpo.mensagem.trim() : '';
  if (mensagem.length > MENSAGEM_MAX) return res(400, { error: 'Mensagem longa', codigo: 'DADOS_INVALIDOS' });

  const { data: ped, error } = await supabaseAdmin.from('orcamento_pedido_datas').insert({
    orcamento_id: orc.id, solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id, cliente_id: userId,
    sugestoes, mensagem: mensagem || null,
    // retrato do orcamento que o cliente viu (revisao Fable M1)
    valor_total_pedido: orc.valor_total, revisao_numero_pedido: orc.revisao_numero ?? 0,
  }).select('id, created_at').single();
  if (error) {
    if (error.code === '23505') return res(409, { error: 'Já existe um pedido pendente', codigo: 'PEDIDO_DATAS_PENDENTE' });
    return res(500, { error: error.message });
  }

  const carro = carroDe(sol?.veiculo);
  const idiomaCli = sol?.cliente?.idioma, idiomaOf = of?.profile?.idioma;
  // linha no chat do pedido, na lingua de quem escreve (o chat traduz para quem le)
  const tCli = textosNovasDatas(idiomaCli);
  const textoChat = [tCli.chatPedido, sugestoes.length ? preencher(tCli.chatSugestoes, { datas: listaDeDatas(sugestoes.map((s) => ({ ...s, janela: janelaDaSugestao(s.data, s.turno, ctxDaOficina(of)) })), idiomaCli) }) : '', mensagem].filter(Boolean).join('\n');
  await supabaseAdmin.from('mensagens').insert({ solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id, remetente_id: userId, texto: textoChat });
  await notificar(of?.profile_id, 'pedido_novas_datas', idiomaOf, (l) => {
    const t = textosNovasDatas(l);
    return { titulo: t.pedidoTitulo, mensagem: preencher(sugestoes.length ? t.pedidoMsg : t.pedidoMsgSemSugestao, { carro }) };
  }, { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, pedido_datas_id: ped.id });
  // e-mail a oficina
  const pOf = of?.profile;
  if (pOf?.email) {
    const l = idiomaDoSite(idiomaOf); const t = textosNovasDatas(l); const numero = String(sol?.numero ?? '');
    const html = caixa(`<p>${escapeHtml(preencher(t.emailOla, { n: pOf.nome || of?.nome_fantasia || '' }))}</p>
      <p style="font-size:16px;"><strong>${escapeHtml(preencher(t.emailPedidoTexto, { numero, carro: carro || '-' }))}</strong></p>
      ${sugestoes.length ? `<p>${escapeHtml(t.emailSugestoes)}:</p>${lista(sugestoes.map((s) => diaETurno(s.data, s.turno, l, janelaDaSugestao(s.data, s.turno, ctxDaOficina(of)))))}` : ''}
      ${mensagem ? `<p style="background:#f3f4f6;padding:10px 12px;border-radius:8px;"><strong>${escapeHtml(t.emailMensagem)}:</strong> ${escapeHtml(mensagem)}</p>` : ''}
      ${botao(`${site()}/r/${numero}?o=${encodeURIComponent(l)}&p=1`, t.emailPedidoBotao)}`);
    await enviarEmail({ para: pOf.email, assunto: preencher(t.emailPedidoAssunto, { numero }), html }).catch(() => false);
  }
  return res(200, { ok: true, id: ped.id, created_at: ped.created_at, sugestoes });
}

// ---------- oficina: confirmar sugestao ou mandar outras datas ----------
export async function responderNovasDatas(userId: string, orcamentoId: string, corpo: any): Promise<Res> {
  const orc = await lerOrcamento(orcamentoId);
  if (!orc) return res(404, { error: 'Não encontrado' });
  const sol = orc.solicitacao, of = orc.oficina;
  if (!(await podeResponder(of, userId))) return res(403, { error: 'Acesso negado' });
  if (sol?.status === 'expirada') return res(409, { error: 'Pedido expirado', codigo: 'PEDIDO_EXPIRADO' });
  if (!ESTADOS_ORCAMENTO.includes(orc.status) || !ESTADOS_PEDIDO.includes(sol?.status)) return res(409, { error: 'Orçamento não está disponível', codigo: 'ORCAMENTO_INDISPONIVEL' });
  // orcamento vencido: a oficina revisa o orcamento (nova validade) em vez de mandar datas
  if (orcamentoVencido(orc.validade, of?.pais)) return res(409, { error: 'Orçamento vencido', codigo: 'ORCAMENTO_VENCIDO' });
  const { data: pend } = await supabaseAdmin.from('orcamento_pedido_datas').select('id, sugestoes, valor_total_pedido, revisao_numero_pedido').eq('orcamento_id', orc.id).eq('status', 'pendente').maybeSingle();
  const carro = carroDe(sol?.veiculo);
  const idiomaCli = sol?.cliente?.idioma, idiomaOf = of?.profile?.idioma;
  const fuso = fusoDoPais(of?.pais);
  // so responde a um pedido do cliente (a oficina nao e chamada a propor datas sem pedido - dono 11/11)
  if (!pend) return codigoPedidoFechado(orc.id);
  const dadosCli = { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, pedido_datas_id: pend.id };

  // a) confirmar a sugestao do motorista: vira horario do orcamento e o orcamento e aceito/agendado
  if (corpo?.confirmar !== undefined && corpo?.confirmar !== null) {
    const i = Number(corpo.confirmar);
    const sug = Number.isInteger(i) ? (pend.sugestoes as Sugestao[])[i] : undefined;
    if (!sug) return res(400, { error: 'Sugestão inválida', codigo: 'DADOS_INVALIDOS' });
    // a janela que vale = 1a faixa do perfil/grade nesse turno (2.13); gravada no horario antes do aceite
    const janelaSug = janelaDaSugestao(sug.data, sug.turno, ctxDaOficina(of));
    if (!podeConfirmarSugestao(sug, of?.pais, Date.now(), ctxDaOficina(of))) return res(409, { error: 'Sugestão vencida', codigo: 'SUGESTAO_VENCIDA' });
    // o orcamento mudou depois do pedido: o cliente nao viu este preco - so mandar outras datas
    if (pend.valor_total_pedido != null && (Number(pend.valor_total_pedido) !== Number(orc.valor_total) || (pend.revisao_numero_pedido ?? 0) !== (orc.revisao_numero ?? 0))) {
      return res(409, { error: 'Orçamento mudou', codigo: 'ORCAMENTO_MUDOU' });
    }
    const prev = corpo?.previsao;
    if (prev != null && prev !== '' && !dataValida(prev)) return res(400, { error: 'Dados inválidos', codigo: 'DADOS_INVALIDOS' });
    const previsao = prev ? String(prev) : somarDias(sug.data, Math.max(0, Number(orc.prazo_dias) || 0));
    if (previsao < sug.data) return res(400, { error: 'Previsão antes da chegada', codigo: 'PREVISAO_ANTES_DA_DATA' });
    // trava: so uma resposta por pedido (dois cliques / duas pessoas da equipe)
    const { data: trava } = await supabaseAdmin.from('orcamento_pedido_datas')
      .update({ status: 'atendido', resposta: 'confirmou', atendido_em: new Date().toISOString() })
      .eq('id', pend.id).eq('status', 'pendente').select('id');
    if (!trava?.length) return codigoPedidoFechado(orc.id);
    const { data: slot, error: eSlot } = await supabaseAdmin.from('orcamento_disponibilidade')
      .insert({ orcamento_id: orc.id, data_checkin: sug.data, turno: turnoDaJanela(janelaSug), hora_inicio: janelaSug.inicio, hora_fim: janelaSug.fim, data_previsao_entrega: previsao, origem: 'cliente' }).select('id').single();
    // aceite recusado: o horario sai; o pedido volta a pendente, ou cai se outro orcamento ja foi aceito
    const desfazer = async (slotId?: string, cancelar = false) => {
      if (slotId) {
        const { error: eDel } = await supabaseAdmin.from('orcamento_disponibilidade').delete().eq('id', slotId);
        if (eDel) console.error('[novas-datas] horario nao apagado:', eDel.message);
      }
      await supabaseAdmin.from('orcamento_pedido_datas').update(cancelar ? { status: 'cancelado' } : { status: 'pendente', resposta: null, atendido_em: null }).eq('id', pend.id).eq('status', 'atendido');
    };
    if (eSlot || !slot) { await desfazer(); return res(500, { error: eSlot?.message || 'falha' }); }
    // validade antes do aceite (a sugestao ja passou nas conferencias; depois do aceite ela nao importa - auditoria S7)
    await estenderValidade(orc, [sug.data]);
    const { aceitarOrcamento } = await import('./aceitar-orcamento');
    let r = await aceitarOrcamento({ orcamentoId: orc.id, slotId: slot.id, clienteId: sol.cliente_id, emailOficina: false }).catch((e) => ({ status: 500, body: { error: (e as Error).message } }));
    if (r.status !== 200) {
      // excecao DEPOIS do passo 1 do aceite: o orcamento ja ficou aceito neste horario - nao desfaz; o aceite
      // aconteceu, segue como confirmado (auditoria Fable 079, S4)
      const { data: agora } = await supabaseAdmin.from('orcamentos').select('status, disponibilidade_escolhida_id').eq('id', orc.id).maybeSingle();
      if (agora?.status === 'aceito' && agora.disponibilidade_escolhida_id === slot.id) {
        console.error('[novas-datas] aceite com erro depois de gravado:', JSON.stringify(r.body));
        r = { status: 200, body: { success: true } };
      } else {
        await desfazer(slot.id, (r.body as any)?.codigo === 'ORCAMENTO_INDISPONIVEL');
        return r;
      }
    }
    const inicio = horaLocalEmUtc(sug.data, janelaSug.inicio, of?.pais);
    const fim = horaLocalEmUtc(sug.data, janelaSug.fim, of?.pais);
    await supabaseAdmin.from('mensagens').insert({ solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id, remetente_id: userId, texto: preencher(textosNovasDatas(idiomaOf).chatConfirmada, { quando: dataJanela(inicio, fim, idiomaOf, fuso) }) });
    await notificar(sol.cliente_id, 'novas_datas_confirmada', idiomaCli, (l) => {
      const t = textosNovasDatas(l);
      return { titulo: t.confirmadaTitulo, mensagem: preencher(t.confirmadaMsg, { oficina: of?.nome_fantasia || '', quando: dataJanela(inicio, fim, l, fuso) }) };
    }, dadosCli);
    return res(200, { ok: true, modo: 'confirmou', slotId: slot.id });
  }

  // b) mandar outras datas
  const v = validarHorariosNovos(corpo?.horarios, orc.prazo_dias, of?.pais, Date.now(), ctxDaOficina(of));
  if (!v.ok) return res(v.codigo === 'HORARIO_VENCIDO' ? 409 : 400, { error: 'Dados inválidos', codigo: v.codigo });
  // dia em que a oficina esta fechada pelo proprio horario (dono 14/11; a tela ja bloqueia)
  if (v.horarios.some((h) => conflitoHorario(h.data_checkin, h.turno, of?.horario_funcionamento) === 'fechado')) return res(400, { error: 'Oficina fechada neste dia', codigo: 'DIA_FECHADO' });
  const chave = (s: { data_checkin: string; turno: string; hora_inicio?: string | null; hora_fim?: string | null }) => { const j = janelaDoSlot(s); return `${s.data_checkin}|${j.inicio}|${j.fim}`; };
  const existentes = new Set((orc.disponibilidade || []).map(chave));
  const novos = v.horarios.filter((h) => !existentes.has(chave(h)));
  if (!novos.length) return res(400, { error: 'Horários repetidos', codigo: 'DADOS_INVALIDOS' });
  const { data: trava } = await supabaseAdmin.from('orcamento_pedido_datas')
    .update({ status: 'atendido', resposta: 'novas_datas', atendido_em: new Date().toISOString() })
    .eq('id', pend.id).eq('status', 'pendente').select('id');
  if (!trava?.length) return codigoPedidoFechado(orc.id);
  const { error: eIns } = await supabaseAdmin.from('orcamento_disponibilidade').insert(novos.map((h) => ({ orcamento_id: orc.id, ...h, origem: 'oficina' })));
  if (eIns) {
    await supabaseAdmin.from('orcamento_pedido_datas').update({ status: 'pendente', resposta: null, atendido_em: null }).eq('id', pend.id);
    return res(500, { error: eIns.message });
  }
  await estenderValidade(orc, novos.map((h) => h.data_checkin));
  const itens = novos.map((h) => ({ data: h.data_checkin, turno: h.turno, janela: { inicio: h.hora_inicio, fim: h.hora_fim } }));
  await supabaseAdmin.from('mensagens').insert({ solicitacao_id: orc.solicitacao_id, oficina_id: orc.oficina_id, remetente_id: userId, texto: preencher(textosNovasDatas(idiomaOf).chatEnviadas, { datas: listaDeDatas(itens, idiomaOf) }) });
  await notificar(sol?.cliente_id, 'novas_datas_enviadas', idiomaCli, (l) => {
    const t = textosNovasDatas(l);
    return { titulo: t.enviadasTitulo, mensagem: preencher(t.enviadasMsg, { oficina: of?.nome_fantasia || '', datas: listaDeDatas(itens, l) }) };
  }, dadosCli);
  const cli = sol?.cliente;
  if (cli?.email) {
    const l = idiomaDoSite(idiomaCli); const t = textosNovasDatas(l); const numero = String(sol?.numero ?? '');
    const html = caixa(`<p>${escapeHtml(preencher(t.emailOla, { n: cli.nome || '' }))}</p>
      <p style="font-size:16px;"><strong>${escapeHtml(preencher(t.emailEnviadasTexto, { oficina: of?.nome_fantasia || '', numero }))}</strong></p>
      ${lista(itens.map((s) => diaETurno(s.data, s.turno, l, s.janela)))}
      ${botao(await linkPedido(numero, sol?.cliente_id, orc.solicitacao_id), t.emailEnviadasBotao)}`);
    await enviarEmail({ para: cli.email, assunto: preencher(t.emailEnviadasAssunto, { oficina: of?.nome_fantasia || '', numero }), html }).catch(() => false);
  }
  return res(200, { ok: true, modo: 'novas_datas', adicionados: novos.length });
}

// ---------- tarefas de hora em hora ----------
const H = 3600e3;
/** Lembrete de 24 h a oficina (uma vez) e limpeza dos pendentes que perderam o sentido. */
export async function tarefasPedidoDatas(agora = Date.now()) {
  let lembretes = 0, cancelados = 0;
  // pendentes: o orcamento/pedido deixou de aceitar (recusado pelo cliente, aceito, expirado, vencido) -> cancela;
  //    sem resposta ha 24 h -> lembrete unico
  const { data: pend } = await supabaseAdmin.from('orcamento_pedido_datas')
    .select('id, created_at, lembrete_em, orcamento_id, solicitacao_id, sugestoes, orcamento:orcamentos(' + SEL_ORC + ')')
    .eq('status', 'pendente').limit(500);
  for (const p of (pend || []) as any[]) {
    const orc = p.orcamento; const sol = orc?.solicitacao; const of = orc?.oficina;
    // ...ou o orcamento ganhou datas futuras por outro caminho (ex.: Modificar orcamento) - revisao Fable M1
    if (!orc || !ESTADOS_ORCAMENTO.includes(orc.status) || !ESTADOS_PEDIDO.includes(sol?.status) || orcamentoVencido(orc.validade, of?.pais, agora)
      || !semDatasFuturas(orc.disponibilidade || [], of?.pais, agora)) {
      const { data: c } = await supabaseAdmin.from('orcamento_pedido_datas').update({ status: 'cancelado' }).eq('id', p.id).eq('status', 'pendente').select('id');
      cancelados += c?.length || 0;
      continue;
    }
    if (p.lembrete_em || agora - Date.parse(p.created_at) < 24 * H) continue;
    const { data: marcou } = await supabaseAdmin.from('orcamento_pedido_datas').update({ lembrete_em: new Date(agora).toISOString() }).eq('id', p.id).is('lembrete_em', null).select('id');
    if (!marcou?.length) continue;
    const carro = carroDe(sol?.veiculo);
    await notificar(of?.profile_id, 'pedido_novas_datas', of?.profile?.idioma, (l) => { const t = textosNovasDatas(l); return { titulo: t.lembreteTitulo, mensagem: preencher(t.lembreteMsg, { carro }) }; },
      { solicitacao_id: orc.solicitacao_id, orcamento_id: orc.id, pedido_datas_id: p.id, lembrete: true });
    lembretes++;
  }
  return { lembretes, cancelados };
}
