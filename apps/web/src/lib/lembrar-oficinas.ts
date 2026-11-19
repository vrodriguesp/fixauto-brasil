import { supabaseAdmin } from './supabase-admin';
import { carregarPedido, oficinasComDistancia, oficinaBate, TIPOS, SEM_INTERESSE, EMAILS_POR_DIA, type OficinaAviso, type PedidoAviso } from './avisar-oficinas-pedido';
import { linkPedidoOficina } from './link-acesso';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { dentroDoLimite } from './rate-limit';
import { notifClienteEsperandoOrcamento } from './notif-i18n';
import { emTodasAsLinguas } from './notif-textos';
import { registrarAuditoria } from './admin-auditoria';

// Lembrete as oficinas que receberam um pedido e ainda nao responderam (dono 16/11:
// "envia um lembrete com o link que acessa direto e um botao de nao tenho interesse").
// Substitui a rota "cobrar" (caixa propria de 40 km, ignorava "nao tenho interesse"
// e conta de teste, cobrava quem nunca recebeu, sem e-mail). Regra por par (oficina,
// pedido) + no maximo 1 e-mail de lembrete por oficina a cada 24 h; um e-mail por
// oficina lista todos os pedidos dela (cada um com "Abrir" e "Nao tenho interesse").

export const ESTADOS_LEMBRETE = ['aberta', 'em_orcamento'];
const H = 3600 * 1000;
const AVISO_MIN_H = 12; // nao lembrar logo depois do aviso
const PAR_MIN_H = 48; // entre dois lembretes do mesmo pedido a mesma oficina
const OFICINA_MIN_H = 24; // um e-mail de lembrete por oficina por dia
const AVISOS = ['nova_solicitacao', 'pedido_convite', 'cobranca_admin_solicitacao'];

export type MotivoFora = 'orcou' | 'dispensou' | 'inativa' | 'dono_inativo' | 'sem_email' | 'conta_teste' | 'nao_atende' | 'aviso_recente' | 'lembrada_recente';
export type Candidatos = { recebem: (OficinaAviso & { ultimoAviso: string | null })[]; ficamFora: { oficina_id: string; nome: string; motivo: MotivoFora }[] };

