import { supabaseAdmin } from './supabase-admin';
import { SMS_LINK_BASE, sendSmsTexto, smsModoPasta } from './notifications';
import { perfilDeContaTeste } from './conta-teste-envio';

// SMS do admin as oficinas avisadas de um pedido (dono 20/11: "avisei e ninguem abriu" era feito
// a mao pelo celular). Bloco "Oficinas avisadas" do detalhe do pedido no admin
// (components/admin/OficinasAvisadasSms.tsx, api/admin/solicitacoes/[id]/sms-oficinas).
// - lista: cada oficina avisada (sino 'nova_solicitacao' ou convite) com abriu? orcou? sem interesse?
//   telefone? e o ultimo SMS deste pedido para ela;
// - texto curto no idioma da oficina (et / ru / en), sem dado do cliente; link neutro /r/<numero>?o=<idioma>
//   (app/r/[numero]/route.ts leva a pagina de orcar; nada de caminho em portugues no SMS);
// - cada tentativa vai para sms_envios (tipo 'oficina_manual', migracao 111, profile_id = dono da oficina);
// - trava: no maximo 1 SMS por oficina e pedido a cada 12 h; conta de teste nunca recebe SMS de verdade.

export const TIPO_SMS_OFICINA = 'oficina_manual';
export const SMS_OFICINA_JANELA_H = 12;
const H = 3600 * 1000;
const ESTADOS_ABERTOS = ['aberta', 'em_orcamento'];
const AVISOS = ['nova_solicitacao', 'pedido_convite'];

const TXT: Record<'et' | 'ru' | 'en', string> = {
  et: 'BipFix: uus päring ootab teie hinnapakkumist: {link}',
  ru: 'BipFix: новая заявка ждёт вашей цены: {link}',
  en: 'BipFix: a new request is waiting for your quote: {link}',
};

export type IdiomaSms = keyof typeof TXT;
export const idiomaSmsOficina = (idioma: string | null | undefined): IdiomaSms => {
  const v = String(idioma || '').toLowerCase();
  return v.startsWith('et') ? 'et' : v.startsWith('ru') ? 'ru' : 'en';
};
export const linkSmsOficina = (numero: number | string, idioma: IdiomaSms) => `${SMS_LINK_BASE}/r/${numero}?o=${idioma}`;
export const textoSmsOficina = (numero: number | string, idioma: IdiomaSms) => TXT[idioma].replace('{link}', linkSmsOficina(numero, idioma));

export type BloqueioSms = 'pedido_fechado' | 'orcou' | 'dispensou' | 'sem_telefone' | 'inativa' | 'sms_recente';

export type OficinaAvisadaSms = {
  oficina_id: string; profile_id: string; nome: string; cidade: string | null; idioma: IdiomaSms;
  avisadaEm: string; vistoEm: string | null;
  orcamento: { status: string; em: string } | null;
  dispensa: { motivo: string; em: string } | null;
  telefone: boolean; telefoneFinal: string | null;
  ativa: boolean; contaTeste: boolean;
  ultimoSms: { status: string; motivo: string | null; em: string } | null;
  /** por que o botao "Enviar SMS" fica desligado (null = pode) */
  bloqueio: BloqueioSms | null;
  /** quando a trava das 12 h libera (so com bloqueio 'sms_recente') */
  liberaEm: string | null;
  /** entra no "SMS para quem nao abriu": nao abriu, sem orcamento, sem "sem interesse", com telefone, ativa, sem SMS recente, conta real */
  naoAbriu: boolean;
};

type Pedido = { id: string; numero: number | null; status: string; pais: string | null };

