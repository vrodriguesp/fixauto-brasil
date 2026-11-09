import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { SITE_URL, idiomaDoSite } from './site-url';
import { fusoDoPais } from './fuso';
import { montarIcs } from './email-agendamento';
import { motivoTexto } from './notif-i18n';
import type { EmailLocale } from './email-i18n';

// O CLIENTE cancelou o pedido com o carro ja agendado (dono 09/11, cancelamento pela boa pratica):
//  - cliente: e-mail de confirmacao e, se recebeu o evento antes, o .ics de cancelamento (mesmo UID)
//    que tira o agendamento do calendario; lembra que pode reabrir o pedido;
//  - oficina: e-mail dizendo que o horario ficou livre, com o motivo (se houver).
// Chamar DEPOIS de cancelar a agenda.
type T = { assCli: string; ola: string; cli: string; reabrir: string; anexo: string; assOf: string; of: string; livre: string; motivo: string; verPedido: string; verAgenda: string; evento: string };
const TXT: Record<string, T> = {
  pt: { assCli: 'Agendamento cancelado – {oficina}, {quando}', ola: 'Olá, {n}!', cli: 'Você cancelou o pedido nº {numero}. O agendamento com {oficina} em {quando} foi cancelado e a oficina foi avisada.', reabrir: 'Se mudar de ideia, é só reabrir o pedido.', anexo: 'O anexo tira o agendamento do seu calendário.', assOf: 'O cliente cancelou – pedido nº {numero}, {quando}', of: 'O cliente cancelou o pedido nº {numero} ({carro}). O agendamento de {quando} foi cancelado.', livre: 'O horário ficou livre na sua agenda.', motivo: 'Motivo informado', verPedido: 'Ver o pedido', verAgenda: 'Abrir a agenda', evento: 'Carro na {oficina} (BipFix)' },
  'pt-PT': { assCli: 'Marcação cancelada – {oficina}, {quando}', ola: 'Olá, {n}!', cli: 'Cancelou o pedido n.º {numero}. A marcação com {oficina} em {quando} foi cancelada e a oficina foi avisada.', reabrir: 'Se mudar de ideias, basta reabrir o pedido.', anexo: 'O anexo retira a marcação do seu calendário.', assOf: 'O cliente cancelou – pedido n.º {numero}, {quando}', of: 'O cliente cancelou o pedido n.º {numero} ({carro}). A marcação de {quando} foi cancelada.', livre: 'O horário ficou livre na sua agenda.', motivo: 'Motivo indicado', verPedido: 'Ver o pedido', verAgenda: 'Abrir a agenda', evento: 'Carro na {oficina} (BipFix)' },
  en: { assCli: 'Booking cancelled – {oficina}, {quando}', ola: 'Hi {n},', cli: 'You cancelled request no. {numero}. The booking with {oficina} on {quando} is cancelled and the repair shop has been told.', reabrir: 'If you change your mind, just reopen the request.', anexo: 'The attachment removes the booking from your calendar.', assOf: 'Customer cancelled – request no. {numero}, {quando}', of: 'The customer cancelled request no. {numero} ({carro}). The booking on {quando} is cancelled.', livre: 'The slot is free again in your calendar.', motivo: 'Reason given', verPedido: 'View the request', verAgenda: 'Open the calendar', evento: 'Car at {oficina} (BipFix)' },
  et: { assCli: 'Broneering tühistatud – {oficina}, {quando}', ola: 'Tere, {n}!', cli: 'Tühistasid päringu nr {numero}. Broneering töökojas {oficina} ({quando}) on tühistatud ja töökoda on teavitatud.', reabrir: 'Kui mõtled ümber, ava päring lihtsalt uuesti.', anexo: 'Manus eemaldab broneeringu sinu kalendrist.', assOf: 'Klient tühistas – päring nr {numero}, {quando}', of: 'Klient tühistas päringu nr {numero} ({carro}). Broneering ({quando}) on tühistatud.', livre: 'Aeg on sinu kalendris jälle vaba.', motivo: 'Põhjus', verPedido: 'Vaata päringut', verAgenda: 'Ava kalender', evento: 'Auto töökojas {oficina} (BipFix)' },
  ru: { assCli: 'Запись отменена – {oficina}, {quando}', ola: 'Здравствуйте, {n}!', cli: 'Вы отменили заявку № {numero}. Запись в {oficina} на {quando} отменена, автосервис уведомлён.', reabrir: 'Если передумаете, просто откройте заявку снова.', anexo: 'Вложение удаляет запись из вашего календаря.', assOf: 'Клиент отменил – заявка № {numero}, {quando}', of: 'Клиент отменил заявку № {numero} ({carro}). Запись на {quando} отменена.', livre: 'Время в вашем календаре снова свободно.', motivo: 'Причина', verPedido: 'Открыть заявку', verAgenda: 'Открыть календарь', evento: 'Авто в {oficina} (BipFix)' },
  it: { assCli: 'Prenotazione annullata – {oficina}, {quando}', ola: 'Ciao {n},', cli: 'Hai annullato la richiesta n. {numero}. La prenotazione con {oficina} per {quando} è annullata e l’officina è stata avvisata.', reabrir: 'Se cambi idea, riapri la richiesta.', anexo: 'L’allegato toglie la prenotazione dal tuo calendario.', assOf: 'Il cliente ha annullato – richiesta n. {numero}, {quando}', of: 'Il cliente ha annullato la richiesta n. {numero} ({carro}). La prenotazione del {quando} è annullata.', livre: 'L’orario è di nuovo libero nel tuo calendario.', motivo: 'Motivo indicato', verPedido: 'Vedi la richiesta', verAgenda: 'Apri il calendario', evento: 'Auto da {oficina} (BipFix)' },
};
const LOCALE: Record<string, string> = { pt: 'pt-BR', 'pt-PT': 'pt-PT', en: 'en-GB', et: 'et-EE', ru: 'ru-RU', it: 'it-IT' };
const preencher = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const caixa = (corpo: string) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:white;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">${corpo}</div>`;
const botao = (href: string, texto: string) => `<p><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1e40af;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(texto)}</a></p>`;

