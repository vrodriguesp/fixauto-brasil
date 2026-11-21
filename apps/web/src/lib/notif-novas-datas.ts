import { idiomaDoSite } from './site-url';
import { formatarJanela, janelaDoSlot, type Janela } from './turnos';

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
  // 114 (dono 21/11): "preciso de outra data" com as datas ainda validas, modo dias da semana, "nao posso", 72 h
  outraDataTitulo: string; outraDataMsg: string; outraDataMsgSemSugestao: string; emailOutraDataAssunto: string; emailOutraDataTexto: string;
  chatOutraData: string; chatPadrao: string; emailPadrao: string;
  manha: string; tarde: string; qualquerParte: string;
  naoPodeTitulo: string; naoPodeMsg: string; chatNaoPode: string; emailNaoPodeAssunto: string; emailNaoPodeTexto: string; emailNaoPodeBotao: string;
  semRespostaTitulo: string; semRespostaMsg: string; emailSemRespostaAssunto: string; emailSemRespostaTexto: string;
  oficinaSemRespostaTitulo: string; oficinaSemRespostaMsg: string;
  // 114: variantes para o pedido de 079 (as datas do orcamento JA passaram): sem dizer que as datas continuam valendo
  naoPodeMsgPassou: string; chatNaoPodePassou: string; semRespostaMsgPassou: string; oficinaSemRespostaMsgPassou: string;
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
    outraDataTitulo: 'O cliente precisa de outra data', outraDataMsg: '{carro}: nenhuma das datas do seu orçamento serve para o cliente. Veja o que serve para ele e mande 1 a 3 datas novas, ou responda que não pode.', outraDataMsgSemSugestao: '{carro}: nenhuma das datas do seu orçamento serve para o cliente. Mande 1 a 3 datas novas ou responda que não pode.', emailOutraDataAssunto: 'O cliente precisa de outra data – pedido nº {numero}', emailOutraDataTexto: 'O cliente do pedido nº {numero} ({carro}) tem interesse no seu orçamento, mas precisa de outra data para levar o carro.',
    chatOutraData: '📅 Tenho interesse no orçamento, mas preciso de outra data. Pode mandar outras datas?', chatPadrao: 'O que serve para mim: {padrao}', emailPadrao: 'O que serve para o cliente',
    manha: 'de manhã', tarde: 'à tarde', qualquerParte: 'qualquer hora',
    naoPodeTitulo: 'A oficina não pode na data pedida', naoPodeMsg: '{oficina} não consegue na data que você pediu. As datas do orçamento continuam valendo: você pode aceitar uma delas ou escolher outra oficina.', chatNaoPode: '📅 Não consigo na data pedida. As datas do orçamento continuam valendo.', emailNaoPodeAssunto: '{oficina} não pode na data pedida – pedido nº {numero}', emailNaoPodeTexto: '{oficina} não consegue na data que você pediu para o pedido nº {numero}. As datas do orçamento continuam valendo: você pode aceitar uma delas ou escolher outra oficina.', emailNaoPodeBotao: 'Ver o orçamento',
    semRespostaTitulo: 'A oficina não respondeu', semRespostaMsg: '{oficina} não respondeu ao seu pedido de outra data. Você ainda pode aceitar a data original ou escolher outra oficina.', emailSemRespostaAssunto: 'A oficina não respondeu – pedido nº {numero}', emailSemRespostaTexto: '{oficina} não respondeu ao seu pedido de outra data para o pedido nº {numero}. Você ainda pode aceitar a data original ou escolher outra oficina.',
    oficinaSemRespostaTitulo: 'Pedido de outra data encerrado', oficinaSemRespostaMsg: '{carro}: o pedido de outra data ficou 72 h sem resposta e foi encerrado. O cliente pode aceitar a data original ou escolher outra oficina.',
    naoPodeMsgPassou: '{oficina} não consegue na data que você pediu. Você pode pedir outra data ou escolher outra oficina.', chatNaoPodePassou: '📅 Não consigo na data pedida.', semRespostaMsgPassou: '{oficina} não respondeu ao seu pedido de novas datas. Você pode pedir de novo ou escolher outra oficina.', oficinaSemRespostaMsgPassou: '{carro}: o pedido de novas datas ficou 72 h sem resposta e foi encerrado. O cliente pode pedir de novo ou escolher outra oficina.',
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
    outraDataTitulo: 'O cliente precisa de outra data', outraDataMsg: '{carro}: nenhuma das datas do seu orçamento convém ao cliente. Veja o que lhe convém e envie 1 a 3 datas novas, ou responda que não pode.', outraDataMsgSemSugestao: '{carro}: nenhuma das datas do seu orçamento convém ao cliente. Envie 1 a 3 datas novas ou responda que não pode.', emailOutraDataAssunto: 'O cliente precisa de outra data – pedido n.º {numero}', emailOutraDataTexto: 'O cliente do pedido n.º {numero} ({carro}) tem interesse no seu orçamento, mas precisa de outra data para levar o carro.',
    chatOutraData: '📅 Tenho interesse no orçamento, mas preciso de outra data. Pode enviar outras datas?', chatPadrao: 'O que me convém: {padrao}', emailPadrao: 'O que convém ao cliente',
    manha: 'de manhã', tarde: 'à tarde', qualquerParte: 'qualquer hora',
    naoPodeTitulo: 'A oficina não pode na data pedida', naoPodeMsg: '{oficina} não consegue na data que pediu. As datas do orçamento continuam válidas: pode aceitar uma delas ou escolher outra oficina.', chatNaoPode: '📅 Não consigo na data pedida. As datas do orçamento continuam válidas.', emailNaoPodeAssunto: '{oficina} não pode na data pedida – pedido n.º {numero}', emailNaoPodeTexto: '{oficina} não consegue na data que pediu para o pedido n.º {numero}. As datas do orçamento continuam válidas: pode aceitar uma delas ou escolher outra oficina.', emailNaoPodeBotao: 'Ver o orçamento',
    semRespostaTitulo: 'A oficina não respondeu', semRespostaMsg: '{oficina} não respondeu ao seu pedido de outra data. Ainda pode aceitar a data original ou escolher outra oficina.', emailSemRespostaAssunto: 'A oficina não respondeu – pedido n.º {numero}', emailSemRespostaTexto: '{oficina} não respondeu ao seu pedido de outra data para o pedido n.º {numero}. Ainda pode aceitar a data original ou escolher outra oficina.',
    oficinaSemRespostaTitulo: 'Pedido de outra data encerrado', oficinaSemRespostaMsg: '{carro}: o pedido de outra data ficou 72 h sem resposta e foi encerrado. O cliente pode aceitar a data original ou escolher outra oficina.',
    naoPodeMsgPassou: '{oficina} não consegue na data que pediu. Pode pedir outra data ou escolher outra oficina.', chatNaoPodePassou: '📅 Não consigo na data pedida.', semRespostaMsgPassou: '{oficina} não respondeu ao seu pedido de novas datas. Pode pedir de novo ou escolher outra oficina.', oficinaSemRespostaMsgPassou: '{carro}: o pedido de novas datas ficou 72 h sem resposta e foi encerrado. O cliente pode pedir de novo ou escolher outra oficina.',
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
    outraDataTitulo: 'The customer needs another date', outraDataMsg: '{carro}: none of the dates in your quote suits the customer. See what suits them and send 1 to 3 new dates, or answer that you cannot.', outraDataMsgSemSugestao: '{carro}: none of the dates in your quote suits the customer. Send 1 to 3 new dates or answer that you cannot.', emailOutraDataAssunto: 'The customer needs another date – request no. {numero}', emailOutraDataTexto: 'The customer of request no. {numero} ({carro}) is interested in your quote, but needs another date to bring the car.',
    chatOutraData: '📅 I’m interested in the quote, but I need another date. Could you send other dates?', chatPadrao: 'What suits me: {padrao}', emailPadrao: 'What suits the customer',
    manha: 'in the morning', tarde: 'in the afternoon', qualquerParte: 'any time',
    naoPodeTitulo: 'The repair shop cannot make the requested date', naoPodeMsg: '{oficina} cannot make the date you asked for. The dates in the quote still stand: you can accept one of them or choose another repair shop.', chatNaoPode: '📅 I cannot make the requested date. The dates in the quote still stand.', emailNaoPodeAssunto: '{oficina} cannot make the requested date – request no. {numero}', emailNaoPodeTexto: '{oficina} cannot make the date you asked for in request no. {numero}. The dates in the quote still stand: you can accept one of them or choose another repair shop.', emailNaoPodeBotao: 'See the quote',
    semRespostaTitulo: 'The repair shop did not answer', semRespostaMsg: '{oficina} did not answer your request for another date. You can still accept the original date or choose another repair shop.', emailSemRespostaAssunto: 'The repair shop did not answer – request no. {numero}', emailSemRespostaTexto: '{oficina} did not answer your request for another date in request no. {numero}. You can still accept the original date or choose another repair shop.',
    oficinaSemRespostaTitulo: 'Request for another date closed', oficinaSemRespostaMsg: '{carro}: the request for another date went 72 h without an answer and was closed. The customer can accept the original date or choose another repair shop.',
    naoPodeMsgPassou: '{oficina} cannot make the date you asked for. You can ask for another date or choose another repair shop.', chatNaoPodePassou: '📅 I cannot make the requested date.', semRespostaMsgPassou: '{oficina} did not answer your request for new dates. You can ask again or choose another repair shop.', oficinaSemRespostaMsgPassou: '{carro}: the request for new dates went 72 h without an answer and was closed. The customer can ask again or choose another repair shop.',
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
    outraDataTitulo: 'Klient vajab teist aega', outraDataMsg: '{carro}: ükski sinu hinnapakkumise aeg kliendile ei sobi. Vaata, mis talle sobib, ja saada 1–3 uut aega või vasta, et ei saa.', outraDataMsgSemSugestao: '{carro}: ükski sinu hinnapakkumise aeg kliendile ei sobi. Saada 1–3 uut aega või vasta, et ei saa.', emailOutraDataAssunto: 'Klient vajab teist aega – päring nr {numero}', emailOutraDataTexto: 'Päringu nr {numero} ({carro}) klient on sinu hinnapakkumisest huvitatud, kuid vajab auto toomiseks teist aega.',
    chatOutraData: '📅 Olen hinnapakkumisest huvitatud, kuid vajan teist aega. Kas saate saata teised ajad?', chatPadrao: 'Mulle sobib: {padrao}', emailPadrao: 'Mis kliendile sobib',
    manha: 'hommikul', tarde: 'pärastlõunal', qualquerParte: 'ükskõik mis kell',
    naoPodeTitulo: 'Töökoda ei saa soovitud ajal', naoPodeMsg: '{oficina} ei saa sinu soovitud ajal. Hinnapakkumise ajad kehtivad edasi: võid valida ühe neist või teise töökoja.', chatNaoPode: '📅 Soovitud ajal ma kahjuks ei saa. Hinnapakkumise ajad kehtivad edasi.', emailNaoPodeAssunto: '{oficina} ei saa soovitud ajal – päring nr {numero}', emailNaoPodeTexto: '{oficina} ei saa päringu nr {numero} puhul sinu soovitud ajal. Hinnapakkumise ajad kehtivad edasi: võid valida ühe neist või teise töökoja.', emailNaoPodeBotao: 'Vaata hinnapakkumist',
    semRespostaTitulo: 'Töökoda ei vastanud', semRespostaMsg: '{oficina} ei vastanud sinu soovile saada teine aeg. Võid endiselt valida algse aja või teise töökoja.', emailSemRespostaAssunto: 'Töökoda ei vastanud – päring nr {numero}', emailSemRespostaTexto: '{oficina} ei vastanud päringu nr {numero} puhul sinu soovile saada teine aeg. Võid endiselt valida algse aja või teise töökoja.',
    oficinaSemRespostaTitulo: 'Teise aja soov on lõppenud', oficinaSemRespostaMsg: '{carro}: teise aja soov jäi 72 tunniks vastuseta ja lõpetati. Klient võib valida algse aja või teise töökoja.',
    naoPodeMsgPassou: '{oficina} ei saa sinu soovitud ajal. Võid küsida teist aega või valida teise töökoja.', chatNaoPodePassou: '📅 Soovitud ajal ma kahjuks ei saa.', semRespostaMsgPassou: '{oficina} ei vastanud sinu soovile saada uued ajad. Võid uuesti küsida või valida teise töökoja.', oficinaSemRespostaMsgPassou: '{carro}: uute aegade soov jäi 72 tunniks vastuseta ja lõpetati. Klient võib uuesti küsida või valida teise töökoja.',
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
    outraDataTitulo: 'Клиенту нужна другая дата', outraDataMsg: '{carro}: ни одна из дат в вашей смете клиенту не подходит. Посмотрите, что ему подходит, и отправьте 1–3 новые даты или ответьте, что не можете.', outraDataMsgSemSugestao: '{carro}: ни одна из дат в вашей смете клиенту не подходит. Отправьте 1–3 новые даты или ответьте, что не можете.', emailOutraDataAssunto: 'Клиенту нужна другая дата – заявка № {numero}', emailOutraDataTexto: 'Клиента по заявке № {numero} ({carro}) интересует ваша смета, но ему нужна другая дата, чтобы привезти машину.',
    chatOutraData: '📅 Меня интересует смета, но мне нужна другая дата. Можете прислать другие даты?', chatPadrao: 'Мне подходит: {padrao}', emailPadrao: 'Что подходит клиенту',
    manha: 'утром', tarde: 'после обеда', qualquerParte: 'в любое время',
    naoPodeTitulo: 'Автосервис не может в указанную дату', naoPodeMsg: 'Автосервис «{oficina}» не может в дату, которую вы просили. Даты из сметы остаются в силе: вы можете выбрать одну из них или другой автосервис.', chatNaoPode: '📅 В указанную дату, к сожалению, не могу. Даты из сметы остаются в силе.', emailNaoPodeAssunto: 'Автосервис «{oficina}» не может в указанную дату – заявка № {numero}', emailNaoPodeTexto: 'Автосервис «{oficina}» не может в дату, которую вы просили по заявке № {numero}. Даты из сметы остаются в силе: вы можете выбрать одну из них или другой автосервис.', emailNaoPodeBotao: 'Посмотреть смету',
    semRespostaTitulo: 'Автосервис не ответил', semRespostaMsg: 'Автосервис «{oficina}» не ответил на вашу просьбу о другой дате. Вы по-прежнему можете выбрать исходную дату или другой автосервис.', emailSemRespostaAssunto: 'Автосервис не ответил – заявка № {numero}', emailSemRespostaTexto: 'Автосервис «{oficina}» не ответил на вашу просьбу о другой дате по заявке № {numero}. Вы по-прежнему можете выбрать исходную дату или другой автосервис.',
    oficinaSemRespostaTitulo: 'Запрос другой даты закрыт', oficinaSemRespostaMsg: '{carro}: запрос другой даты остался без ответа 72 часа и был закрыт. Клиент может выбрать исходную дату или другой автосервис.',
    naoPodeMsgPassou: 'Автосервис «{oficina}» не может в дату, которую вы просили. Вы можете попросить другую дату или выбрать другой автосервис.', chatNaoPodePassou: '📅 В указанную дату, к сожалению, не могу.', semRespostaMsgPassou: 'Автосервис «{oficina}» не ответил на вашу просьбу о новых датах. Вы можете попросить снова или выбрать другой автосервис.', oficinaSemRespostaMsgPassou: '{carro}: запрос новых дат остался без ответа 72 часа и был закрыт. Клиент может попросить снова или выбрать другой автосервис.',
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
    outraDataTitulo: 'Il cliente ha bisogno di un’altra data', outraDataMsg: '{carro}: nessuna delle date del tuo preventivo va bene al cliente. Guarda cosa gli va bene e manda da 1 a 3 date nuove, oppure rispondi che non puoi.', outraDataMsgSemSugestao: '{carro}: nessuna delle date del tuo preventivo va bene al cliente. Manda da 1 a 3 date nuove oppure rispondi che non puoi.', emailOutraDataAssunto: 'Il cliente ha bisogno di un’altra data – richiesta n. {numero}', emailOutraDataTexto: 'Il cliente della richiesta n. {numero} ({carro}) è interessato al tuo preventivo, ma ha bisogno di un’altra data per portare l’auto.',
    chatOutraData: '📅 Mi interessa il preventivo, ma ho bisogno di un’altra data. Puoi mandare altre date?', chatPadrao: 'Cosa mi va bene: {padrao}', emailPadrao: 'Cosa va bene al cliente',
    manha: 'di mattina', tarde: 'di pomeriggio', qualquerParte: 'a qualsiasi ora',
    naoPodeTitulo: 'L’officina non può nella data richiesta', naoPodeMsg: '{oficina} non può nella data che hai chiesto. Le date del preventivo restano valide: puoi accettarne una o scegliere un’altra officina.', chatNaoPode: '📅 Nella data richiesta non posso. Le date del preventivo restano valide.', emailNaoPodeAssunto: '{oficina} non può nella data richiesta – richiesta n. {numero}', emailNaoPodeTexto: '{oficina} non può nella data che hai chiesto per la richiesta n. {numero}. Le date del preventivo restano valide: puoi accettarne una o scegliere un’altra officina.', emailNaoPodeBotao: 'Vedi il preventivo',
    semRespostaTitulo: 'L’officina non ha risposto', semRespostaMsg: '{oficina} non ha risposto alla tua richiesta di un’altra data. Puoi ancora accettare la data originale o scegliere un’altra officina.', emailSemRespostaAssunto: 'L’officina non ha risposto – richiesta n. {numero}', emailSemRespostaTexto: '{oficina} non ha risposto alla tua richiesta di un’altra data per la richiesta n. {numero}. Puoi ancora accettare la data originale o scegliere un’altra officina.',
    oficinaSemRespostaTitulo: 'Richiesta di un’altra data chiusa', oficinaSemRespostaMsg: '{carro}: la richiesta di un’altra data è rimasta 72 ore senza risposta ed è stata chiusa. Il cliente può accettare la data originale o scegliere un’altra officina.',
    naoPodeMsgPassou: '{oficina} non può nella data che hai chiesto. Puoi chiedere un’altra data o scegliere un’altra officina.', chatNaoPodePassou: '📅 Nella data richiesta non posso.', semRespostaMsgPassou: '{oficina} non ha risposto alla tua richiesta di nuove date. Puoi chiedere di nuovo o scegliere un’altra officina.', oficinaSemRespostaMsgPassou: '{carro}: la richiesta di nuove date è rimasta 72 ore senza risposta ed è stata chiusa. Il cliente può chiedere di nuovo o scegliere un’altra officina.',
  },
};
export const textosNovasDatas = (idioma: string | null | undefined) => NX[idiomaDoSite(idioma)] || NX.en;

