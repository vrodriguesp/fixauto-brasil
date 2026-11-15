import { supabaseAdmin } from './supabase-admin';
import { tipoCompativel, distanciaKm } from '@fixauto/shared';
import { notifNovaSolicitacaoTitulo, notifPedidoConviteTitulo } from './notif-i18n';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { SITE_URL } from './site-url';
import { dentroDoLimite } from './rate-limit';
import pt from '../../messages/pt.json';
import ptPT from '../../messages/pt-PT.json';
import en from '../../messages/en.json';
import et from '../../messages/et.json';
import it from '../../messages/it.json';
import ru from '../../messages/ru.json';
import { emTodasAsLinguas } from '@/lib/notif-textos';

// Aviso de pedido novo as oficinas - no servidor (antes o navegador/app do
// cliente inseria um aviso por oficina ativa DO MUNDO INTEIRO, em serie;
// auditoria Fable 08/10, A5/E9). So oficinas ativas, cujo raio de
// atendimento alcanca o pedido e que fazem esse tipo de servico.
// Lote 2 da triagem (15/11): "quem recebe" (destinatariosDoPedido) separado de "enviar"
// (enviarAvisoNovoPedido / enviarConviteOficinas). O aviso automatico e o "Ver quem seria avisado"
// do admin usam a MESMA funcao de calculo: o que o admin ve e o que sai.
export const TIPOS: Record<string, Record<string, string>> = {
  pt: (pt as any).constants.tiposServico, 'pt-PT': (ptPT as any).constants.tiposServico, en: (en as any).constants.tiposServico,
  et: (et as any).constants.tiposServico, it: (it as any).constants.tiposServico, ru: (ru as any).constants.tiposServico,
};

/** Teto de oficinas por "Confirmar e avisar" no admin (decisao do dono 15/11): as mais proximas primeiro. */
export const TETO_AVISO_ADMIN = 50;

export type PedidoAviso = {
  id: string; numero: number | null; tipo: string; descricao: string | null; urgencia: string | null; endereco: string | null;
  latitude: number | null; longitude: number | null; pais: string | null; status: string; emergencia_id: string | null;
  veiculo: { fipe_marca?: string | null; fipe_modelo?: string | null; fipe_ano?: string | null } | null;
  cliente: { conta_teste?: boolean | null } | null;
};

export type OficinaAviso = {
  oficina_id: string; profile_id: string; nome: string; cidade: string | null; endereco: string | null; pais: string | null;
  especialidades: string[]; ativa: boolean; km: number | null; raio: number;
  idioma: string | null; conta_teste: boolean; email: string | null; nome_dono: string | null;
};

export type MotivoJaRecebeu = 'aviso' | 'orcamento' | 'dispensa' | 'convite';
export type JaRecebeu = { oficina_id: string; profile_id: string; nome: string; motivo: MotivoJaRecebeu; motivos: MotivoJaRecebeu[]; origem_convite: string | null };

const SELECT_PEDIDO = 'id, numero, tipo, descricao, urgencia, endereco, latitude, longitude, pais, status, emergencia_id, veiculo:veiculos(fipe_marca, fipe_modelo, fipe_ano), cliente:profiles!solicitacoes_cliente_id_fkey(conta_teste)';

export async function carregarPedido(solicitacaoId: string): Promise<PedidoAviso | null> {
  const { data } = await supabaseAdmin.from('solicitacoes').select(SELECT_PEDIDO).eq('id', solicitacaoId).maybeSingle();
  return (data as unknown as PedidoAviso) || null;
}

/** Todas as oficinas (ativas ou nao), com a distancia ate o pedido. */
export async function oficinasComDistancia(sol: Pick<PedidoAviso, 'latitude' | 'longitude'>): Promise<OficinaAviso[]> {
  const { data } = await supabaseAdmin.from('oficinas')
    .select('id, profile_id, nome_fantasia, cidade, endereco, pais, ativa, especialidades, latitude, longitude, raio_atendimento_km, profile:profiles!oficinas_profile_id_fkey(idioma, conta_teste, email, nome)');
  return (data || []).map((o: any) => ({
    oficina_id: o.id, profile_id: o.profile_id, nome: o.nome_fantasia || '', cidade: o.cidade ?? null, endereco: o.endereco ?? null, pais: o.pais ?? null,
    especialidades: o.especialidades || [], ativa: !!o.ativa, raio: o.raio_atendimento_km || 30,
    km: sol.latitude != null && sol.longitude != null && o.latitude != null && o.longitude != null
      ? distanciaKm(sol.latitude, sol.longitude, o.latitude, o.longitude) : null,
    idioma: o.profile?.idioma ?? null, conta_teste: !!o.profile?.conta_teste, email: o.profile?.email ?? null, nome_dono: o.profile?.nome ?? null,
  }));
}