export async function avisarCancelamentoPeloCliente(agendaId: string, motivo: string | null): Promise<void> {
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, data_inicio, aviso_cliente_inicio, aviso_cliente_seq, solicitacao_id, oficina:oficinas(nome_fantasia, endereco, cidade, pais, profile:profiles!oficinas_profile_id_fkey(email, idioma, nome))')
    .eq('id', agendaId).maybeSingle();
  if (!ag?.solicitacao_id) return;
  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('numero, veiculo:veiculos(fipe_marca, fipe_modelo, placa), cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma)')
    .eq('id', ag.solicitacao_id).maybeSingle();
  if (!sol) return;
  const of = (ag as any).oficina || {}; const cliente = (sol as any).cliente || {}; const v = (sol as any).veiculo || {};
  const fuso = fusoDoPais(of.pais || 'EE');
  const inicio = new Date(ag.data_inicio);
  const quandoEm = (l: string) => inicio.toLocaleString(LOCALE[l] || 'en-GB', { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const numero = String((sol as any).numero ?? '');
  const nomeOf = of.nome_fantasia || 'BipFix';
  const carro = [v.fipe_marca, v.fipe_modelo, v.placa].filter(Boolean).join(' ') || '-';
  const site = SITE_URL.replace('://www.', '://');
  // o motivo vem como codigo (ja_resolvi...): texto na lingua de quem recebe
  const linhaMotivo = (x: T, l: string) => (motivo ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 12px;"><strong>${escapeHtml(x.motivo)}:</strong> ${escapeHtml(motivoTexto(l as EmailLocale, motivo))}</p>` : '');

  // cliente
  if (cliente.email) {
    const l = idiomaDoSite(cliente.idioma); const x = TXT[l] || TXT.en; const quando = quandoEm(l);
    const anexos = [];
    if (ag.aviso_cliente_inicio) {
      const seq = (ag.aviso_cliente_seq || 0) + 1;
      await supabaseAdmin.from('agenda').update({ aviso_cliente_seq: seq }).eq('id', ag.id);
      const titulo = x.evento.replace('{oficina}', nomeOf);
      anexos.push({ nome: 'bipfix-agendamento.ics', tipo: 'text/calendar; charset=utf-8; method=CANCEL', conteudo: montarIcs({
        cancelar: true, uid: `agenda-${ag.id}@bipfix.com`, seq, inicio, fim: new Date(inicio.getTime() + 3600e3), titulo,
        local: [of.endereco, of.cidade].filter(Boolean).join(', '), descricao: motivo || '', url: `${site}/r/${numero}`,
        nomeCliente: cliente.nome || '', emailCliente: cliente.email, lembrete1: titulo, lembrete2: titulo,
      }) });
    }
    const html = caixa(`<p>${escapeHtml(preencher(x.ola, { n: cliente.nome || '' }))}</p>
      <p style="font-size:16px;"><strong>${escapeHtml(preencher(x.cli, { numero, oficina: nomeOf, quando }))}</strong></p>
      ${linhaMotivo(x, l)}<p>${escapeHtml(x.reabrir)}</p>${botao(`${site}/r/${numero}`, x.verPedido)}
      ${anexos.length ? `<p style="font-size:13px;color:#6b7280;">📅 ${escapeHtml(x.anexo)}</p>` : ''}`);
    await enviarEmail({ para: cliente.email, assunto: preencher(x.assCli, { oficina: nomeOf, quando }), html, anexos }).catch(() => false);
  }
  // oficina
  const pOf = of.profile || {};
  if (pOf.email) {
    const l = idiomaDoSite(pOf.idioma); const x = TXT[l] || TXT.en; const quando = quandoEm(l);
    const html = caixa(`<p>${escapeHtml(preencher(x.ola, { n: pOf.nome || nomeOf }))}</p>
      <p style="font-size:16px;"><strong>${escapeHtml(preencher(x.of, { numero, carro, quando }))}</strong></p>
      ${linhaMotivo(x, l)}<p>${escapeHtml(x.livre)}</p>${botao(`${site}/oficina/agenda`, x.verAgenda)}`);
    await enviarEmail({ para: pOf.email, assunto: preencher(x.assOf, { numero, quando }), html }).catch(() => false);
  }
}
