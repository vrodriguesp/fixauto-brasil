import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { SITE_URL, idiomaDoSite } from './site-url';
import { fusoDoPais } from './fuso';
import { formatCurrency } from './utils';
import { currencyForCountry } from './currency';
import { dataJanela } from './notif-agenda';

// O CLIENTE aceitou o orcamento (QA do check-in v2, D9 - decisao 8: o horario aparece igual em todo lugar,
// inclusive nos avisos): a oficina recebe um e-mail com o dia + a janela de chegada, no mesmo padrao do
// e-mail "o cliente cancelou" (email-cancelamento-cliente.ts). Antes so havia o aviso no sino, sem data.
// Chamar DEPOIS de criar a agenda (a janela vem dela: data_inicio + checkin_ate).
type T = { ass: string; ola: string; corpo: string; chegada: string; agenda: string; ver: string };
const TXT: Record<string, T> = {
  pt: { ass: 'Orçamento aceito – pedido nº {numero}, {quando}', ola: 'Olá, {n}!', corpo: 'O cliente aceitou o seu orçamento de {valor} para o pedido nº {numero} ({carro}).', chegada: 'Chegada do carro: {quando}.', agenda: 'O agendamento já está na sua agenda.', ver: 'Ver o pedido' },
  'pt-PT': { ass: 'Orçamento aceite – pedido n.º {numero}, {quando}', ola: 'Olá, {n}!', corpo: 'O cliente aceitou o seu orçamento de {valor} para o pedido n.º {numero} ({carro}).', chegada: 'Chegada do carro: {quando}.', agenda: 'A marcação já está na sua agenda.', ver: 'Ver o pedido' },
  en: { ass: 'Quote accepted – request no. {numero}, {quando}', ola: 'Hi {n},', corpo: 'The customer accepted your {valor} quote for request no. {numero} ({carro}).', chegada: 'Car arrives: {quando}.', agenda: 'The booking is already in your calendar.', ver: 'View the request' },
  et: { ass: 'Hinnapakkumine kinnitatud – päring nr {numero}, {quando}', ola: 'Tere, {n}!', corpo: 'Klient kinnitas sinu hinnapakkumise {valor} päringule nr {numero} ({carro}).', chegada: 'Auto saabub: {quando}.', agenda: 'Broneering on juba sinu kalendris.', ver: 'Vaata päringut' },
  ru: { ass: 'Смета принята – заявка № {numero}, {quando}', ola: 'Здравствуйте, {n}!', corpo: 'Клиент принял вашу смету на {valor} по заявке № {numero} ({carro}).', chegada: 'Приезд авто: {quando}.', agenda: 'Запись уже в вашем календаре.', ver: 'Открыть заявку' },
  it: { ass: 'Preventivo accettato – richiesta n. {numero}, {quando}', ola: 'Ciao {n},', corpo: 'Il cliente ha accettato il tuo preventivo di {valor} per la richiesta n. {numero} ({carro}).', chegada: 'Arrivo dell’auto: {quando}.', agenda: 'La prenotazione è già nel tuo calendario.', ver: 'Vedi la richiesta' },
};
const preencher = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const caixa = (corpo: string) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:white;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">${corpo}</div>`;
const botao = (href: string, texto: string) => `<p><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1e40af;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(texto)}</a></p>`;

export async function avisarOficinaAceite(agendaId: string, valorTotal: number): Promise<boolean> {
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, data_inicio, checkin_ate, solicitacao_id, oficina:oficinas(nome_fantasia, pais, profile:profiles!oficinas_profile_id_fkey(email, idioma, nome))')
    .eq('id', agendaId).maybeSingle();
  const of = (ag as any)?.oficina || {}; const pOf = of.profile || {};
  if (!ag?.solicitacao_id || !pOf.email) return false;
  const { data: sol } = await supabaseAdmin.from('solicitacoes').select('numero, veiculo:veiculos(fipe_marca, fipe_modelo, placa)').eq('id', ag.solicitacao_id).maybeSingle();
  const v = (sol as any)?.veiculo || {};
  const l = idiomaDoSite(pOf.idioma); const x = TXT[l] || TXT.en;
  const quando = dataJanela(ag.data_inicio, (ag as any).checkin_ate, l, fusoDoPais(of.pais));
  const numero = String((sol as any)?.numero ?? '');
  const carro = [v.fipe_marca, v.fipe_modelo, v.placa].filter(Boolean).join(' ') || '-';
  const valor = formatCurrency(Number(valorTotal), currencyForCountry(of.pais), l);
  const site = SITE_URL.replace('://www.', '://');
  const html = caixa(`<p>${escapeHtml(preencher(x.ola, { n: pOf.nome || of.nome_fantasia || '' }))}</p>
    <p style="font-size:16px;">${escapeHtml(preencher(x.corpo, { valor, numero, carro }))}</p>
    <p style="font-size:16px;"><strong>${escapeHtml(preencher(x.chegada, { quando }))}</strong></p>
    <p>${escapeHtml(x.agenda)}</p>${botao(`${site}/oficina/pedidos/${ag.solicitacao_id}`, x.ver)}`);
  return enviarEmail({ para: pOf.email, assunto: preencher(x.ass, { numero, quando }), html }).catch(() => false);
}