// tipos de aviso que mostram ESTE pedido a oficina (automatico, convite, cobranca do admin)
const AVISOS_DO_PEDIDO = ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao'];
const PRIORIDADE: MotivoJaRecebeu[] = ['orcamento', 'dispensa', 'convite', 'aviso'];

/** Quem ja recebeu este pedido: aviso no sino (pelo dono, profile_id), orcamento, "sem interesse" ou convite. */
export async function quemJaRecebeu(solicitacaoId: string) {
  const [{ data: avisos }, { data: orcs }, { data: disps }, { data: convs }] = await Promise.all([
    supabaseAdmin.from('notificacoes').select('profile_id').eq('dados->>solicitacao_id', solicitacaoId).in('tipo', AVISOS_DO_PEDIDO),
    supabaseAdmin.from('orcamentos').select('oficina_id').eq('solicitacao_id', solicitacaoId),
    supabaseAdmin.from('pedido_dispensas').select('oficina_id').eq('solicitacao_id', solicitacaoId),
    supabaseAdmin.from('pedido_convites').select('oficina_id, origem').eq('solicitacao_id', solicitacaoId),
  ]);
  return {
    perfisAvisados: new Set((avisos || []).map((a: any) => a.profile_id as string)),
    orcaram: new Set((orcs || []).map((o: any) => o.oficina_id as string)),
    dispensaram: new Set((disps || []).map((d: any) => d.oficina_id as string)),
    convidadas: new Map((convs || []).map((c: any) => [c.oficina_id as string, c.origem as string])),
  };
}
export type JaRecebeuConjunto = Awaited<ReturnType<typeof quemJaRecebeu>>;

export function motivosDe(o: Pick<OficinaAviso, 'oficina_id' | 'profile_id'>, j: JaRecebeuConjunto): MotivoJaRecebeu[] {
  const m: MotivoJaRecebeu[] = [];
  if (j.orcaram.has(o.oficina_id)) m.push('orcamento');
  if (j.dispensaram.has(o.oficina_id)) m.push('dispensa');
  if (j.perfisAvisados.has(o.profile_id)) m.push('aviso');
  // acesso mantido ao mudar o tipo ('tipo_alterado') nao e convite: so conta quando nao ha outro motivo
  if (j.convidadas.get(o.oficina_id) === 'admin' || (j.convidadas.has(o.oficina_id) && !m.length)) m.push('convite');
  return m.sort((a, b) => PRIORIDADE.indexOf(a) - PRIORIDADE.indexOf(b));
}

/** A regra do aviso automatico (igual a minha_oficina_atende sem o convite, migracoes 056/064/067). */
export function oficinaBate(o: OficinaAviso, sol: Pick<PedidoAviso, 'tipo' | 'cliente'>, tipo = sol.tipo): boolean {
  const clienteTeste = !!sol.cliente?.conta_teste;
  // conta de teste (revisor das lojas) so avisa oficina de teste, e vice-versa (migracao 063)
  return o.ativa && o.conta_teste === clienteTeste && tipoCompativel(o.especialidades, tipo) && o.km != null && o.km <= o.raio;
}

/**
 * Quem recebe o aviso de pedido novo: oficinas ativas, mesma conta de teste ou real do cliente, que fazem o tipo e
 * cujo raio alcanca o pedido - MENOS quem ja recebeu este pedido (aviso, orcamento, "sem interesse", convite).
 * `alvo` vem da mais proxima para a mais distante. `opts.tipo` calcula para outro tipo (padrao: o do pedido).
 */
