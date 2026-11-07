import { supabaseAdmin } from './supabase-admin';
import { enviarEmail } from './email';
import { escapeHtml } from './email-i18n';
import { SITE_URL, idiomaDoSite } from './site-url';
import { formatCurrency } from './utils';
import { currencyForCountry } from './currency';
import { fusoDoPais } from './fuso';

// E-mail de agendamento para o cliente (dono 07/11): depois de aceitar o
// orcamento, o cliente recebe tudo num lugar so - oficina (endereco com mapa,
// telefone), quando levar o carro, previsao de entrega, carro, valor e itens -
// mais o evento de calendario: botao do Google Calendar e o arquivo .ics anexo
// (calendario do iPhone/Mac e Outlook), com lembretes 1 dia e 1 hora antes.
// Se o horario mudar (oficina ou cliente remarcou), vai outro e-mail com o MESMO
// evento (mesmo UID, SEQUENCE maior): o calendario atualiza em vez de duplicar.
// Controle na agenda (migracao 075): aviso_cliente_inicio / aviso_cliente_seq.

type Txt = {
  assuntoConf: string; assuntoAlt: string; ola: string; introConf: string; introAlt: string;
  oficina: string; endereco: string; telefone: string; levar: string; pronto: string; carro: string; valor: string;
  itens: string; garantia: string; mapa: string; google: string; verPedido: string; anexo: string; evento: string; rodape: string;
  remarcar: string; conversar: string; motivo: string; assuntoCanc: string; introCanc: string; reaberto: string; anexoCanc: string;
};
const TXT: Record<string, Txt> = {
  pt: {
    assuntoConf: 'Agendamento confirmado – {oficina}, {quando}', assuntoAlt: 'Horário alterado – {oficina}, {quando}', ola: 'Olá, {n}!',
    introConf: 'Você aceitou o orçamento. Estes são os detalhes do agendamento:', introAlt: 'O horário do seu agendamento mudou. Estes são os novos detalhes:',
    oficina: 'Oficina', endereco: 'Endereço', telefone: 'Telefone', levar: 'Levar o carro', pronto: 'Previsão de entrega', carro: 'Carro', valor: 'Valor do orçamento',
    itens: 'O que está incluído', garantia: 'Garantia: {n} dias', mapa: 'Ver no mapa', google: 'Adicionar ao Google Calendar', verPedido: 'Ver o pedido',
    anexo: 'O arquivo em anexo adiciona o agendamento ao calendário do iPhone, do Mac ou do Outlook, com lembretes no dia anterior e 1 hora antes.',
    evento: 'Levar o carro: {oficina}', rodape: 'Você recebe este e-mail porque aceitou um orçamento na BipFix.',
    remarcar: "Para remarcar ou cancelar, escreva para a oficina no chat do pedido ou ligue para ela.", conversar: "Conversar com a oficina", motivo: "Motivo da oficina", assuntoCanc: "Agendamento cancelado – {oficina}", introCanc: "A oficina cancelou o agendamento de {quando}.", reaberto: "Seu pedido voltou a ficar aberto: você pode escolher outro orçamento ou esperar novas ofertas.", anexoCanc: "O arquivo em anexo tira o agendamento do seu calendário.",
  },
  'pt-PT': {
    assuntoConf: 'Marcação confirmada – {oficina}, {quando}', assuntoAlt: 'Horário alterado – {oficina}, {quando}', ola: 'Olá, {n}!',
    introConf: 'Aceitou o orçamento. Estes são os detalhes da marcação:', introAlt: 'O horário da sua marcação mudou. Estes são os novos detalhes:',
    oficina: 'Oficina', endereco: 'Morada', telefone: 'Telefone', levar: 'Entregar o carro', pronto: 'Previsão de entrega', carro: 'Carro', valor: 'Valor do orçamento',
    itens: 'O que está incluído', garantia: 'Garantia: {n} dias', mapa: 'Ver no mapa', google: 'Adicionar ao Google Calendar', verPedido: 'Ver o pedido',
    anexo: 'O ficheiro em anexo adiciona a marcação ao calendário do iPhone, do Mac ou do Outlook, com lembretes no dia anterior e 1 hora antes.',
    evento: 'Entregar o carro: {oficina}', rodape: 'Recebe este e-mail porque aceitou um orçamento na BipFix.',
    remarcar: "Para remarcar ou cancelar, escreva à oficina no chat do pedido ou ligue-lhe.", conversar: "Conversar com a oficina", motivo: "Motivo da oficina", assuntoCanc: "Marcação cancelada – {oficina}", introCanc: "A oficina cancelou a marcação de {quando}.", reaberto: "O seu pedido voltou a ficar aberto: pode escolher outro orçamento ou esperar por novas propostas.", anexoCanc: "O ficheiro em anexo retira a marcação do seu calendário.",
  },
  en: {
    assuntoConf: 'Booking confirmed – {oficina}, {quando}', assuntoAlt: 'Booking time changed – {oficina}, {quando}', ola: 'Hello {n},',
    introConf: 'You accepted the quote. Here are the booking details:', introAlt: 'The time of your booking has changed. Here are the new details:',
    oficina: 'Repair shop', endereco: 'Address', telefone: 'Phone', levar: 'Drop-off', pronto: 'Expected ready', carro: 'Car', valor: 'Quote total',
    itens: 'What is included', garantia: 'Warranty: {n} days', mapa: 'Open in maps', google: 'Add to Google Calendar', verPedido: 'See the request',
    anexo: 'The attached file adds the booking to the calendar on your iPhone, Mac or Outlook, with reminders the day before and 1 hour before.',
    evento: 'Car drop-off: {oficina}', rodape: 'You receive this e-mail because you accepted a quote on BipFix.',
    remarcar: "To reschedule or cancel, write to the repair shop in the request chat or call them.", conversar: "Message the repair shop", motivo: "Reason given by the repair shop", assuntoCanc: "Booking cancelled – {oficina}", introCanc: "The repair shop cancelled the booking for {quando}.", reaberto: "Your request is open again: you can choose another quote or wait for new offers.", anexoCanc: "The attached file removes the booking from your calendar.",
  },
  et: {
    assuntoConf: 'Broneering kinnitatud – {oficina}, {quando}', assuntoAlt: 'Broneeringu aeg muutus – {oficina}, {quando}', ola: 'Tere, {n}!',
    introConf: 'Võtsid hinnapakkumise vastu. Siin on broneeringu andmed:', introAlt: 'Sinu broneeringu aeg muutus. Siin on uued andmed:',
    oficina: 'Töökoda', endereco: 'Aadress', telefone: 'Telefon', levar: 'Auto viimine', pronto: 'Eeldatavalt valmis', carro: 'Auto', valor: 'Pakkumise summa',
    itens: 'Mis on hinnas', garantia: 'Garantii: {n} päeva', mapa: 'Ava kaardil', google: 'Lisa Google\'i kalendrisse', verPedido: 'Vaata päringut',
    anexo: 'Manuses olev fail lisab broneeringu iPhone\'i, Maci või Outlooki kalendrisse koos meeldetuletustega päev enne ja 1 tund enne.',
    evento: 'Auto viimine: {oficina}', rodape: 'Saad selle kirja, sest võtsid BipFixis hinnapakkumise vastu.',
    remarcar: "Aja muutmiseks või tühistamiseks kirjuta töökojale päringu vestluses või helista.", conversar: "Kirjuta töökojale", motivo: "Töökoja põhjendus", assuntoCanc: "Broneering tühistatud – {oficina}", introCanc: "Töökoda tühistas broneeringu ({quando}).", reaberto: "Sinu päring on jälle avatud: saad valida teise pakkumise või oodata uusi.", anexoCanc: "Manuses olev fail eemaldab broneeringu sinu kalendrist.",
  },
  ru: {
    assuntoConf: 'Запись подтверждена – {oficina}, {quando}', assuntoAlt: 'Время записи изменено – {oficina}, {quando}', ola: 'Здравствуйте, {n}!',
    introConf: 'Вы приняли смету. Вот данные записи:', introAlt: 'Время вашей записи изменилось. Вот новые данные:',
    oficina: 'Автосервис', endereco: 'Адрес', telefone: 'Телефон', levar: 'Сдать машину', pronto: 'Ожидаемая готовность', carro: 'Автомобиль', valor: 'Сумма сметы',
    itens: 'Что входит', garantia: 'Гарантия: {n} дн.', mapa: 'Открыть на карте', google: 'Добавить в Google Календарь', verPedido: 'Открыть заявку',
    anexo: 'Прикреплённый файл добавит запись в календарь iPhone, Mac или Outlook с напоминаниями за день и за 1 час.',
    evento: 'Сдать машину: {oficina}', rodape: 'Вы получили это письмо, потому что приняли смету в BipFix.',
    remarcar: "Чтобы перенести или отменить запись, напишите автосервису в чате заявки или позвоните.", conversar: "Написать автосервису", motivo: "Причина от автосервиса", assuntoCanc: "Запись отменена – {oficina}", introCanc: "Автосервис отменил запись на {quando}.", reaberto: "Ваша заявка снова открыта: вы можете выбрать другую смету или дождаться новых предложений.", anexoCanc: "Прикреплённый файл удалит запись из вашего календаря.",
  },
  it: {
    assuntoConf: 'Prenotazione confermata – {oficina}, {quando}', assuntoAlt: 'Orario della prenotazione modificato – {oficina}, {quando}', ola: 'Ciao {n},',
    introConf: 'Hai accettato il preventivo. Ecco i dettagli della prenotazione:', introAlt: 'L’orario della tua prenotazione è cambiato. Ecco i nuovi dettagli:',
    oficina: 'Officina', endereco: 'Indirizzo', telefone: 'Telefono', levar: 'Consegna dell’auto', pronto: 'Pronta prevista', carro: 'Auto', valor: 'Totale del preventivo',
    itens: 'Cosa è incluso', garantia: 'Garanzia: {n} giorni', mapa: 'Apri nella mappa', google: 'Aggiungi a Google Calendar', verPedido: 'Vedi la richiesta',
    anexo: 'Il file allegato aggiunge la prenotazione al calendario di iPhone, Mac o Outlook, con promemoria il giorno prima e 1 ora prima.',
    evento: 'Consegna dell’auto: {oficina}', rodape: 'Ricevi questa e-mail perché hai accettato un preventivo su BipFix.',
    remarcar: "Per spostare o annullare, scrivi all’officina nella chat della richiesta o chiamala.", conversar: "Scrivi all’officina", motivo: "Motivo dell’officina", assuntoCanc: "Prenotazione annullata – {oficina}", introCanc: "L’officina ha annullato la prenotazione del {quando}.", reaberto: "La tua richiesta è di nuovo aperta: puoi scegliere un altro preventivo o attendere nuove offerte.", anexoCanc: "Il file allegato rimuove la prenotazione dal tuo calendario.",
  },
};
const LOCALE_DATA: Record<string, string> = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB', it: 'it-IT', 'pt-PT': 'pt-PT', pt: 'pt-BR' };