/** Quem recebe (e quem fica de fora, com o motivo) o lembrete deste pedido. So oficinas que JA receberam o pedido. */
export async function candidatosLembrete(sol: PedidoAviso, agora = Date.now()): Promise<Candidatos> {
  const [oficinas, { data: avisos }, { data: convites }, { data: orcs }, { data: disps }] = await Promise.all([
    oficinasComDistancia(sol),
    supabaseAdmin.from('notificacoes').select('profile_id, tipo, created_at').eq('dados->>solicitacao_id', sol.id).in('tipo', AVISOS),
    supabaseAdmin.from('pedido_convites').select('oficina_id').eq('solicitacao_id', sol.id),
    supabaseAdmin.from('orcamentos').select('oficina_id').eq('solicitacao_id', sol.id),
    supabaseAdmin.from('pedido_dispensas').select('oficina_id').eq('solicitacao_id', sol.id),
  ]);
  const convidadas = new Set((convites || []).map((c: any) => c.oficina_id as string));
  const orcaram = new Set((orcs || []).map((o: any) => o.oficina_id as string));
  const dispensaram = new Set((disps || []).map((d: any) => d.oficina_id as string));
  const ultimoAviso = new Map<string, number>(); // por dono: ultimo aviso de qualquer tipo deste pedido
  const ultimoLembretePar = new Map<string, number>();
  for (const a of (avisos || []) as { profile_id: string; tipo: string; created_at: string }[]) {
    const t = new Date(a.created_at).getTime();
    ultimoAviso.set(a.profile_id, Math.max(ultimoAviso.get(a.profile_id) ?? 0, t));
    if (a.tipo === 'cobranca_admin_solicitacao') ultimoLembretePar.set(a.profile_id, Math.max(ultimoLembretePar.get(a.profile_id) ?? 0, t));
  }
  const receberam = oficinas.filter((o) => ultimoAviso.has(o.profile_id) || convidadas.has(o.oficina_id));
  const donos = receberam.map((o) => o.profile_id);
  const [{ data: perfis }, { data: lembretesHoje }] = donos.length ? await Promise.all([
    supabaseAdmin.from('profiles').select('id, ativo').in('id', donos),
    supabaseAdmin.from('notificacoes').select('profile_id').in('profile_id', donos).eq('tipo', 'cobranca_admin_solicitacao')
      .gte('created_at', new Date(agora - OFICINA_MIN_H * H).toISOString()),
  ]) : [{ data: [] }, { data: [] }] as any;
  const donoInativo = new Set(((perfis || []) as { id: string; ativo: boolean | null }[]).filter((p) => p.ativo === false).map((p) => p.id));
  const lembradaHoje = new Set(((lembretesHoje || []) as { profile_id: string }[]).map((l) => l.profile_id));
  const clienteTeste = !!sol.cliente?.conta_teste;

  const recebem: Candidatos['recebem'] = [];
  const ficamFora: Candidatos['ficamFora'] = [];
  for (const o of receberam) {
    const fora = (motivo: MotivoFora) => ficamFora.push({ oficina_id: o.oficina_id, nome: o.nome, motivo });
    const ultimo = ultimoAviso.get(o.profile_id) ?? null;
    if (orcaram.has(o.oficina_id)) { fora('orcou'); continue; }
    if (dispensaram.has(o.oficina_id)) { fora('dispensou'); continue; }
    if (!o.ativa) { fora('inativa'); continue; }
    if (donoInativo.has(o.profile_id)) { fora('dono_inativo'); continue; }
    if (o.conta_teste !== clienteTeste) { fora('conta_teste'); continue; }
    if (!o.email) { fora('sem_email'); continue; }
    if (!convidadas.has(o.oficina_id) && !oficinaBate(o, sol)) { fora('nao_atende'); continue; }
    const par = ultimoLembretePar.get(o.profile_id);
    if (par && agora - par < PAR_MIN_H * H) { fora('lembrada_recente'); continue; }
    if (lembradaHoje.has(o.profile_id)) { fora('lembrada_recente'); continue; }
    if (ultimo && agora - ultimo < AVISO_MIN_H * H) { fora('aviso_recente'); continue; }
    recebem.push({ ...o, ultimoAviso: ultimo ? new Date(ultimo).toISOString() : null });
  }
  recebem.sort((a, b) => a.nome.localeCompare(b.nome));
  ficamFora.sort((a, b) => a.nome.localeCompare(b.nome));
  return { recebem, ficamFora };
}

/** Todos os pedidos abertos com localizacao: candidatos agrupados por oficina ("Lembretes de hoje"). */
export async function candidatosGlobais(agora = Date.now()) {
  const { data: sols } = await supabaseAdmin.from('solicitacoes').select('id').in('status', ESTADOS_LEMBRETE)
    .not('latitude', 'is', null).not('longitude', 'is', null).order('created_at', { ascending: true }).limit(200);
  const porOficina = new Map<string, { oficina: OficinaAviso; pedidos: PedidoAviso[] }>();
  const ficamFora: { oficina_id: string; nome: string; numero: number | null; motivo: MotivoFora }[] = [];
  for (const { id } of (sols || []) as { id: string }[]) {
    const sol = await carregarPedido(id);
    if (!sol) continue;
    const c = await candidatosLembrete(sol, agora);
    for (const o of c.recebem) {
      const g = porOficina.get(o.oficina_id) || { oficina: o, pedidos: [] };
      g.pedidos.push(sol);
      porOficina.set(o.oficina_id, g);
    }
    for (const f of c.ficamFora) ficamFora.push({ ...f, numero: sol.numero });
  }
  return { grupos: Array.from(porOficina.values()).sort((a, b) => a.oficina.nome.localeCompare(b.oficina.nome)), ficamFora };
}

