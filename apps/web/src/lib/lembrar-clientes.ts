import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { linkPedido } from './link-acesso';
import { tokenAleatorio } from './segredos';
import { SITE_URL } from './site-url';
import { perfilDeContaTeste } from './conta-teste-envio';
import { SMS_LINK_BASE, sendSmsTexto, smsModoPasta } from './notifications';
import { SMS_APP_DIAS } from './sms-regras';
import { currencyForCountry } from './currency';
import { formatCurrency } from './utils';
import { resolveEmailLocale } from './email-i18n';
import {
  decidirPedido, decidirCheckin, decidirSmsLembrete, dentroDaJanela, tiposResolvidos, PENDENTES, ABERTOS, MAX_TENTATIVAS,
  type OrcLembrete, type RegistroLembrete, type TipoLembrete,
} from './lembretes-cliente-regras';
import { montarEmailLembrete, textoSmsLembrete, type OrcEmail } from './lembretes-cliente-email';

// Lembretes ao MOTORISTA (migracao 115; regras em lib/lembretes-cliente-regras.ts). Chamado de hora em hora
// pela tarefa limpar-pendentes. Tudo por pedido: no maximo 1 e-mail por tipo, juntando os orcamentos
// pendentes; 1 SMS de lembrete por pedido no total. A trava e o registro sao a tabela lembretes_cliente
// (indice unico pedido+tipo+canal): a linha e reservada ANTES do envio, entao duas passadas ao mesmo tempo
// nunca mandam duas vezes. Conta de teste nunca recebe (fica 'pulado'). Pausa: link "parar lembretes"
// (bipfix.com/r/<n>?s=<token>, app/r/[numero]/route.ts + /api/lembretes) grava solicitacoes.lembretes_pausados_em.

const H = 3600 * 1000;
/** linha 'enviando' mais velha que isto = a passada caiu a meio (entre reservar e fechar): pode ser retomada */
export const ENVIANDO_PRESO_MIN = 30;
/** Resend: no maximo isto de lembretes por passada (o resto fica para a hora seguinte) */
export const MAX_EMAILS_POR_PASSADA = 30;
const site = () => SITE_URL.replace('://www.', '://');
export const hashTokenLembrete = (token: string) => createHash('sha256').update(`lembrete:${token}`).digest('hex');
export const TOKEN_LEMBRETE = /^[A-Za-z0-9_-]{43}$/;
/** link "parar lembretes" (sem login; o idioma vai junto para a pagina abrir na lingua do e-mail) */
export const linkPausa = (numero: string | number, token: string, idioma: string) => `${site()}/r/${numero}?s=${token}&l=${encodeURIComponent(idioma)}`;

export type ResumoLembretes = {
  desligado?: boolean; pedidos: number; enviados: Partial<Record<TipoLembrete, number>>; sms: number;
  pulados: number; foraJanela: number; falhas: number; limite: boolean;
};

type Reserva = { id: string; token: string };

/** Reserva a linha (pedido, tipo, canal). null = ja existe (enviado/pulado/em curso) - nunca manda de novo. */
async function reservar(p: { solicitacaoId: string; profileId: string | null; tipo: TipoLembrete; canal: 'email' | 'sms'; orcamentos: string[]; agora: number }): Promise<Reserva | null> {
  const token = tokenAleatorio();
  const linha = {
    solicitacao_id: p.solicitacaoId, profile_id: p.profileId, tipo: p.tipo, canal: p.canal, status: 'enviando',
    // a vespera do check-in nao leva link de pausa (a pausa nao a cala): sem token
    orcamento_ids: p.orcamentos, token_hash: p.canal === 'email' && p.tipo !== 'checkin' ? hashTokenLembrete(token) : null, created_at: new Date(p.agora).toISOString(),
  };
  const { data, error } = await supabaseAdmin.from('lembretes_cliente').insert(linha).select('id').single();
  if (!error && data) return { id: data.id, token };
  if (error?.code !== '23505') { console.error('[lembrar-clientes] reservar', error?.message); return null; }
  // e-mail que falhou antes, ou reserva presa em 'enviando' ha mais de 30 min (processo caiu a meio):
  // nova tentativa (ate MAX_TENTATIVAS), tomando a linha num passo so (compare-and-set em status+tentativas+created_at)
  if (p.canal !== 'email') return null;
  const { data: ant } = await supabaseAdmin.from('lembretes_cliente').select('id, status, tentativas, created_at')
    .eq('solicitacao_id', p.solicitacaoId).eq('tipo', p.tipo).eq('canal', p.canal).maybeSingle();
  if (!ant || ant.tentativas >= MAX_TENTATIVAS) return null;
  const presa = ant.status === 'enviando' && p.agora - Date.parse(ant.created_at) > ENVIANDO_PRESO_MIN * 60 * 1000;
  if (ant.status !== 'falhou' && !presa) return null;
  const { data: tomou } = await supabaseAdmin.from('lembretes_cliente')
    .update({ status: 'enviando', tentativas: ant.tentativas + 1, token_hash: p.canal === 'email' && p.tipo !== 'checkin' ? hashTokenLembrete(token) : null, orcamento_ids: p.orcamentos, created_at: new Date(p.agora).toISOString() })
    .eq('id', ant.id).eq('status', ant.status).eq('tentativas', ant.tentativas).eq('created_at', ant.created_at).select('id');
  return tomou?.length ? { id: ant.id, token } : null;
}