export async function destinatariosDoPedido(sol: PedidoAviso, opts: { tipo?: string } = {}): Promise<{ alvo: OficinaAviso[]; jaReceberam: JaRecebeu[] }> {
  if (sol.latitude == null || sol.longitude == null) return { alvo: [], jaReceberam: [] };
  const [oficinas, j] = await Promise.all([oficinasComDistancia(sol), quemJaRecebeu(sol.id)]);
  const alvo: OficinaAviso[] = [];
  const jaReceberam: JaRecebeu[] = [];
  for (const o of oficinas) {
    const motivos = motivosDe(o, j);
    if (motivos.length) jaReceberam.push({ oficina_id: o.oficina_id, profile_id: o.profile_id, nome: o.nome, motivo: motivos[0], motivos, origem_convite: j.convidadas.get(o.oficina_id) ?? null });
    else if (oficinaBate(o, sol, opts.tipo ?? sol.tipo)) alvo.push(o);
  }
  alvo.sort((a, b) => (a.km ?? 9e9) - (b.km ?? 9e9) || a.oficina_id.localeCompare(b.oficina_id));
  jaReceberam.sort((a, b) => a.nome.localeCompare(b.nome));
  return { alvo, jaReceberam };
}

export async function avisarOficinasDoPedido(solicitacaoId: string): Promise<number> {
  const { count } = await supabaseAdmin.from('notificacoes').select('id', { count: 'exact', head: true })
    .eq('tipo', 'nova_solicitacao').eq('dados->>solicitacao_id', solicitacaoId);
  if (count && count > 0) return -1; // ja avisado (idempotente; -1 = nao avisar o admin de novo)
  const sol = await carregarPedido(solicitacaoId);
  if (!sol || sol.latitude == null || sol.longitude == null) return 0;
  const { alvo } = await destinatariosDoPedido(sol);
  return (await enviarAvisoNovoPedido(sol, alvo)).inseridas;
}

const carroDe = (sol: PedidoAviso) => [sol.veiculo?.fipe_marca, sol.veiculo?.fipe_modelo].filter(Boolean).join(' ');
const idiomaDe = (o: OficinaAviso) => (o.idioma && TIPOS[o.idioma] ? o.idioma : 'en');
const mensagemDe = (sol: PedidoAviso, l: string, carro: string) => [(TIPOS[l] || TIPOS.en)[sol.tipo] || sol.tipo, carro, sol.endereco].filter(Boolean).join(' - ');

/**
 * Aviso de pedido novo (sino `nova_solicitacao` nas 6 linguas + e-mail + push pelo gatilho 066), identico ao do
 * fluxo automatico. Devolve quantos avisos foram gravados (`erro` quando o banco recusou).
 */
export async function enviarAvisoNovoPedido(sol: PedidoAviso, alvo: OficinaAviso[]): Promise<{ inseridas: number; erro: string | null }> {
  return enviarAvisos(sol, alvo, 'nova_solicitacao', notifNovaSolicitacaoTitulo, {}, TXT_EMAIL);
}

/** Convite da BipFix (sino `pedido_convite` + e-mail proprio + push pelo gatilho 066). */
export async function enviarConviteOficinas(sol: PedidoAviso, alvo: OficinaAviso[]): Promise<{ inseridas: number; erro: string | null }> {
  return enviarAvisos(sol, alvo, 'pedido_convite', notifPedidoConviteTitulo, { convite: true }, TXT_EMAIL_CONVITE);
}