type TxtLembrete = { assunto1: string; assuntoN: string; ola: string; intro1: string; introN: string; abrir: string; rodape: string };
const TXT: Record<string, TxtLembrete> = {
  et: { assunto1: 'Päring {N} ootab veel sinu hinnapakkumist: {t}', assuntoN: '{n} päringut ootavad veel sinu hinnapakkumist', ola: 'Tere, {n}!', intro1: 'See päring ootab veel sinu hinnapakkumist:', introN: 'Need päringud ootavad veel sinu hinnapakkumist:', abrir: 'Ava päring', rodape: 'Saad selle meeldetuletuse, sest sinu töökoda sai selle päringu BipFixis. Kui oled juba muul viisil vastanud, jäta see kiri tähelepanuta.' },
  ru: { assunto1: 'Заявка {N} всё ещё ждёт вашей сметы: {t}', assuntoN: 'Заявки ({n}) всё ещё ждут вашей сметы', ola: 'Здравствуйте, {n}!', intro1: 'Эта заявка всё ещё ждёт вашей сметы:', introN: 'Эти заявки всё ещё ждут вашей сметы:', abrir: 'Открыть заявку', rodape: 'Вы получили это напоминание, потому что ваш автосервис получил эту заявку в BipFix. Если вы уже ответили другим способом, просто проигнорируйте письмо.' },
  en: { assunto1: 'Request {N} is still waiting for your quote: {t}', assuntoN: '{n} requests are still waiting for your quote', ola: 'Hello {n},', intro1: 'This request is still waiting for your quote:', introN: 'These requests are still waiting for your quote:', abrir: 'Open the request', rodape: 'You receive this reminder because your shop received this request on BipFix. If you have already replied another way, please ignore it.' },
  it: { assunto1: 'La richiesta {N} aspetta ancora il tuo preventivo: {t}', assuntoN: '{n} richieste aspettano ancora il tuo preventivo', ola: 'Ciao {n},', intro1: 'Questa richiesta aspetta ancora il tuo preventivo:', introN: 'Queste richieste aspettano ancora il tuo preventivo:', abrir: 'Apri la richiesta', rodape: 'Ricevi questo promemoria perché la tua officina ha ricevuto questa richiesta su BipFix. Se hai già risposto in altro modo, ignoralo.' },
  pt: { assunto1: 'O pedido {N} ainda espera o seu orçamento: {t}', assuntoN: '{n} pedidos ainda esperam o seu orçamento', ola: 'Olá, {n}!', intro1: 'Este pedido ainda espera o seu orçamento:', introN: 'Estes pedidos ainda esperam o seu orçamento:', abrir: 'Abrir o pedido', rodape: 'Você recebe este lembrete porque sua oficina recebeu este pedido na BipFix. Se já respondeu por outro canal, ignore.' },
  'pt-PT': { assunto1: 'O pedido {N} ainda aguarda o seu orçamento: {t}', assuntoN: '{n} pedidos ainda aguardam o seu orçamento', ola: 'Olá, {n}!', intro1: 'Este pedido ainda aguarda o seu orçamento:', introN: 'Estes pedidos ainda aguardam o seu orçamento:', abrir: 'Abrir o pedido', rodape: 'Recebe este lembrete porque a sua oficina recebeu este pedido na BipFix. Se já respondeu por outro canal, ignore.' },
};

export type ResultadoLembrete = { oficina_id: string; nome: string; pedidos: (number | null)[]; email: 'enviado' | 'falhou' | 'sem_email' | 'limite' };

/** Envia: por oficina 1 e-mail com todos os seus pedidos; por par 1 aviso no sino (cobranca_admin_solicitacao). */
export async function enviarLembretes(grupos: { oficina: OficinaAviso; pedidos: PedidoAviso[] }[], adminId: string): Promise<ResultadoLembrete[]> {
  const res: ResultadoLembrete[] = [];
  const porPedido = new Map<string, { sol: PedidoAviso; oficinas: { oficina_id: string; email: string }[] }>();
  for (const { oficina: o, pedidos } of grupos) {
    if (!pedidos.length) continue;
    const idioma = o.idioma && TXT[o.idioma] ? o.idioma : 'en';
    // sino por pedido (a regra das 48 h e o historico do admin leem daqui)
    const linhas = pedidos.map((sol) => {
      const n = notifClienteEsperandoOrcamento(idioma, String(sol.descricao || '').slice(0, 60));
      return {
        profile_id: o.profile_id, tipo: 'cobranca_admin_solicitacao', titulo: n.titulo, mensagem: n.mensagem,
        dados: { solicitacao_id: sol.id, lembrete: true, textos: emTodasAsLinguas((l) => notifClienteEsperandoOrcamento(l, String(sol.descricao || '').slice(0, 60))) } as Record<string, unknown>,
      };
    });
    const { data: inseridas, error } = await supabaseAdmin.from('notificacoes').insert(linhas).select('id, dados');
    if (error) console.error('[lembrar-oficinas] sino', error.message);
    let email: ResultadoLembrete['email'];
    if (!o.email) email = 'sem_email';
    else if (!dentroDoLimite(`email-pedido-oficina:${o.profile_id}`, EMAILS_POR_DIA, 24 * H)) email = 'limite';
    else email = (await emailLembrete(o, idioma, pedidos).catch((e) => { console.error('[lembrar-oficinas] e-mail', e); return false; })) ? 'enviado' : 'falhou';
    const em = new Date().toISOString();
    for (const n of (inseridas || []) as { id: string; dados: Record<string, unknown> }[]) {
      await supabaseAdmin.from('notificacoes').update({ dados: { ...n.dados, email, email_em: em } }).eq('id', n.id).then(() => {}, () => {});
    }
    res.push({ oficina_id: o.oficina_id, nome: o.nome, pedidos: pedidos.map((p) => p.numero), email });
    for (const sol of pedidos) {
      const g = porPedido.get(sol.id) || { sol, oficinas: [] };
      g.oficinas.push({ oficina_id: o.oficina_id, email });
      porPedido.set(sol.id, g);
    }
    await new Promise((r) => setTimeout(r, 600)); // Resend: poucos envios por segundo
  }
  for (const { sol, oficinas } of Array.from(porPedido.values())) {
    await registrarAuditoria(supabaseAdmin, { adminId, entidade: 'solicitacao', entidadeId: sol.id, solicitacaoId: sol.id, acao: 'lembrar_oficinas', depois: { oficinas } });
  }
  return res;
}