// ---------- .ics (RFC 5545) ----------
const icsData = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsTexto = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// linhas de no maximo 75 bytes, continuacao com espaco (sem cortar caractere UTF-8)
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  for (const ch of linha) {
    const limite = partes.length ? 74 : 75;
    if (Buffer.byteLength(atual + ch, 'utf8') > limite) { partes.push(atual); atual = ''; }
    atual += ch;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

export function montarIcs(e: {
  cancelar?: boolean; uid: string; seq: number; inicio: Date; fim: Date; titulo: string; local: string; descricao: string; url: string;
  nomeCliente: string; emailCliente: string; lembrete1: string; lembrete2: string;
}): string {
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BipFix//Agendamento//EN', 'CALSCALE:GREGORIAN', e.cancelar ? 'METHOD:CANCEL' : 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${e.uid}`, `SEQUENCE:${e.seq}`, `DTSTAMP:${icsData(new Date())}`,
    `DTSTART:${icsData(e.inicio)}`, `DTEND:${icsData(e.fim)}`,
    `SUMMARY:${icsTexto(e.titulo)}`, `LOCATION:${icsTexto(e.local)}`, `DESCRIPTION:${icsTexto(e.descricao)}`, `URL:${e.url}`,
    'ORGANIZER;CN=BipFix:mailto:noreply@bipfix.com',
    // parametro com aspas (RFC 5545): nome com ':' ';' ',' nao quebra a linha
    `ATTENDEE;CN="${e.nomeCliente.replace(/["\r\n]/g, '')}";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${e.emailCliente}`,
    ...(e.cancelar ? ['STATUS:CANCELLED'] : [
      'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(e.lembrete1)}`, 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(e.lembrete2)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    ]),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

export function linkGoogleCalendar(e: { inicio: Date; fim: Date; titulo: string; local: string; descricao: string }): string {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: `${icsData(e.inicio)}/${icsData(e.fim)}`, details: e.descricao, location: e.local });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/**
 * Manda o e-mail do agendamento ao cliente, se o horario atual ainda nao foi
 * avisado: o primeiro depois do aceite; outro ("horario alterado") se mudou.
 * Devolve true se mandou (false: nada a avisar, sem e-mail ou erro).
 */
export async function avisarClienteAgendamento(agendaId: string, opcoes: { motivo?: string } = {}): Promise<boolean> {
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, tipo, oficina_id, data_inicio, data_fim, data_fim_prevista, status, aviso_cliente_inicio, aviso_cliente_seq, solicitacao_id, oficina:oficinas(nome_fantasia, endereco, cidade, pais, latitude, longitude, profile:profiles!oficinas_profile_id_fkey(telefone))')
    .eq('id', agendaId).maybeSingle();
  // so carro ainda por chegar (depois do check-in a data muda por outros motivos)
  if (!ag || !ag.solicitacao_id || ag.status !== 'agendado' || ag.tipo !== 'plataforma') return false;
  // so agenda da oficina com o orcamento aceito deste pedido (auditoria 07/11, H1)
  const { data: orc } = await supabaseAdmin.from('orcamentos')
    .select('valor_total, garantia_dias, itens:orcamento_itens(descricao, quantidade, valor_total)')
    .eq('solicitacao_id', ag.solicitacao_id).eq('oficina_id', ag.oficina_id).eq('status', 'aceito').maybeSingle();
  if (!orc) return false;
  if (ag.aviso_cliente_inicio && new Date(ag.aviso_cliente_inicio).getTime() === new Date(ag.data_inicio).getTime()) return false;
  const remarcado = !!ag.aviso_cliente_inicio;
  const seq = remarcado ? (ag.aviso_cliente_seq || 0) + 1 : 0;
  // marca antes de mandar (duas chamadas ao mesmo tempo mandam um e-mail so)
  let marcar = supabaseAdmin.from('agenda').update({ aviso_cliente_inicio: ag.data_inicio, aviso_cliente_seq: seq }).eq('id', ag.id);
  marcar = ag.aviso_cliente_inicio ? marcar.eq('aviso_cliente_inicio', ag.aviso_cliente_inicio) : marcar.is('aviso_cliente_inicio', null);
  const { data: marcado } = await marcar.select('id');
  if (!marcado?.length) return false;

  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('numero, veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, fipe_ano, placa), cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma)')
    .eq('id', ag.solicitacao_id).maybeSingle();
  const cliente = (sol as any)?.cliente;
  if (!sol || !cliente?.email) return false;
  const idioma = idiomaDoSite(cliente.idioma);
  const x = TXT[idioma] || TXT.en;
  const of = (ag as any).oficina || {};
  const pais = of.pais || 'EE';
  const fuso = fusoDoPais(pais);
  const loc = LOCALE_DATA[idioma] || 'en-GB';
  const inicio = new Date(ag.data_inicio);
  const fimEvento = new Date(inicio.getTime() + 60 * 60 * 1000); // o evento e a entrega do carro (1 h)
  const quando = inicio.toLocaleString(loc, { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const prontoEm = ag.data_fim_prevista || ag.data_fim;
  const pronto = prontoEm ? new Date(prontoEm).toLocaleDateString(loc, { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const v = (sol as any).veiculo || {};
  const carro = [v.fipe_marca, v.fipe_modelo, v.fipe_ano && v.fipe_ano !== '-' ? v.fipe_ano : null].filter(Boolean).join(' ') + (v.placa ? ` · ${v.placa}` : '');
  const endereco = [of.endereco, of.cidade].filter(Boolean).join(', ');
  const tel = of.profile?.telefone || '';
  const mapa = of.latitude != null && of.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${of.latitude},${of.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
  const moeda = currencyForCountry(pais);
  const valor = orc?.valor_total != null ? formatCurrency(Number(orc.valor_total), moeda, idioma) : '';
  const itens = ((orc as any)?.itens || []) as { descricao: string; quantidade: number; valor_total: number }[];
  const link = `${SITE_URL.replace('://www.', '://')}/r/${(sol as any).numero}`;
  const linkChat = `${link}?c=1`;
  const nomeOf = of.nome_fantasia || 'BipFix';
  const titulo = x.evento.replace('{oficina}', nomeOf);
  const descricao = [
    carro && `${x.carro}: ${carro}`, tel && `${x.telefone}: ${tel}`, pronto && `${x.pronto}: ${pronto}`, valor && `${x.valor}: ${valor}`, link,
  ].filter(Boolean).join('\n');
  const google = linkGoogleCalendar({ inicio, fim: fimEvento, titulo, local: endereco, descricao });
  const ics = montarIcs({
    uid: `agenda-${ag.id}@bipfix.com`, seq, inicio, fim: fimEvento, titulo, local: endereco, descricao, url: link,
    nomeCliente: cliente.nome || '', emailCliente: cliente.email, lembrete1: titulo, lembrete2: titulo,
  });

  const linha = (rotulo: string, valorHtml: string) => valorHtml
    ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(rotulo)}</td><td style="padding:6px 0;color:#111827;">${valorHtml}</td></tr>` : '';
  const botao = (href: string, txt: string, cor: string, fundo: string) =>
    `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${fundo};color:${cor};text-decoration:none;font-weight:bold;margin:6px 6px 6px 0;">${escapeHtml(txt)}</a>`;
  const assunto = (remarcado ? x.assuntoAlt : x.assuntoConf).replace('{oficina}', nomeOf).replace('{quando}', quando);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>${x.ola.replace('{n}', () => escapeHtml(cliente.nome || ''))}</p>
        <p>${escapeHtml(remarcado ? x.introAlt : x.introConf)}</p>
        ${opcoes.motivo ? `<p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 12px;"><strong>${escapeHtml(x.motivo)}:</strong> ${escapeHtml(opcoes.motivo)}</p>` : ''}
        <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 8px;font-size:18px;font-weight:bold;color:#111827;">${escapeHtml(x.levar)}: ${escapeHtml(quando)}</p>
          <table style="border-collapse:collapse;font-size:14px;">
            ${linha(x.oficina, escapeHtml(nomeOf))}
            ${linha(x.endereco, endereco ? `${escapeHtml(endereco)} · <a href="${mapa}" style="color:#1e40af;">${escapeHtml(x.mapa)}</a>` : '')}
            ${linha(x.telefone, tel ? `<a href="tel:${escapeHtml(tel.replace(/\s/g, ''))}" style="color:#1e40af;">${escapeHtml(tel)}</a>` : '')}
            ${linha(x.pronto, escapeHtml(pronto))}
            ${linha(x.carro, escapeHtml(carro))}
            ${linha(x.valor, valor ? `<strong>${escapeHtml(valor)}</strong>` : '')}
          </table>
          ${itens.length ? `<p style="margin:12px 0 4px;color:#6b7280;font-size:14px;">${escapeHtml(x.itens)}</p><ul style="margin:0;padding-left:20px;font-size:14px;color:#374151;">${itens.map((i) => `<li>${escapeHtml(i.descricao)}${i.quantidade > 1 ? ` × ${i.quantidade}` : ''} – ${escapeHtml(formatCurrency(Number(i.valor_total), moeda, idioma))}</li>`).join('')}</ul>` : ''}
          ${orc?.garantia_dias ? `<p style="margin:8px 0 0;font-size:14px;color:#374151;">${escapeHtml(x.garantia.replace('{n}', String(orc.garantia_dias)))}</p>` : ''}
        </div>
        <p>${botao(google, x.google, '#ffffff', '#1e40af')}${botao(link, x.verPedido, '#374151', '#e5e7eb')}</p>
        <p style="font-size:13px;color:#6b7280;">📅 ${escapeHtml(x.anexo)}</p>
        <p style="font-size:14px;color:#374151;margin-top:16px;">${escapeHtml(x.remarcar)}</p>
        <p>${botao(linkChat, x.conversar, '#1e40af', '#dbeafe')}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${escapeHtml(x.rodape)}</p>
      </div>
    </div>`;
  return enviarEmail({ para: cliente.email, assunto, html, anexos: [{ nome: 'bipfix-agendamento.ics', conteudo: ics, tipo: 'text/calendar; charset=utf-8; method=REQUEST' }] });
}

/**
 * A oficina cancelou o agendamento (com justificativa): e-mail ao cliente com o
 * motivo e, se ele recebeu o evento antes, o .ics de cancelamento (mesmo UID)
 * que tira o agendamento do calendario. Chamar DEPOIS de cancelar a agenda.
 */
export async function avisarClienteCancelamento(agendaId: string, motivo: string, reaberto: boolean): Promise<boolean> {
  const { data: ag } = await supabaseAdmin.from('agenda')
    .select('id, data_inicio, aviso_cliente_inicio, aviso_cliente_seq, solicitacao_id, oficina:oficinas(nome_fantasia, endereco, cidade, pais)')
    .eq('id', agendaId).maybeSingle();
  if (!ag?.solicitacao_id) return false;
  const { data: sol } = await supabaseAdmin.from('solicitacoes')
    .select('numero, cliente:profiles!solicitacoes_cliente_id_fkey(nome, email, idioma)')
    .eq('id', ag.solicitacao_id).maybeSingle();
  const cliente = (sol as any)?.cliente;
  if (!sol || !cliente?.email) return false;
  const idioma = idiomaDoSite(cliente.idioma);
  const x = TXT[idioma] || TXT.en;
  const of = (ag as any).oficina || {};
  const fuso = fusoDoPais(of.pais || 'EE');
  const loc = LOCALE_DATA[idioma] || 'en-GB';
  const inicio = new Date(ag.data_inicio);
  const quando = inicio.toLocaleString(loc, { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const nomeOf = of.nome_fantasia || 'BipFix';
  const link = `${SITE_URL.replace('://www.', '://')}/r/${(sol as any).numero}`;
  const anexos = [];
  if (ag.aviso_cliente_inicio) {
    const seq = (ag.aviso_cliente_seq || 0) + 1;
    await supabaseAdmin.from('agenda').update({ aviso_cliente_seq: seq }).eq('id', ag.id);
    const titulo = x.evento.replace('{oficina}', nomeOf);
    anexos.push({ nome: 'bipfix-agendamento.ics', tipo: 'text/calendar; charset=utf-8; method=CANCEL', conteudo: montarIcs({
      cancelar: true, uid: `agenda-${ag.id}@bipfix.com`, seq, inicio, fim: new Date(inicio.getTime() + 3600e3), titulo,
      local: [of.endereco, of.cidade].filter(Boolean).join(', '), descricao: motivo, url: link,
      nomeCliente: cliente.nome || '', emailCliente: cliente.email, lembrete1: titulo, lembrete2: titulo,
    }) });
  }
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e40af;color:white;padding:24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:24px;">BipFix</h1></div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>${x.ola.replace('{n}', () => escapeHtml(cliente.nome || ''))}</p>
        <p style="font-size:16px;"><strong>${escapeHtml(x.introCanc.replace('{quando}', quando))}</strong></p>
        <p style="background:#fffbeb;border-left:4px solid #f59e0b;padding:10px 12px;"><strong>${escapeHtml(x.motivo)}:</strong> ${escapeHtml(motivo)}</p>
        ${reaberto ? `<p>${escapeHtml(x.reaberto)}</p>` : ''}
        <p><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1e40af;color:#ffffff;text-decoration:none;font-weight:bold;">${escapeHtml(x.verPedido)}</a></p>
        ${anexos.length ? `<p style="font-size:13px;color:#6b7280;">📅 ${escapeHtml(x.anexoCanc)}</p>` : ''}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#9ca3af;">${escapeHtml(x.rodape)}</p>
      </div>
    </div>`;
  return enviarEmail({ para: cliente.email, assunto: x.assuntoCanc.replace('{oficina}', nomeOf), html, anexos });
}
