import { idiomaDoSite } from './site-url';

// Pedido de novas datas (migracao 079, dono 11/11): avisos no app/site, linhas do chat e e-mails.
// {carro} marca+modelo, {oficina} nome da oficina, {datas} lista de datas, {quando} data/hora no
// fuso da oficina, {numero} numero do pedido, {n} nome de quem recebe.
// Texto ao motorista: sem promessa de preco ou prazo.
type N = {
  pedidoTitulo: string; pedidoMsg: string; pedidoMsgSemSugestao: string;
  lembreteTitulo: string; lembreteMsg: string;
  fechouOutraTitulo: string; fechouOutraMsg: string;
  enviadasTitulo: string; enviadasMsg: string;
  confirmadaTitulo: string; confirmadaMsg: string;
  chatPedido: string; chatSugestoes: string; chatEnviadas: string; chatConfirmada: string;
  emailOla: string; emailPedidoAssunto: string; emailPedidoTexto: string; emailSugestoes: string; emailMensagem: string; emailPedidoBotao: string;
  emailEnviadasAssunto: string; emailEnviadasTexto: string; emailEnviadasBotao: string;
};
const NX: Record<string, N> = {
  pt: {
    pedidoTitulo: 'O cliente pediu novas datas', pedidoMsg: '{carro}: as datas do seu orçamento já passaram e o cliente tem interesse. Confirme uma das datas sugeridas ou mande outras.', pedidoMsgSemSugestao: '{carro}: as datas do seu orçamento já passaram e o cliente tem interesse. Mande novas datas.',
    lembreteTitulo: 'O cliente ainda espera novas datas', lembreteMsg: '{carro}: o pedido de novas datas está sem resposta há 24 h. Confirme uma data ou mande outras.',
    fechouOutraTitulo: 'Pedido de novas datas encerrado', fechouOutraMsg: '{carro}: o cliente fechou com outra oficina. Não precisa responder ao pedido de novas datas.',
    enviadasTitulo: 'Novas datas da oficina', enviadasMsg: '{oficina} mandou novas datas: {datas}. Abra o pedido e escolha a que serve para você.',
    confirmadaTitulo: 'Agendamento confirmado', confirmadaMsg: '{oficina} confirmou a sua data: {quando}.',
    chatPedido: '📅 Tenho interesse no orçamento, mas as datas já passaram. Pode mandar novas datas?', chatSugestoes: 'Datas que me servem: {datas}', chatEnviadas: '📅 Novas datas para levar o carro: {datas}', chatConfirmada: '✅ Data confirmada: {quando}. O agendamento está feito.',
    emailOla: 'Olá, {n}!', emailPedidoAssunto: 'O cliente pediu novas datas – pedido nº {numero}', emailPedidoTexto: 'O cliente do pedido nº {numero} ({carro}) tem interesse no seu orçamento, mas as datas oferecidas já passaram.', emailSugestoes: 'Datas sugeridas pelo cliente', emailMensagem: 'Mensagem do cliente', emailPedidoBotao: 'Responder no pedido',
    emailEnviadasAssunto: '{oficina} mandou novas datas – pedido nº {numero}', emailEnviadasTexto: '{oficina} mandou novas datas para o seu pedido nº {numero}:', emailEnviadasBotao: 'Escolher a data',
  },
  'pt-PT': {
    pedidoTitulo: 'O cliente pediu novas datas', pedidoMsg: '{carro}: as datas do seu orçamento já passaram e o cliente tem interesse. Confirme uma das datas sugeridas ou envie outras.', pedidoMsgSemSugestao: '{carro}: as datas do seu orçamento já passaram e o cliente tem interesse. Envie novas datas.',
    lembreteTitulo: 'O cliente ainda aguarda novas datas', lembreteMsg: '{carro}: o pedido de novas datas está sem resposta há 24 h. Confirme uma data ou envie outras.',
    fechouOutraTitulo: 'Pedido de novas datas encerrado', fechouOutraMsg: '{carro}: o cliente escolheu outra oficina. Não precisa de responder ao pedido de novas datas.',
    enviadasTitulo: 'Novas datas da oficina', enviadasMsg: '{oficina} enviou novas datas: {datas}. Abra o pedido e escolha a que lhe convém.',
    confirmadaTitulo: 'Marcação confirmada', confirmadaMsg: '{oficina} confirmou a sua data: {quando}.',
    chatPedido: '📅 Tenho interesse no orçamento, mas as datas já passaram. Pode enviar novas datas?', chatSugestoes: 'Datas que me convêm: {datas}', chatEnviadas: '📅 Novas datas para levar o carro: {datas}', chatConfirmada: '✅ Data confirmada: {quando}. A marcação está feita.',
    emailOla: 'Olá, {n}!', emailPedidoAssunto: 'O cliente pediu novas datas – pedido n.º {numero}', emailPedidoTexto: 'O cliente do pedido n.º {numero} ({carro}) tem interesse no seu orçamento, mas as datas oferecidas já passaram.', emailSugestoes: 'Datas sugeridas pelo cliente', emailMensagem: 'Mensagem do cliente', emailPedidoBotao: 'Responder no pedido',
    emailEnviadasAssunto: '{oficina} enviou novas datas – pedido n.º {numero}', emailEnviadasTexto: '{oficina} enviou novas datas para o seu pedido n.º {numero}:', emailEnviadasBotao: 'Escolher a data',
  },
  en: {
    pedidoTitulo: 'The customer asked for new dates', pedidoMsg: '{carro}: the dates in your quote have passed and the customer is interested. Confirm one of the suggested dates or send others.', pedidoMsgSemSugestao: '{carro}: the dates in your quote have passed and the customer is interested. Send new dates.',
    lembreteTitulo: 'The customer is still waiting for new dates', lembreteMsg: '{carro}: the request for new dates has had no answer for 24 h. Confirm a date or send others.',
    fechouOutraTitulo: 'Request for new dates closed', fechouOutraMsg: '{carro}: the customer went with another repair shop. No need to answer the request for new dates.',
    enviadasTitulo: 'New dates from the repair shop', enviadasMsg: '{oficina} sent new dates: {datas}. Open the request and choose the one that suits you.',
    confirmadaTitulo: 'Booking confirmed', confirmadaMsg: '{oficina} confirmed your date: {quando}.',
    chatPedido: '📅 I’m interested in the quote, but the dates have passed. Could you send new dates?', chatSugestoes: 'Dates that suit me: {datas}', chatEnviadas: '📅 New dates to bring the car: {datas}', chatConfirmada: '✅ Date confirmed: {quando}. The booking is done.',
    emailOla: 'Hi {n},', emailPedidoAssunto: 'The customer asked for new dates – request no. {numero}', emailPedidoTexto: 'The customer of request no. {numero} ({carro}) is interested in your quote, but the dates you offered have passed.', emailSugestoes: 'Dates suggested by the customer', emailMensagem: 'Message from the customer', emailPedidoBotao: 'Answer in the request',
    emailEnviadasAssunto: '{oficina} sent new dates – request no. {numero}', emailEnviadasTexto: '{oficina} sent new dates for your request no. {numero}:', emailEnviadasBotao: 'Choose the date',
  },
  et: {
    pedidoTitulo: 'Klient küsib uusi aegu', pedidoMsg: '{carro}: sinu hinnapakkumise ajad on möödas, kuid klient on huvitatud. Kinnita üks pakutud aegadest või saada uued.', pedidoMsgSemSugestao: '{carro}: sinu hinnapakkumise ajad on möödas, kuid klient on huvitatud. Saada uued ajad.',
    lembreteTitulo: 'Klient ootab endiselt uusi aegu', lembreteMsg: '{carro}: uute aegade soovile pole 24 tunni jooksul vastatud. Kinnita aeg või saada uued.',
    fechouOutraTitulo: 'Uute aegade soov on lõppenud', fechouOutraMsg: '{carro}: klient valis teise töökoja. Uute aegade soovile pole vaja vastata.',
    enviadasTitulo: 'Töökoda saatis uued ajad', enviadasMsg: '{oficina} saatis uued ajad: {datas}. Ava päring ja vali sobiv.',
    confirmadaTitulo: 'Broneering kinnitatud', confirmadaMsg: '{oficina} kinnitas sinu aja: {quando}.',
    chatPedido: '📅 Olen hinnapakkumisest huvitatud, kuid ajad on möödas. Kas saate saata uued ajad?', chatSugestoes: 'Mulle sobivad: {datas}', chatEnviadas: '📅 Uued ajad auto toomiseks: {datas}', chatConfirmada: '✅ Aeg kinnitatud: {quando}. Broneering on tehtud.',
    emailOla: 'Tere, {n}!', emailPedidoAssunto: 'Klient küsib uusi aegu – päring nr {numero}', emailPedidoTexto: 'Päringu nr {numero} ({carro}) klient on sinu hinnapakkumisest huvitatud, kuid pakutud ajad on möödas.', emailSugestoes: 'Kliendi soovitud ajad', emailMensagem: 'Kliendi sõnum', emailPedidoBotao: 'Vasta päringus',
    emailEnviadasAssunto: '{oficina} saatis uued ajad – päring nr {numero}', emailEnviadasTexto: '{oficina} saatis sinu päringule nr {numero} uued ajad:', emailEnviadasBotao: 'Vali aeg',
  },
  ru: {
    pedidoTitulo: 'Клиент просит новые даты', pedidoMsg: '{carro}: даты в вашей смете уже прошли, но клиент заинтересован. Подтвердите одну из предложенных дат или отправьте другие.', pedidoMsgSemSugestao: '{carro}: даты в вашей смете уже прошли, но клиент заинтересован. Отправьте новые даты.',
    lembreteTitulo: 'Клиент всё ещё ждёт новые даты', lembreteMsg: '{carro}: на запрос новых дат нет ответа уже 24 часа. Подтвердите дату или отправьте другие.',
    fechouOutraTitulo: 'Запрос новых дат закрыт', fechouOutraMsg: '{carro}: клиент выбрал другой автосервис. Отвечать на запрос новых дат не нужно.',
    enviadasTitulo: 'Автосервис прислал новые даты', enviadasMsg: 'Автосервис «{oficina}» прислал новые даты: {datas}. Откройте заявку и выберите подходящую.',
    confirmadaTitulo: 'Запись подтверждена', confirmadaMsg: 'Автосервис «{oficina}» подтвердил вашу дату: {quando}.',
    chatPedido: '📅 Меня интересует смета, но даты уже прошли. Можете прислать новые даты?', chatSugestoes: 'Мне подходят: {datas}', chatEnviadas: '📅 Новые даты, когда можно привезти машину: {datas}', chatConfirmada: '✅ Дата подтверждена: {quando}. Запись сделана.',
    emailOla: 'Здравствуйте, {n}!', emailPedidoAssunto: 'Клиент просит новые даты – заявка № {numero}', emailPedidoTexto: 'Клиента по заявке № {numero} ({carro}) интересует ваша смета, но предложенные даты уже прошли.', emailSugestoes: 'Даты, предложенные клиентом', emailMensagem: 'Сообщение клиента', emailPedidoBotao: 'Ответить в заявке',
    emailEnviadasAssunto: 'Автосервис «{oficina}» прислал новые даты – заявка № {numero}', emailEnviadasTexto: 'Автосервис «{oficina}» прислал новые даты по вашей заявке № {numero}:', emailEnviadasBotao: 'Выбрать дату',
  },
  it: {
    pedidoTitulo: 'Il cliente chiede nuove date', pedidoMsg: '{carro}: le date del tuo preventivo sono passate, ma il cliente è interessato. Conferma una delle date suggerite o mandane altre.', pedidoMsgSemSugestao: '{carro}: le date del tuo preventivo sono passate, ma il cliente è interessato. Manda nuove date.',
    lembreteTitulo: 'Il cliente aspetta ancora nuove date', lembreteMsg: '{carro}: la richiesta di nuove date è senza risposta da 24 ore. Conferma una data o mandane altre.',
    fechouOutraTitulo: 'Richiesta di nuove date chiusa', fechouOutraMsg: '{carro}: il cliente ha scelto un’altra officina. Non serve rispondere alla richiesta di nuove date.',
    enviadasTitulo: 'Nuove date dall’officina', enviadasMsg: '{oficina} ha mandato nuove date: {datas}. Apri la richiesta e scegli quella che ti va bene.',
    confirmadaTitulo: 'Prenotazione confermata', confirmadaMsg: '{oficina} ha confermato la tua data: {quando}.',
    chatPedido: '📅 Mi interessa il preventivo, ma le date sono passate. Puoi mandare nuove date?', chatSugestoes: 'Date che mi vanno bene: {datas}', chatEnviadas: '📅 Nuove date per portare l’auto: {datas}', chatConfirmada: '✅ Data confermata: {quando}. La prenotazione è fatta.',
    emailOla: 'Ciao {n},', emailPedidoAssunto: 'Il cliente chiede nuove date – richiesta n. {numero}', emailPedidoTexto: 'Il cliente della richiesta n. {numero} ({carro}) è interessato al tuo preventivo, ma le date offerte sono passate.', emailSugestoes: 'Date suggerite dal cliente', emailMensagem: 'Messaggio del cliente', emailPedidoBotao: 'Rispondi nella richiesta',
    emailEnviadasAssunto: '{oficina} ha mandato nuove date – richiesta n. {numero}', emailEnviadasTexto: '{oficina} ha mandato nuove date per la tua richiesta n. {numero}:', emailEnviadasBotao: 'Scegli la data',
  },
};
export const textosNovasDatas = (idioma: string | null | undefined) => NX[idiomaDoSite(idioma)] || NX.en;

const LOC: Record<string, string> = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB', it: 'it-IT', 'pt-PT': 'pt-PT', pt: 'pt-BR' };
/** "ter., 18 de novembro, 08:00–12:00" no idioma de quem le (dia de calendario, sem fuso) */
export function diaETurno(data: string, turno: string, idioma: string | null | undefined): string {
  const dia = new Date(`${data}T12:00:00Z`).toLocaleDateString(LOC[idiomaDoSite(idioma)] || 'en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' });
  return `${dia}, ${turno === 'tarde' ? '13:00–17:00' : '08:00–12:00'}`;
}
export const listaDeDatas = (itens: { data: string; turno: string }[], idioma: string | null | undefined) => itens.map((s) => diaETurno(s.data, s.turno, idioma)).join('; ');