async function enviarAvisos(sol: PedidoAviso, alvo: OficinaAviso[], tipo: string, titulo: (l: string) => string, extra: Record<string, unknown>, textos: typeof TXT_EMAIL) {
  const carro = carroDe(sol);
  const linhas = alvo.map((o) => {
    const idioma = idiomaDe(o);
    return {
      profile_id: o.profile_id, tipo, titulo: titulo(idioma),
      mensagem: mensagemDe(sol, idioma, carro),
      dados: {
        solicitacao_id: sol.id, ...extra,
        textos: emTodasAsLinguas((l) => ({ titulo: titulo(l), mensagem: mensagemDe(sol, l, carro) })),
      },
    };
  });
  let erro: string | null = null;
  if (linhas.length) {
    const { error } = await supabaseAdmin.from('notificacoes').insert(linhas);
    if (error) { erro = error.message; console.error('[avisar-oficinas] aviso', error.message); }
  }
  // e-mail tambem (dono 07/11: "a oficina recebe e-mail quando chega um pedido novo");
  // um erro de e-mail nao segura o aviso no painel. Em segundo plano (a resposta ao
  // cliente nao espera) e um de cada vez: o Resend aceita poucos envios por segundo
  // e, todos juntos, a maioria voltava 429 sem e-mail (auditoria 07/11). No maximo
  // EMAILS_POR_DIA por oficina, contra quem abre pedidos so para mandar e-mail.
  const comEmail = erro ? [] : alvo.filter((o) => o.email && dentroDoLimite(`email-pedido-oficina:${o.profile_id}`, EMAILS_POR_DIA, 24 * 3600 * 1000));
  void (async () => {
    for (const o of comEmail) {
      await emailPedido(o, sol, carro, textos).catch((e) => console.error('[avisar-oficinas] e-mail', e));
      await new Promise((ok) => setTimeout(ok, 600));
    }
  })();
  return { inseridas: linhas.length, erro };
}

const EMAILS_POR_DIA = 15;

type TextoEmail = { assunto: string; ola: string; texto: string; urg: Record<string, string>; botao: string; rodape: string };

const TXT_EMAIL: Record<string, TextoEmail> = {
  et: { assunto: 'Uus päring: {t}', ola: 'Tere, {n}!', texto: 'Sinu piirkonnas on uus hinnapäring, mis sobib sinu töökoja teenustega:', urg: { baixa: 'Kiiret ei ole', media: 'Mõne nädala jooksul', alta: 'Kiire' }, botao: 'Vaata päringut ja saada pakkumine', rodape: 'Saad selle kirja, sest sinu töökoda on BipFixis ja teeb seda teenust selles piirkonnas.' },
  ru: { assunto: 'Новая заявка: {t}', ola: 'Здравствуйте, {n}!', texto: 'В вашем районе новая заявка на расчёт цены, подходящая под услуги вашего автосервиса:', urg: { baixa: 'Не срочно', media: 'В течение нескольких недель', alta: 'Срочно' }, botao: 'Посмотреть заявку и отправить смету', rodape: 'Вы получили это письмо, потому что ваш автосервис есть в BipFix и выполняет эту услугу в этом районе.' },
  en: { assunto: 'New request: {t}', ola: 'Hello {n},', texto: 'There is a new quote request in your area that matches your shop’s services:', urg: { baixa: 'Not urgent', media: 'Within a few weeks', alta: 'Urgent' }, botao: 'See the request and send a quote', rodape: 'You receive this e-mail because your repair shop is on BipFix and does this service in this area.' },
  it: { assunto: 'Nuova richiesta: {t}', ola: 'Ciao {n},', texto: 'C’è una nuova richiesta di preventivo nella tua zona che corrisponde ai servizi della tua officina:', urg: { baixa: 'Non urgente', media: 'Entro poche settimane', alta: 'Urgente' }, botao: 'Vedi la richiesta e invia un preventivo', rodape: 'Ricevi questa e-mail perché la tua officina è su BipFix e offre questo servizio in questa zona.' },
  pt: { assunto: 'Novo pedido: {t}', ola: 'Olá, {n}!', texto: 'Chegou um novo pedido de orçamento na sua região que combina com os serviços da sua oficina:', urg: { baixa: 'Sem pressa', media: 'Nas próximas semanas', alta: 'Urgente' }, botao: 'Ver o pedido e enviar orçamento', rodape: 'Você recebe este e-mail porque sua oficina está na BipFix e faz este serviço nesta região.' },
  'pt-PT': { assunto: 'Novo pedido: {t}', ola: 'Olá, {n}!', texto: 'Chegou um novo pedido de orçamento na sua zona que corresponde aos serviços da sua oficina:', urg: { baixa: 'Sem pressa', media: 'Nas próximas semanas', alta: 'Urgente' }, botao: 'Ver o pedido e enviar orçamento', rodape: 'Recebe este e-mail porque a sua oficina está na BipFix e faz este serviço nesta zona.' },
};