const LOC: Record<string, string> = { et: 'et-EE', ru: 'ru-RU', en: 'en-GB', it: 'it-IT', 'pt-PT': 'pt-PT', pt: 'pt-BR' };
/** "ter., 18 de novembro, 08:00–10:00" no idioma de quem le (dia de calendario, sem fuso). A janela vem do
 *  horario gravado (hora_inicio/hora_fim) ou, para sugestao do motorista, da regra 2.13; sem janela = legado. */
export function diaETurno(data: string, turno: string, idioma: string | null | undefined, janela?: Janela | null): string {
  const dia = new Date(`${data}T12:00:00Z`).toLocaleDateString(LOC[idiomaDoSite(idioma)] || 'en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'long' });
  return `${dia}, ${formatarJanela(janela || janelaDoSlot({ turno }))}`;
}
export const listaDeDatas = (itens: { data: string; turno: string; janela?: Janela | null }[], idioma: string | null | undefined) => itens.map((s) => diaETurno(s.data, s.turno, idioma, s.janela)).join('; ');

/** 114: "seg, ter, sex · de manhã" - dias da semana (1 = segunda ... 6 = sabado) x parte do dia, na lingua de quem le */
export type Padrao = { dias: number[]; partes: string[] };
export function textoPadrao(p: Padrao | null | undefined, idioma: string | null | undefined): string {
  if (!p) return '';
  const loc = LOC[idiomaDoSite(idioma)] || 'en-GB';
  const t = textosNovasDatas(idioma);
  // 2026-11-02 e uma segunda-feira (dia de calendario, sem fuso)
  const dias = (p.dias || []).filter((d) => d >= 1 && d <= 6).sort((a, b) => a - b)
    .map((d) => new Date(Date.UTC(2026, 10, 1 + d, 12)).toLocaleDateString(loc, { timeZone: 'UTC', weekday: 'short' }).replace(/\.$/, ''));
  const partes = (p.partes || []).filter((x) => x === 'manha' || x === 'tarde');
  const parte = partes.length === 1 ? t[partes[0] as 'manha' | 'tarde'] : t.qualquerParte;
  return [dias.join(', '), parte].filter(Boolean).join(' · ');
}