async function emailLembrete(o: OficinaAviso, idioma: string, pedidos: PedidoAviso[]): Promise<boolean> {
  const x = TXT[idioma] || TXT.en;
  const tipoDe = (sol: PedidoAviso) => TIPOS[idioma]?.[sol.tipo] || sol.tipo;
  const carroDe = (sol: PedidoAviso) => [sol.veiculo?.fipe_marca, sol.veiculo?.fipe_modelo].filter(Boolean).join(' ');
  const blocos: string[] = [];
  for (const sol of pedidos) {
    const links = await linkPedidoOficina({ numero: sol.numero, idioma, oficinaId: o.oficina_id, solicitacaoId: sol.id });
    const carro = carroDe(sol);
    const ano = sol.veiculo?.fipe_ano;
    const desc = String(sol.descricao || '').slice(0, 200).replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[…]');
    blocos.push(`
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;" data-pedido="${escapeHtml(String(sol.numero ?? ''))}">
          <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#111827;">#${escapeHtml(String(sol.numero ?? ''))} · ${escapeHtml(tipoDe(sol))}</p>
          ${carro ? `<p style="margin:0 0 6px;">${escapeHtml(carro)}${ano && ano !== '-' ? ' ' + escapeHtml(String(ano)) : ''}</p>` : ''}
          ${desc ? `<p style="margin:0 0 6px;color:#374151;">${escapeHtml(desc)}</p>` : ''}
          ${sol.area ? `<p style="margin:0 0 12px;color:#6b7280;font-size:14px;">${escapeHtml(sol.area)}</p>` : ''}
          <p style="margin:0;"><a href="${links.abrir}" style="display:inline-block;background:#1e40af;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">${x.abrir}</a></p>
          ${links.naoTenhoInteresse !== links.abrir ? `<p style="margin:10px 0 0;font-size:14px;"><a href="${links.naoTenhoInteresse}" style="color:#4b5563;">${SEM_INTERESSE[idioma] || SEM_INTERESSE.en}</a></p>` : ''}
        </div>`);
  }
  const um = pedidos.length === 1;
  const assunto = um
    ? x.assunto1.replace('{N}', String(pedidos[0].numero ?? '')).replace('{t}', [tipoDe(pedidos[0]), carroDe(pedidos[0])].filter(Boolean).join(' – '))
    : x.assuntoN.replace('{n}', String(pedidos.length));
  return enviarEmail({
    para: o.email as string, assunto,
    ...(process.env.ADMIN_NOTIFICATION_EMAIL ? { responderPara: process.env.ADMIN_NOTIFICATION_EMAIL } : {}),
    html: `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>${x.ola.replace('{n}', escapeHtml(o.nome_dono || o.nome || ''))}</p>
        <p>${um ? x.intro1 : x.introN}</p>
        ${blocos.join('')}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${x.rodape}</p>
      </div>
    </div>`,
  });
}