// convite da BipFix (Lote 2): sem "combina com os servicos da sua oficina" - pode nao combinar
// (ET/RU a revisar com o tradutor, como as outras frases novas)
const TXT_EMAIL_CONVITE: Record<string, TextoEmail> = {
  et: { ...TXT_EMAIL.et, assunto: 'BipFix saatis sulle päringu: {t}', texto: 'BipFix saatis selle päringu otse sinu töökojale. Vaata see üle ja kui sobib, saada pakkumine.', rodape: 'Saad selle kirja, sest BipFix valis selle päringu jaoks sinu töökoja.' },
  ru: { ...TXT_EMAIL.ru, assunto: 'BipFix отправил вам заявку: {t}', texto: 'BipFix отправил эту заявку напрямую вашему автосервису. Посмотрите её и, если подходит, отправьте смету.', rodape: 'Вы получили это письмо, потому что BipFix выбрал ваш автосервис для этой заявки.' },
  en: { ...TXT_EMAIL.en, assunto: 'BipFix sent you a request: {t}', texto: 'BipFix sent this request directly to your repair shop. Take a look and, if it makes sense, send a quote.', rodape: 'You receive this e-mail because BipFix chose your repair shop for this request.' },
  it: { ...TXT_EMAIL.it, assunto: 'BipFix ti ha inviato una richiesta: {t}', texto: 'BipFix ha inviato questa richiesta direttamente alla tua officina. Dai un’occhiata e, se ha senso, invia un preventivo.', rodape: 'Ricevi questa e-mail perché BipFix ha scelto la tua officina per questa richiesta.' },
  pt: { ...TXT_EMAIL.pt, assunto: 'A BipFix enviou um pedido para você: {t}', texto: 'A BipFix enviou este pedido diretamente para a sua oficina. Veja e, se fizer sentido, mande um orçamento.', rodape: 'Você recebe este e-mail porque a BipFix escolheu a sua oficina para este pedido.' },
  'pt-PT': { ...TXT_EMAIL['pt-PT'], assunto: 'A BipFix enviou-lhe um pedido: {t}', texto: 'A BipFix enviou este pedido diretamente para a sua oficina. Veja e, se fizer sentido, envie um orçamento.', rodape: 'Recebe este e-mail porque a BipFix escolheu a sua oficina para este pedido.' },
};

async function emailPedido(o: OficinaAviso, sol: PedidoAviso, carro: string, textos: Record<string, TextoEmail>) {
  const para = o.email;
  if (!para) return;
  const idioma = o.idioma && textos[o.idioma] ? o.idioma : 'en';
  const x = textos[idioma];
  const tipo = TIPOS[idioma]?.[sol.tipo] || sol.tipo;
  const ano = sol.veiculo?.fipe_ano;
  // texto do cliente sem links (o e-mail sai de noreply@bipfix.com: nada de link de terceiros)
  const desc = String(sol.descricao || '').slice(0, 300).replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[…]');
  // link curto neutro (sem nome de pagina em portugues): /r/<numero>?o=<idioma>
  const link = `${SITE_URL.replace('://www.', '://')}/r/${sol.numero}?o=${encodeURIComponent(idioma)}`;
  await enviarEmail({ para, assunto: x.assunto.replace('{t}', [tipo, carro].filter(Boolean).join(' – ')), html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>${x.ola.replace('{n}', escapeHtml(o.nome_dono || o.nome || ''))}</p>
        <p>${x.texto}</p>
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(tipo)}</p>
          ${carro ? `<p style="margin:0 0 6px;">${escapeHtml(carro)}${ano && ano !== '-' ? ' ' + escapeHtml(String(ano)) : ''}</p>` : ''}
          ${desc ? `<p style="margin:0 0 6px;color:#374151;">${escapeHtml(desc)}</p>` : ''}
          <p style="margin:0;color:#6b7280;font-size:14px;">${escapeHtml(sol.endereco || '')} · ${x.urg[sol.urgencia || ''] || ''}</p>
        </div>
        <p style="margin-top:24px;"><a href="${link}" style="display:inline-block;background:#1e40af;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">${x.botao}</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${x.rodape}</p>
      </div>
    </div>` });
}