async function pular(solicitacaoId: string, profileId: string | null, tipo: TipoLembrete, canal: 'email' | 'sms', motivo: string, agora: number) {
  await supabaseAdmin.from('lembretes_cliente').insert({
    solicitacao_id: solicitacaoId, profile_id: profileId, tipo, canal, status: 'pulado', motivo, created_at: new Date(agora).toISOString(),
  }).then(() => {}, () => {}); // ja existe: nada (o indice unico manda)
}

const fechar = (id: string, ok: boolean, agora: number, motivo?: string) =>
  supabaseAdmin.from('lembretes_cliente').update({ status: ok ? 'enviado' : 'falhou', enviado_em: ok ? new Date(agora).toISOString() : null, motivo: motivo ?? null }).eq('id', id).then(() => {}, () => {});

const SEL_PEDIDO = 'id, numero, status, pais, cliente_id, sms_avisos, lembretes_pausados_em, '
  + 'cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma, telefone, ativo), '
  + 'orcamentos(id, status, validade, created_at, valor_total, oficina:oficinas(nome_fantasia, pais), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(data_checkin, turno, hora_inicio, hora_fim))';

type Contexto = { agora: number; desde: number; smsAtivo: boolean; resumo: ResumoLembretes; emails: number };

/** a passada de hora em hora */
export async function lembrarClientes(agora = Date.now()): Promise<ResumoLembretes> {
  const resumo: ResumoLembretes = { pedidos: 0, enviados: {}, sms: 0, pulados: 0, foraJanela: 0, falhas: 0, limite: false };
  const { data: cfg, error: eCfg } = await supabaseAdmin.from('plataforma_config').select('lembretes_cliente_ativo, lembretes_cliente_desde, sms_ativo').eq('id', 1).maybeSingle();
  // sem a migracao 115 (ou sem a data de inicio) nada sai
  if (eCfg || !cfg || cfg.lembretes_cliente_ativo === false || !cfg.lembretes_cliente_desde) return { ...resumo, desligado: true };
  const ctx: Contexto = { agora, desde: Date.parse(cfg.lembretes_cliente_desde), smsAtivo: cfg.sms_ativo ?? true, resumo, emails: 0 };
  const desdeIso = new Date(ctx.desde).toISOString();

  // pedidos com orcamento pendente criado depois do inicio dos lembretes
  const { data: orcs, error: eOrcs } = await supabaseAdmin.from('orcamentos').select('solicitacao_id').in('status', PENDENTES).gte('created_at', desdeIso)
    .order('created_at', { ascending: true }).limit(1000);
  if (eOrcs) { resumo.falhas++; console.error('[lembrar-clientes] orcamentos', eOrcs.message); }
  const ids = Array.from(new Set(((orcs || []) as { solicitacao_id: string }[]).map((o) => o.solicitacao_id)));
  for (const id of ids) {
    if (ctx.emails >= MAX_EMAILS_POR_PASSADA) { resumo.limite = true; break; }
    await processarPedido(id, ctx).catch((e) => { resumo.falhas++; console.error('[lembrar-clientes] pedido', (e as Error).message); });
  }

  // vespera do check-in: agendamentos marcados depois do inicio, com o check-in nas proximas 48 h
  const { data: ags, error: eAgs } = await supabaseAdmin.from('agenda').select('id, solicitacao_id, status, data_inicio, checkin_ate, created_at, oficina:oficinas(nome_fantasia, pais, endereco, cidade)')
    .eq('status', 'agendado').not('solicitacao_id', 'is', null).gte('created_at', desdeIso)
    .gt('data_inicio', new Date(agora).toISOString()).lt('data_inicio', new Date(agora + 48 * H).toISOString()).limit(500);
  if (eAgs) { resumo.falhas++; console.error('[lembrar-clientes] agenda', eAgs.message); }
  for (const ag of (ags || []) as any[]) {
    if (ctx.emails >= MAX_EMAILS_POR_PASSADA) { resumo.limite = true; break; }
    await processarCheckin(ag, ctx).catch((e) => { resumo.falhas++; console.error('[lembrar-clientes] checkin', (e as Error).message); });
  }
  return resumo;
}