export async function oficinasAvisadasSms(solicitacaoId: string, agora = Date.now()): Promise<{ pedido: Pedido; oficinas: OficinaAvisadaSms[] } | null> {
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('id, numero, status, pais').eq('id', solicitacaoId).maybeSingle();
  if (!sol) return null;
  const pedido = sol as Pedido;
  const { data: avisos } = await supabaseAdmin.from('notificacoes').select('profile_id, created_at')
    .eq('dados->>solicitacao_id', pedido.id).in('tipo', AVISOS);
  const primeiroAviso = new Map<string, string>();
  for (const a of (avisos || []) as { profile_id: string; created_at: string }[]) {
    const ant = primeiroAviso.get(a.profile_id);
    if (!ant || a.created_at < ant) primeiroAviso.set(a.profile_id, a.created_at);
  }
  const perfis = Array.from(primeiroAviso.keys());
  if (!perfis.length) return { pedido, oficinas: [] };

  // o aviso vai ao dono (profile_id da oficina); aviso a outro perfil (equipe) nao vira linha
  const { data: ofs } = await supabaseAdmin.from('oficinas')
    .select('id, profile_id, nome_fantasia, cidade, ativa, profile:profiles!oficinas_profile_id_fkey(idioma, conta_teste, telefone, ativo)')
    .in('profile_id', perfis);
  const lista = (ofs || []) as any[];
  const ids = lista.map((o) => o.id as string);
  const [{ data: vistos }, { data: orcs }, { data: disps }, { data: smss }] = await Promise.all([
    ids.length ? supabaseAdmin.from('pedido_vistos').select('oficina_id, visto_em').eq('solicitacao_id', pedido.id).in('oficina_id', ids) : Promise.resolve({ data: [] }),
    supabaseAdmin.from('orcamentos').select('oficina_id, status, created_at').eq('solicitacao_id', pedido.id),
    supabaseAdmin.from('pedido_dispensas').select('oficina_id, motivo, created_at').eq('solicitacao_id', pedido.id),
    supabaseAdmin.from('sms_envios').select('profile_id, status, motivo, created_at').eq('solicitacao_id', pedido.id)
      .eq('tipo', TIPO_SMS_OFICINA).order('created_at', { ascending: false }).limit(500),
  ]);
  const visto = new Map(((vistos || []) as any[]).map((v) => [v.oficina_id as string, v.visto_em as string]));
  const orc = new Map<string, { status: string; em: string }>();
  for (const o of (orcs || []) as any[]) if (!orc.has(o.oficina_id)) orc.set(o.oficina_id, { status: o.status, em: o.created_at });
  const disp = new Map(((disps || []) as any[]).map((d) => [d.oficina_id as string, { motivo: d.motivo as string, em: d.created_at as string }]));
  const ultimo = new Map<string, { status: string; motivo: string | null; em: string }>();
  const ultimoEnvio = new Map<string, number>(); // ultimo 'enviado'/'enviando' (trava das 12 h)
  for (const s of (smss || []) as any[]) {
    if (!ultimo.has(s.profile_id)) ultimo.set(s.profile_id, { status: s.status, motivo: s.motivo, em: s.created_at });
    if ((s.status === 'enviado' || s.status === 'enviando') && !ultimoEnvio.has(s.profile_id)) ultimoEnvio.set(s.profile_id, new Date(s.created_at).getTime());
  }
  const aberto = ESTADOS_ABERTOS.includes(pedido.status);

  const oficinas: OficinaAvisadaSms[] = lista.map((o) => {
    const tel = String(o.profile?.telefone || '').replace(/\D/g, '');
    const ativa = !!o.ativa && o.profile?.ativo !== false;
    const envio = ultimoEnvio.get(o.profile_id);
    const recente = envio != null && agora - envio < SMS_OFICINA_JANELA_H * H;
    const bloqueio: BloqueioSms | null = !aberto ? 'pedido_fechado'
      : orc.has(o.id) ? 'orcou'
      : disp.has(o.id) ? 'dispensou'
      : !ativa ? 'inativa'
      : !tel ? 'sem_telefone'
      : recente ? 'sms_recente'
      : null;
    const contaTeste = !!o.profile?.conta_teste;
    return {
      oficina_id: o.id, profile_id: o.profile_id, nome: o.nome_fantasia || '', cidade: o.cidade ?? null,
      idioma: idiomaSmsOficina(o.profile?.idioma),
      avisadaEm: primeiroAviso.get(o.profile_id)!, vistoEm: visto.get(o.id) ?? null,
      orcamento: orc.get(o.id) ?? null, dispensa: disp.get(o.id) ?? null,
      telefone: !!tel, telefoneFinal: tel ? tel.slice(-3) : null,
      ativa, contaTeste,
      ultimoSms: ultimo.get(o.profile_id) ?? null,
      bloqueio, liberaEm: recente ? new Date(envio! + SMS_OFICINA_JANELA_H * H).toISOString() : null,
      naoAbriu: !bloqueio && !visto.has(o.id) && !contaTeste,
    };
  });
  oficinas.sort((a, b) => a.nome.localeCompare(b.nome));
  return { pedido, oficinas };
}