async function registrosDo(solicitacaoId: string): Promise<RegistroLembrete[]> {
  const { data } = await supabaseAdmin.from('lembretes_cliente').select('tipo, canal, status, enviado_em, tentativas').eq('solicitacao_id', solicitacaoId);
  return (data || []) as RegistroLembrete[];
}

/** a conta pode receber? (conta de teste, conta desativada, sem e-mail -> motivo) */
async function bloqueioDoCliente(clienteId: string, cli: { email?: string | null; ativo?: boolean | null } | null): Promise<string | null> {
  if (await perfilDeContaTeste(clienteId)) return 'conta_teste';
  if (!cli || cli.ativo === false) return 'inativo';
  if (!cli.email) return 'sem_email';
  return null;
}

async function processarPedido(id: string, ctx: Contexto) {
  const { agora, resumo } = ctx;
  const { data: sol, error } = await supabaseAdmin.from('solicitacoes').select(SEL_PEDIDO).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message); // consulta quebrada nao pode passar calada (conta em resumo.falhas)
  if (!sol) return;
  const s = sol as any;
  if (!ABERTOS.includes(s.status)) return;
  resumo.pedidos++;
  const orcsBrutos = (s.orcamentos || []) as any[];
  const orcamentos: (OrcLembrete & { bruto: any })[] = orcsBrutos.map((o) => ({
    id: o.id, status: o.status, validade: o.validade, created_at: o.created_at, pais: o.oficina?.pais ?? null,
    slots: (o.disponibilidade || []) as OrcLembrete['slots'], bruto: o,
  }));
  if (!orcamentos.length) return;
  const primeiro = new Date(Math.min(...orcamentos.map((o) => Date.parse(o.created_at)))).toISOString();
  // janela 09-20 no fuso do pedido; fora dela nada e gravado (a passada seguinte dentro da janela decide de novo)
  const paisPedido = s.pais || orcamentos[0].pais || null;
  if (!dentroDaJanela(agora, paisPedido)) { resumo.foraJanela++; return; }

  // o motorista agiu: pediu outra data (qualquer estado) ou escreveu a oficina depois do 1.o orcamento
  const [{ count: datas }, { count: msgs }, registros] = await Promise.all([
    supabaseAdmin.from('orcamento_pedido_datas').select('id', { count: 'exact', head: true }).eq('solicitacao_id', id),
    supabaseAdmin.from('mensagens').select('id', { count: 'exact', head: true }).eq('solicitacao_id', id).eq('remetente_id', s.cliente_id).gte('created_at', primeiro),
    registrosDo(id),
  ]);
  const d = decidirPedido({
    agora, desde: ctx.desde, status: s.status, pausado: !!s.lembretes_pausados_em, agiu: (datas ?? 0) > 0 || (msgs ?? 0) > 0,
    orcamentos, registros,
  });
  for (const x of d.pular) { await pular(id, s.cliente_id, x.tipo, 'email', x.motivo, agora); resumo.pulados++; }
  if (!d.tipo) return;
  const tipo = d.tipo;

  const cli = s.cliente as { nome?: string | null; email?: string | null; idioma?: string | null; telefone?: string | null; ativo?: boolean | null } | null;
  const bloqueio = await bloqueioDoCliente(s.cliente_id, cli);
  if (bloqueio) { await pular(id, s.cliente_id, tipo, 'email', bloqueio, agora); resumo.pulados++; return; }

  const res = await reservar({ solicitacaoId: id, profileId: s.cliente_id, tipo, canal: 'email', orcamentos: d.orcamentos, agora });
  if (!res) return;
  const idioma = resolveEmailLocale(cli!.idioma);
  const lista: OrcEmail[] = orcamentos.filter((o) => d.orcamentos.includes(o.id)).map((o) => ({
    id: o.id, oficina: o.bruto.oficina?.nome_fantasia || '', valor: formatCurrency(Number(o.bruto.valor_total) || 0, currencyForCountry(o.pais), idioma),
    validade: o.validade, pais: o.pais, slots: o.slots, status: o.status, created_at: o.created_at,
  }));
  const { assunto, html } = montarEmailLembrete({
    tipo, idioma, nome: cli!.nome || null, numero: s.numero, orcamentos: lista, agora,
    link: await linkPedido(s.numero, s.cliente_id, id, `l=${idioma}`), linkPausa: linkPausa(s.numero, res.token, idioma),
  });
  const ok = await enviarEmail({ para: cli!.email as string, assunto, html, cabecalhos: cabecalhosPausa(s.numero, res.token, idioma) }).catch(() => false);
  await fechar(res.id, ok, agora, ok ? undefined : 'email_recusado');
  ctx.emails++;
  if (!ok) { resumo.falhas++; return; }
  resumo.enviados[tipo] = (resumo.enviados[tipo] || 0) + 1;
  if (tipo === 'vencem') await talvezSms(s, cli, primeiro, d.orcamentos, ctx, registros);
  await new Promise((r) => setTimeout(r, 600)); // Resend: poucos envios por segundo
}