export type ResultadoSmsOficina = { oficina_id: string; nome: string; status: 'enviado' | 'recusado' | 'pulado'; motivo?: string };

const semNumero = (t: string) => t.replace(/\+?\d[\d\s]{5,}\d/g, '…').slice(0, 200);

/** Envia (ou pula, com o motivo) o SMS a cada oficina pedida. modo 'nao_abriu': so quem entra no botao em lote. */
export async function enviarSmsOficinas(p: { solicitacaoId: string; oficinaIds: string[]; modo: 'uma' | 'nao_abriu'; adminId: string }) {
  const base = await oficinasAvisadasSms(p.solicitacaoId);
  if (!base) return null;
  const { pedido } = base;
  const porId = new Map(base.oficinas.map((o) => [o.oficina_id, o]));
  const configurado = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) || smsModoPasta();
  const resultados: ResultadoSmsOficina[] = [];
  for (const id of Array.from(new Set(p.oficinaIds))) {
    const o = porId.get(id);
    if (!o) { resultados.push({ oficina_id: id, nome: '', status: 'pulado', motivo: 'nao_avisada' }); continue; }
    const r = (status: ResultadoSmsOficina['status'], motivo?: string) => resultados.push({ oficina_id: id, nome: o.nome, status, ...(motivo ? { motivo } : {}) });
    if (o.bloqueio) { r('pulado', o.bloqueio); continue; }
    if (p.modo === 'nao_abriu' && !o.naoAbriu) { r('pulado', o.vistoEm ? 'abriu' : o.contaTeste ? 'conta_teste' : 'fora_da_lista'); continue; }
    if (!configurado) { r('pulado', 'nao_configurado'); continue; }
    const linha = { solicitacao_id: pedido.id, profile_id: o.profile_id, tipo: TIPO_SMS_OFICINA, telefone_final: o.telefoneFinal, enviado_por: p.adminId };
    // conta de teste (ou equipe de oficina de teste) nunca recebe SMS de verdade (dono 18/11): fica registrado como pulado
    if (o.contaTeste || (await perfilDeContaTeste(o.profile_id))) {
      await supabaseAdmin.from('sms_envios').insert({ ...linha, status: 'pulado', motivo: 'conta_teste' });
      r('pulado', 'conta_teste'); continue;
    }
    let reservaId: string | null = null;
    try {
      // telefone so no servidor (o admin ve so o final); reserva 'enviando' antes da Twilio (conta na trava das 12 h)
      const { data: prof } = await supabaseAdmin.from('profiles').select('telefone').eq('id', o.profile_id).maybeSingle();
      const { data: of } = await supabaseAdmin.from('oficinas').select('pais').eq('id', o.oficina_id).maybeSingle();
      const { data: reserva, error: eRes } = await supabaseAdmin.from('sms_envios').insert({ ...linha, status: 'enviando' }).select('id').single();
      if (eRes) throw new Error(eRes.message);
      reservaId = reserva.id;
      const envio = await sendSmsTexto({ toPhone: String(prof?.telefone || ''), pais: (of as any)?.pais || pedido.pais || 'EE', texto: textoSmsOficina(pedido.numero ?? '', o.idioma) });
      const motivo = envio.success ? null : semNumero(envio.error || '');
      await supabaseAdmin.from('sms_envios').update({ status: envio.success ? 'enviado' : 'recusado', motivo, twilio_sid: envio.sid ?? null }).eq('id', reserva.id);
      r(envio.success ? 'enviado' : 'recusado', motivo || undefined);
    } catch (e) {
      console.error('[sms-oficinas] falha:', (e as Error).message);
      if (reservaId) await supabaseAdmin.from('sms_envios').update({ status: 'recusado', motivo: 'erro_interno' }).eq('id', reservaId).then(() => {}, () => {});
      r('recusado', 'erro_interno');
    }
  }
  return { numero: pedido.numero, resultados };
}