/** List-Unsubscribe (RFC 2369) + one-click (RFC 8058): o leitor de e-mail faz POST no proprio link de pausa */
function cabecalhosPausa(numero: string | number, token: string, idioma: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${linkPausa(numero, token, idioma)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** O unico SMS de lembrete do pedido, junto com o "vencem". Mesmo caminho dos SMS de hoje (sendSmsTexto + sms_envios). */
async function talvezSms(s: any, cli: { telefone?: string | null; idioma?: string | null } | null, primeiro: string, orcamentos: string[], ctx: Contexto, registros: RegistroLembrete[]) {
  const { agora, resumo } = ctx;
  if (!process.env.TWILIO_ACCOUNT_SID && !smsModoPasta()) return; // SMS nao configurado: nem tenta nem registra
  const desde = new Date(agora - SMS_APP_DIAS * 86400000).toISOString();
  const [{ count: app }, { count: abriu }] = await Promise.all([
    supabaseAdmin.from('push_tokens').select('id', { count: 'exact', head: true }).eq('profile_id', s.cliente_id).gte('last_seen_at', desde),
    // abriu o pedido pelo botao de algum e-mail depois do 1.o orcamento (links_acesso gasto)
    supabaseAdmin.from('links_acesso').select('id', { count: 'exact', head: true }).eq('solicitacao_id', s.id).eq('user_id', s.cliente_id).gte('usado_em', primeiro),
  ]);
  const dec = decidirSmsLembrete({
    smsPedido: s.sms_avisos, telefone: cli?.telefone ?? null, smsAtivo: ctx.smsAtivo, temApp: (app ?? 0) > 0, abriu: (abriu ?? 0) > 0,
    jaTemSms: tiposResolvidos(registros, 'sms').size > 0,
  });
  if (!dec.enviar) { if (dec.motivo !== 'ja_enviado') await pular(s.id, s.cliente_id, 'vencem', 'sms', dec.motivo, agora); return; }
  const res = await reservar({ solicitacaoId: s.id, profileId: s.cliente_id, tipo: 'vencem', canal: 'sms', orcamentos, agora });
  if (!res) return;
  const base = { solicitacao_id: s.id, orcamento_id: null, profile_id: s.cliente_id, tipo: 'lembrete_cliente', telefone_final: String(cli!.telefone).replace(/\D/g, '').slice(-3) };
  const { data: env } = await supabaseAdmin.from('sms_envios').insert({ ...base, status: 'enviando' }).select('id').single();
  const r = await sendSmsTexto({ toPhone: cli!.telefone as string, pais: s.pais || 'EE', texto: textoSmsLembrete(cli?.idioma, s.numero, `${SMS_LINK_BASE}/r/${s.numero}`) })
    .catch((e) => ({ success: false, error: (e as Error).message, sid: undefined as string | undefined }));
  // erro da Twilio pode trazer o numero inteiro: nao guarda
  const motivo = r.success ? null : String(r.error || '').replace(/\+?\d[\d\s]{5,}\d/g, '…').slice(0, 200);
  if (env?.id) await supabaseAdmin.from('sms_envios').update({ status: r.success ? 'enviado' : 'recusado', motivo, twilio_sid: (r as any).sid ?? null }).eq('id', env.id);
  // SMS que falhou nao tenta de novo (no maximo 1 por pedido, mesmo falhado)
  await supabaseAdmin.from('lembretes_cliente').update({ status: r.success ? 'enviado' : 'falhou', tentativas: MAX_TENTATIVAS, enviado_em: r.success ? new Date(agora).toISOString() : null, motivo }).eq('id', res.id);
  if (r.success) resumo.sms++; else resumo.falhas++;
}

async function processarCheckin(ag: any, ctx: Contexto) {
  const { agora, resumo } = ctx;
  const of = ag.oficina || {};
  const pais = of.pais ?? null;
  if (!dentroDaJanela(agora, pais)) { resumo.foraJanela++; return; }
  const { data: sol, error: eSol } = await supabaseAdmin.from('solicitacoes')
    .select('id, numero, status, cliente_id, lembretes_pausados_em, cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma, ativo)')
    .eq('id', ag.solicitacao_id).maybeSingle();
  if (eSol) throw new Error(eSol.message);
  if (!sol) return;
  const s = sol as any;
  const registros = await registrosDo(s.id);
  const dec = decidirCheckin({
    agora, desde: ctx.desde, status: ag.status, dataInicio: ag.data_inicio, criadoEm: ag.created_at, pais,
    statusPedido: s.status, registros,
  });
  if (!dec.enviar) return;
  resumo.pedidos++;
  const cli = s.cliente as { nome?: string | null; email?: string | null; idioma?: string | null; ativo?: boolean | null } | null;
  const bloqueio = await bloqueioDoCliente(s.cliente_id, cli);
  if (bloqueio) { await pular(s.id, s.cliente_id, 'checkin', 'email', bloqueio, agora); resumo.pulados++; return; }
  const res = await reservar({ solicitacaoId: s.id, profileId: s.cliente_id, tipo: 'checkin', canal: 'email', orcamentos: [], agora });
  if (!res) return;
  const idioma = resolveEmailLocale(cli!.idioma);
  const endereco = [of.endereco, of.cidade].filter(Boolean).join(', ') || null;
  const { assunto, html } = montarEmailLembrete({
    tipo: 'checkin', idioma, nome: cli!.nome || null, numero: s.numero, orcamentos: [], agora,
    checkin: { oficina: of.nome_fantasia || '', inicio: ag.data_inicio, fim: ag.checkin_ate, pais, endereco },
    // aviso da marcacao: sem link de pausa nem List-Unsubscribe (a pausa nao o cala; dono 23/11)
    link: await linkPedido(s.numero, s.cliente_id, s.id, `l=${idioma}`), linkPausa: null,
  });
  const ok = await enviarEmail({ para: cli!.email as string, assunto, html }).catch(() => false);
  await fechar(res.id, ok, agora, ok ? undefined : 'email_recusado');
  ctx.emails++;
  if (!ok) { resumo.falhas++; return; }
  resumo.enviados.checkin = (resumo.enviados.checkin || 0) + 1;
  await new Promise((r) => setTimeout(r, 600));
}

/**
 * Link "parar lembretes" (sem login): o token aponta para a linha do e-mail em lembretes_cliente.
 * 'ver' nao grava nada; 'pausar' / 'retomar' mudam solicitacoes.lembretes_pausados_em.
 */
export async function pausaPorToken(token: string, acao: 'ver' | 'pausar' | 'retomar', numero?: string | null): Promise<{ ok: true; numero: number | null; pausado: boolean } | { ok: false }> {
  if (!TOKEN_LEMBRETE.test(token)) return { ok: false };
  const { data: l } = await supabaseAdmin.from('lembretes_cliente').select('solicitacao_id').eq('token_hash', hashTokenLembrete(token)).maybeSingle();
  if (!l) return { ok: false };
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, numero, lembretes_pausados_em').eq('id', l.solicitacao_id).maybeSingle();
  if (!sol) return { ok: false };
  // o numero da URL tem de ser o do pedido do token (link trocado/montado a mao nao age)
  if (numero && String(sol.numero) !== String(numero).replace(/\D/g, '')) return { ok: false };
  if (acao === 'pausar' && !sol.lembretes_pausados_em) {
    await supabaseAdmin.from('solicitacoes').update({ lembretes_pausados_em: new Date().toISOString() }).eq('id', sol.id).is('lembretes_pausados_em', null);
    return { ok: true, numero: sol.numero, pausado: true };
  }
  if (acao === 'retomar' && sol.lembretes_pausados_em) {
    await supabaseAdmin.from('solicitacoes').update({ lembretes_pausados_em: null }).eq('id', sol.id);
    return { ok: true, numero: sol.numero, pausado: false };
  }
  return { ok: true, numero: sol.numero, pausado: !!sol.lembretes_pausados_em };
}
