// Strings de notificacao IN-APP (tabela `notificacoes`) por idioma do
// DESTINATARIO (profiles.idioma) - mesma logica dos e-mails
// (lib/email-i18n.ts), mas pro texto salvo em `notificacoes.titulo`/
// `mensagem`. Cobre so os tipos de notificacao ja migrados pra esse
// padrao; a maioria dos ~27 pontos que inserem em `notificacoes` ainda
// grava texto fixo em portugues (ver docs/PROGRESSO - pendencia
// conhecida, nao coberta nesta leva).
import { resolveEmailLocale, fmt, type EmailLocale } from './email-i18n';

const novaSolicitacaoColisao: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Nova solicitação!', mensagem: 'Emergência - Novo pedido de reparo por colisão na sua região.' },
  en: { titulo: 'New request!', mensagem: 'Emergency - New collision repair request in your area.' },
  et: { titulo: 'Uus päring!', mensagem: 'Hädaolukord - Uus kokkupõrke remondipäring sinu piirkonnas.' },
  it: { titulo: 'Nuova richiesta!', mensagem: 'Emergenza - Nuova richiesta di riparazione per collisione nella tua zona.' },
  'pt-PT': { titulo: 'Novo pedido!', mensagem: 'Emergência - Novo pedido de reparação por colisão na sua zona.' },
  ru: { titulo: 'Новая заявка!', mensagem: 'Срочно - новая заявка на ремонт после ДТП в вашем районе.' },
};

export function notifNovaSolicitacaoColisao(locale: string | null | undefined) {
  return novaSolicitacaoColisao[resolveEmailLocale(locale)];
}

const novaSolicitacaoTitulo: Record<EmailLocale, string> = {
  pt: 'Nova solicitação!',
  en: 'New request!',
  et: 'Uus päring!',
  it: 'Nuova richiesta!',
  'pt-PT': 'Novo pedido!',
  ru: 'Новая заявка!',
};

export function notifNovaSolicitacaoTitulo(locale: string | null | undefined) {
  return novaSolicitacaoTitulo[resolveEmailLocale(locale)];
}

const cotacaoPecaRespondida: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Nova resposta de cotação de peça', mensagem: '{fornecedorNome} respondeu sua cotação de "{pecaDescricao}"' },
  en: { titulo: 'New part quote response', mensagem: '{fornecedorNome} responded to your quote request for "{pecaDescricao}"' },
  et: { titulo: 'Uus vastus varuosa hinnapäringule', mensagem: '{fornecedorNome} vastas sinu hinnapäringule "{pecaDescricao}"' },
  it: { titulo: 'Nuova risposta al preventivo ricambio', mensagem: '{fornecedorNome} ha risposto alla tua richiesta per "{pecaDescricao}"' },
  'pt-PT': { titulo: 'Nova resposta à cotação de peça', mensagem: '{fornecedorNome} respondeu à sua cotação de "{pecaDescricao}"' },
  ru: { titulo: 'Новый ответ на запрос запчасти', mensagem: '{fornecedorNome} ответил на ваш запрос «{pecaDescricao}»' },
};

export function notifCotacaoPecaRespondida(locale: string | null | undefined, fornecedorNome: string, pecaDescricao: string) {
  const s = cotacaoPecaRespondida[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { fornecedorNome, pecaDescricao }) };
}

const pedidoPecaEntregue: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Peça entregue', mensagem: '{fornecedorNome} marcou como entregue o pedido de "{pecaDescricao}"' },
  en: { titulo: 'Part delivered', mensagem: '{fornecedorNome} marked the order for "{pecaDescricao}" as delivered' },
  et: { titulo: 'Varuosa tarnitud', mensagem: '{fornecedorNome} märkis tellimuse "{pecaDescricao}" tarnituks' },
  it: { titulo: 'Ricambio consegnato', mensagem: '{fornecedorNome} ha segnato come consegnato l\'ordine per "{pecaDescricao}"' },
  'pt-PT': { titulo: 'Peça entregue', mensagem: '{fornecedorNome} marcou como entregue a encomenda de "{pecaDescricao}"' },
  ru: { titulo: 'Запчасть доставлена', mensagem: '{fornecedorNome} отметил заказ «{pecaDescricao}» как доставленный' },
};

const fornecedorSemNome: Record<EmailLocale, string> = { pt: 'O fornecedor', 'pt-PT': 'O fornecedor', en: 'The supplier', et: 'Tarnija', it: 'Il fornitore', ru: 'Поставщик' };

export function notifPedidoPecaEntregue(locale: string | null | undefined, fornecedorNome: string | undefined, pecaDescricao: string) {
  const l = resolveEmailLocale(locale);
  const s = pedidoPecaEntregue[l];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { fornecedorNome: fornecedorNome || fornecedorSemNome[l], pecaDescricao }) };
}

const cotacaoPecaDisponivel: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Oficina próxima precisa de uma peça', mensagem: 'Uma oficina perto de você abriu uma cotação de peça. Responda se tiver em estoque.' },
  en: { titulo: 'A nearby shop needs a part', mensagem: 'A repair shop near you opened a part request. Respond if you have it in stock.' },
  et: { titulo: 'Lähedal asuv töökoda vajab varuosa', mensagem: 'Sinu lähedal asuv töökoda avas varuosa hinnapäringu. Vasta, kui sul on see laos.' },
  it: { titulo: "Un'officina vicina ha bisogno di un ricambio", mensagem: "Un'officina vicino a te ha aperto una richiesta di ricambio. Rispondi se lo hai in magazzino." },
  'pt-PT': { titulo: 'Oficina próxima precisa de uma peça', mensagem: 'Uma oficina perto de si abriu uma cotação de peça. Responda se tiver em stock.' },
  ru: { titulo: 'Автосервису рядом нужна запчасть', mensagem: 'Автосервис рядом с вами открыл запрос запчасти. Ответьте, если она есть в наличии.' },
};

export function notifCotacaoPecaDisponivel(locale: string | null | undefined) {
  return cotacaoPecaDisponivel[resolveEmailLocale(locale)];
}

const novoOrcamento: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Novo orçamento recebido', mensagem: '{oficinaNome} enviou um orçamento de {valor}' },
  en: { titulo: 'New quote received', mensagem: '{oficinaNome} sent you a quote for {valor}' },
  et: { titulo: 'Uus hinnapakkumine saabus', mensagem: '{oficinaNome} saatis sulle hinnapakkumise {valor}' },
  it: { titulo: 'Nuovo preventivo ricevuto', mensagem: '{oficinaNome} ti ha inviato un preventivo di {valor}' },
  'pt-PT': { titulo: 'Novo orçamento recebido', mensagem: '{oficinaNome} enviou um orçamento de {valor}' },
  ru: { titulo: 'Новая смета', mensagem: '{oficinaNome} отправил смету на {valor}' },
};

export function notifNovoOrcamento(locale: string | null | undefined, oficinaNome: string, valor: string) {
  const s = novoOrcamento[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficinaNome, valor }) };
}

const orcamentoRevisado: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Orçamento revisado', mensagem: '{oficinaNome} revisou o orçamento para {valor}' },
  en: { titulo: 'Quote revised', mensagem: '{oficinaNome} revised the quote to {valor}' },
  et: { titulo: 'Hinnapakkumine muudetud', mensagem: '{oficinaNome} muutis hinnapakkumist: {valor}' },
  it: { titulo: 'Preventivo rivisto', mensagem: '{oficinaNome} ha rivisto il preventivo a {valor}' },
  'pt-PT': { titulo: 'Orçamento revisto', mensagem: '{oficinaNome} reviu o orçamento para {valor}' },
  ru: { titulo: 'Смета пересмотрена', mensagem: '{oficinaNome} изменил смету: {valor}' },
};

export function notifOrcamentoRevisado(locale: string | null | undefined, oficinaNome: string, valor: string) {
  const s = orcamentoRevisado[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficinaNome, valor }) };
}

const avaliacaoRecebida: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Nova avaliação: {stars}', mensagem: '{clienteNome} avaliou seu serviço{comentario}' },
  en: { titulo: 'New review: {stars}', mensagem: '{clienteNome} rated your service{comentario}' },
  et: { titulo: 'Uus hinnang: {stars}', mensagem: '{clienteNome} hindas sinu teenust{comentario}' },
  it: { titulo: 'Nuova recensione: {stars}', mensagem: '{clienteNome} ha valutato il tuo servizio{comentario}' },
  'pt-PT': { titulo: 'Nova avaliação: {stars}', mensagem: '{clienteNome} avaliou o seu serviço{comentario}' },
  ru: { titulo: 'Новый отзыв: {stars}', mensagem: '{clienteNome} оценил(а) вашу работу{comentario}' },
};

export function notifAvaliacaoRecebida(locale: string | null | undefined, stars: string, clienteNome: string, comentario: string) {
  const s = avaliacaoRecebida[resolveEmailLocale(locale)];
  return { titulo: fmt(s.titulo, { stars }), mensagem: fmt(s.mensagem, { clienteNome, comentario }) };
}

const notaInterna: Record<EmailLocale, { titulo: string }> = {
  pt: { titulo: 'Nova nota interna' },
  en: { titulo: 'New internal note' },
  et: { titulo: 'Uus sisemärkus' },
  it: { titulo: 'Nuova nota interna' },
  'pt-PT': { titulo: 'Nova nota interna' },
  ru: { titulo: 'Новая внутренняя заметка' },
};

export function notifNotaInterna(locale: string | null | undefined) {
  return notaInterna[resolveEmailLocale(locale)];
}

const orcamentoAceito: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Orçamento aceito!', mensagem: 'Um cliente aceitou seu orçamento e agendou o serviço.' },
  en: { titulo: 'Quote accepted!', mensagem: 'A customer accepted your quote and scheduled the service.' },
  et: { titulo: 'Hinnapakkumine kinnitatud!', mensagem: 'Klient kinnitas sinu hinnapakkumise ja broneeris teenuse.' },
  it: { titulo: 'Preventivo accettato!', mensagem: 'Un cliente ha accettato il tuo preventivo e prenotato il servizio.' },
  'pt-PT': { titulo: 'Orçamento aceite!', mensagem: 'Um cliente aceitou o seu orçamento e marcou o serviço.' },
  ru: { titulo: 'Смета принята!', mensagem: 'Клиент принял вашу смету и записался на ремонт.' },
};

export function notifOrcamentoAceito(locale: string | null | undefined) {
  return orcamentoAceito[resolveEmailLocale(locale)];
}

const reparoAgendado: Record<EmailLocale, string> = {
  pt: 'Reparo agendado',
  en: 'Repair scheduled',
  et: 'Remont broneeritud',
  it: 'Riparazione programmata',
  'pt-PT': 'Reparação marcada',
  ru: 'Ремонт запланирован',
};

export function notifReparoAgendadoTitulo(locale: string | null | undefined) {
  return reparoAgendado[resolveEmailLocale(locale)];
}

const orcamentoAceitoPagamento: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Orçamento aceito - pagamento', mensagem: 'O orçamento de {valor} foi aceito na oficina {oficinaNome}. Acesse para conversar com a oficina sobre o pagamento.' },
  en: { titulo: 'Quote accepted - payment', mensagem: 'The {valor} quote was accepted at {oficinaNome}. Open the app to discuss payment with the shop.' },
  et: { titulo: 'Hinnapakkumine kinnitatud - makse', mensagem: 'Hinnapakkumine {valor} kinnitati töökojas {oficinaNome}. Ava rakendus, et arutada makset töökojaga.' },
  it: { titulo: 'Preventivo accettato - pagamento', mensagem: 'Il preventivo di {valor} è stato accettato presso {oficinaNome}. Apri l\'app per discutere il pagamento con l\'officina.' },
  'pt-PT': { titulo: 'Orçamento aceite - pagamento', mensagem: 'O orçamento de {valor} foi aceite na oficina {oficinaNome}. Aceda para falar com a oficina sobre o pagamento.' },
  ru: { titulo: 'Смета принята - оплата', mensagem: 'Смета на {valor} принята в автосервисе {oficinaNome}. Откройте приложение, чтобы обсудить оплату с автосервисом.' },
};

export function notifOrcamentoAceitoPagamento(locale: string | null | undefined, valor: string, oficinaNome: string) {
  const s = orcamentoAceitoPagamento[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { valor, oficinaNome }) };
}

const servicoConcluido: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Serviço concluído!', mensagem: '{veiculoNome} foi entregue. Como foi? Avalie o serviço recebido!' },
  en: { titulo: 'Service completed!', mensagem: '{veiculoNome} has been handed back. How did it go? Rate the service you received!' },
  et: { titulo: 'Teenus valmis!', mensagem: '{veiculoNome} on üle antud. Kuidas läks? Hinda saadud teenust!' },
  it: { titulo: 'Servizio completato!', mensagem: "{veiculoNome} è stata consegnata. Com'è andata? Valuta il servizio ricevuto!" },
  'pt-PT': { titulo: 'Serviço concluído!', mensagem: '{veiculoNome} foi entregue. Como correu? Avalie o serviço recebido!' },
  ru: { titulo: 'Работы завершены!', mensagem: '{veiculoNome} выдан. Как всё прошло? Оцените полученную услугу!' },
};

export function notifServicoConcluido(locale: string | null | undefined, veiculoNome: string) {
  const s = servicoConcluido[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { veiculoNome }) };
}

const registroAcidente: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Registro de acidente', mensagem: '{nome} registrou um acidente envolvendo seu veículo (placa {placa}). Acesse para ver detalhes e orçamentos.' },
  en: { titulo: 'Accident report', mensagem: '{nome} reported an accident involving your vehicle (plate {placa}). Open the app to see details and quotes.' },
  et: { titulo: 'Õnnetuse registreering', mensagem: '{nome} registreeris õnnetuse, milles osales sinu sõiduk (reg.märk {placa}). Ava rakendus, et näha üksikasju ja hinnapakkumisi.' },
  it: { titulo: 'Registrazione incidente', mensagem: '{nome} ha registrato un incidente che coinvolge il tuo veicolo (targa {placa}). Apri l\'app per vedere dettagli e preventivi.' },
  'pt-PT': { titulo: 'Registo de acidente', mensagem: '{nome} registou um acidente que envolve o seu veículo (matrícula {placa}). Aceda para ver detalhes e orçamentos.' },
  ru: { titulo: 'Регистрация ДТП', mensagem: '{nome} зарегистрировал(а) ДТП с участием вашего автомобиля (госномер {placa}). Откройте приложение, чтобы увидеть детали и сметы.' },
};

export function notifRegistroAcidente(locale: string | null | undefined, nome: string, placa: string) {
  const s = registroAcidente[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { nome, placa: placa || 'N/A' }) };
}

const emergenciaAcidenteProximo: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Emergência - Acidente próximo', mensagem: 'Um motorista próximo à sua oficina acabou de sofrer um acidente e precisa de atendimento urgente. Envie um orçamento rápido!' },
  en: { titulo: 'Emergency - Nearby accident', mensagem: 'A driver near your shop just had an accident and needs urgent help. Send a quick quote!' },
  et: { titulo: 'Hädaolukord - Lähedal õnnetus', mensagem: 'Sinu töökoja lähedal juhtus just õnnetus ja juht vajab kiiret abi. Saada kiire hinnapakkumine!' },
  it: { titulo: 'Emergenza - Incidente vicino', mensagem: 'Un automobilista vicino alla tua officina ha appena avuto un incidente e ha bisogno di assistenza urgente. Invia un preventivo rapido!' },
  'pt-PT': { titulo: 'Emergência - Acidente próximo', mensagem: 'Um condutor perto da sua oficina acabou de sofrer um acidente e precisa de atendimento urgente. Envie um orçamento rápido!' },
  ru: { titulo: 'Срочно - ДТП рядом', mensagem: 'Водитель рядом с вашим автосервисом только что попал в ДТП и нуждается в срочной помощи. Отправьте быструю смету!' },
};

export function notifEmergenciaAcidenteProximo(locale: string | null | undefined) {
  return emergenciaAcidenteProximo[resolveEmailLocale(locale)];
}

// Mesmo texto usado pelo StatusBadge (messages/{locale}.json, namespace
// "constants.statusSolicitacao") - duplicado aqui porque rotas de API nao
// tem acesso pratico ao next-intl "client-side style" (so getTranslations
// com locale explicito, que exigiria refazer toda essa rota async); mantido
// em sincronia manualmente se os status mudarem.
const statusSolicitacaoLabel: Record<EmailLocale, Record<string, string>> = {
  pt: { aberta: 'Aberta', em_orcamento: 'Orçamento Enviado', aceita: 'Orçamento Aceito', em_andamento: 'Em Andamento', concluida: 'Concluída', cancelada: 'Cancelada' },
  en: { aberta: 'Open', em_orcamento: 'Quote Sent', aceita: 'Quote Accepted', em_andamento: 'In Progress', concluida: 'Completed', cancelada: 'Cancelled' },
  et: { aberta: 'Avatud', em_orcamento: 'Hinnapakkumine saadetud', aceita: 'Hinnapakkumine kinnitatud', em_andamento: 'Töös', concluida: 'Lõpetatud', cancelada: 'Tühistatud' },
  it: { aberta: 'Aperta', em_orcamento: 'Preventivo Inviato', aceita: 'Preventivo Accettato', em_andamento: 'In Corso', concluida: 'Completata', cancelada: 'Annullata' },
  'pt-PT': { aberta: 'Aberto', em_orcamento: 'Orçamento Enviado', aceita: 'Orçamento Aceite', em_andamento: 'Em Curso', concluida: 'Concluído', cancelada: 'Cancelado' },
  ru: { aberta: 'Открыта', em_orcamento: 'Смета отправлена', aceita: 'Смета принята', em_andamento: 'В работе', concluida: 'Завершена', cancelada: 'Отменена' },
};

export function statusSolicitacaoLabelFor(locale: string | null | undefined, status: string) {
  return statusSolicitacaoLabel[resolveEmailLocale(locale)][status] || status;
}

const statusSolicitacaoAtualizado: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Status da solicitação atualizado', mensagem: 'Nossa equipe atualizou o status da sua solicitação para: {label}.' },
  en: { titulo: 'Request status updated', mensagem: 'Our team updated your request status to: {label}.' },
  et: { titulo: 'Päringu staatus uuendatud', mensagem: 'Meie meeskond uuendas sinu päringu staatuse: {label}.' },
  it: { titulo: 'Stato della richiesta aggiornato', mensagem: 'Il nostro team ha aggiornato lo stato della tua richiesta a: {label}.' },
  'pt-PT': { titulo: 'Estado do pedido atualizado', mensagem: 'A nossa equipa atualizou o estado do seu pedido para: {label}.' },
  ru: { titulo: 'Статус заявки обновлён', mensagem: 'Наша команда изменила статус вашей заявки на: {label}.' },
};

export function notifStatusSolicitacaoAtualizado(locale: string | null | undefined, label: string) {
  const s = statusSolicitacaoAtualizado[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { label }) };
}

const clienteEsperandoOrcamento: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Cliente esperando orçamento', mensagem: 'A equipe BipFix identificou uma solicitação próxima ("{descricao}") ainda sem resposta. Que tal enviar um orçamento?' },
  en: { titulo: 'Customer waiting for a quote', mensagem: 'The BipFix team spotted a nearby request ("{descricao}") still without a reply. How about sending a quote?' },
  et: { titulo: 'Klient ootab hinnapakkumist', mensagem: 'BipFixi meeskond märkas lähedal päringut ("{descricao}"), millele pole veel vastatud. Kas saadaksid hinnapakkumise?' },
  it: { titulo: 'Cliente in attesa di preventivo', mensagem: 'Il team BipFix ha notato una richiesta vicina ("{descricao}") ancora senza risposta. Che ne dici di inviare un preventivo?' },
  'pt-PT': { titulo: 'Cliente à espera de orçamento', mensagem: 'A equipa BipFix identificou um pedido próximo ("{descricao}") ainda sem resposta. Que tal enviar um orçamento?' },
  ru: { titulo: 'Клиент ждёт смету', mensagem: 'Команда BipFix заметила заявку рядом с вами («{descricao}»), на которую пока нет ответа. Может, отправите смету?' },
};

export function notifClienteEsperandoOrcamento(locale: string | null | undefined, descricao: string) {
  const s = clienteEsperandoOrcamento[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { descricao }) };
}

const faltaRegistrada: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Falta registrada', mensagem: 'Você não compareceu ao agendamento para {veiculoNome}. O orçamento continua disponível para reagendamento.' },
  en: { titulo: 'No-show recorded', mensagem: 'You missed the appointment for {veiculoNome}. The quote is still available for rescheduling.' },
  et: { titulo: 'Puudumine registreeritud', mensagem: 'Sa ei ilmunud kohtumisele sõiduki {veiculoNome} osas. Hinnapakkumine on endiselt saadaval ümberplaneerimiseks.' },
  it: { titulo: 'Assenza registrata', mensagem: 'Non ti sei presentato all\'appuntamento per {veiculoNome}. Il preventivo resta disponibile per una nuova prenotazione.' },
  'pt-PT': { titulo: 'Falta registada', mensagem: 'Não compareceu à marcação para {veiculoNome}. O orçamento continua disponível para remarcar.' },
  ru: { titulo: 'Зафиксирована неявка', mensagem: 'Вы не пришли на запись по автомобилю {veiculoNome}. Смета по-прежнему доступна для переноса записи.' },
};

export function notifFaltaRegistrada(locale: string | null | undefined, veiculoNome: string) {
  const s = faltaRegistrada[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { veiculoNome }) };
}

const agendamentoCancelado: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Agendamento cancelado', mensagem: 'Nossa equipe cancelou o agendamento "{titulo}". Entre em contato caso precise reagendar.' },
  en: { titulo: 'Appointment cancelled', mensagem: 'Our team cancelled the appointment "{titulo}". Get in touch if you need to reschedule.' },
  et: { titulo: 'Kohtumine tühistatud', mensagem: 'Meie meeskond tühistas kohtumise "{titulo}". Võta ühendust, kui pead uue aja kokku leppima.' },
  it: { titulo: 'Appuntamento annullato', mensagem: 'Il nostro team ha annullato l\'appuntamento "{titulo}". Contattaci se hai bisogno di riprogrammare.' },
  'pt-PT': { titulo: 'Marcação cancelada', mensagem: 'A nossa equipa cancelou a marcação "{titulo}". Contacte-nos se precisar de remarcar.' },
  ru: { titulo: 'Запись отменена', mensagem: 'Наша команда отменила запись «{titulo}». Свяжитесь с нами, если нужно перенести.' },
};

export function notifAgendamentoCancelado(locale: string | null | undefined, titulo: string) {
  const s = agendamentoCancelado[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { titulo }) };
}

const novaMensagem: Record<EmailLocale, { titulo: string; tituloAudio: string; mensagemAudio: string }> = {
  pt: { titulo: 'Nova mensagem', tituloAudio: 'Nova mensagem de áudio', mensagemAudio: 'Mensagem de áudio recebida' },
  en: { titulo: 'New message', tituloAudio: 'New audio message', mensagemAudio: 'Audio message received' },
  et: { titulo: 'Uus sõnum', tituloAudio: 'Uus häälsõnum', mensagemAudio: 'Saabus häälsõnum' },
  it: { titulo: 'Nuovo messaggio', tituloAudio: 'Nuovo messaggio audio', mensagemAudio: 'Messaggio audio ricevuto' },
  'pt-PT': { titulo: 'Nova mensagem', tituloAudio: 'Nova mensagem de áudio', mensagemAudio: 'Mensagem de áudio recebida' },
  ru: { titulo: 'Новое сообщение', tituloAudio: 'Новое голосовое сообщение', mensagemAudio: 'Получено голосовое сообщение' },
};

export function notifNovaMensagem(locale: string | null | undefined) {
  return novaMensagem[resolveEmailLocale(locale)];
}

const orcamentoRecusado: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Orçamento recusado', mensagem: 'O cliente recusou o orçamento revisado. Por favor realize o check-out do veículo.' },
  en: { titulo: 'Quote declined', mensagem: 'The customer declined the revised quote. Please check the vehicle out.' },
  et: { titulo: 'Hinnapakkumine tagasi lükatud', mensagem: 'Klient lükkas muudetud hinnapakkumise tagasi. Palun vormista sõiduki üleandmine.' },
  it: { titulo: 'Preventivo rifiutato', mensagem: 'Il cliente ha rifiutato il preventivo rivisto. Effettua il check-out del veicolo.' },
  'pt-PT': { titulo: 'Orçamento recusado', mensagem: 'O cliente recusou o orçamento revisto. Por favor, faça o check-out do veículo.' },
  ru: { titulo: 'Смета отклонена', mensagem: 'Клиент отклонил пересмотренную смету. Пожалуйста, оформите выдачу автомобиля.' },
};

export function notifOrcamentoRecusado(locale: string | null | undefined) {
  return orcamentoRecusado[resolveEmailLocale(locale)];
}

const checkinManual: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Veículo registrado na oficina', mensagem: 'A oficina {oficina} registrou a entrada do seu veículo {marca} {modelo}.' },
  en: { titulo: 'Vehicle registered at the shop', mensagem: '{oficina} registered the arrival of your vehicle {marca} {modelo}.' },
  et: { titulo: 'Sõiduk registreeritud töökojas', mensagem: 'Töökoda {oficina} registreeris sinu sõiduki {marca} {modelo} saabumise.' },
  it: { titulo: 'Veicolo registrato in officina', mensagem: 'L\'officina {oficina} ha registrato l\'arrivo del tuo veicolo {marca} {modelo}.' },
  'pt-PT': { titulo: 'Veículo registado na oficina', mensagem: 'A oficina {oficina} registou a entrada do seu veículo {marca} {modelo}.' },
  ru: { titulo: 'Автомобиль принят в автосервисе', mensagem: 'Автосервис {oficina} зарегистрировал прибытие вашего автомобиля {marca} {modelo}.' },
};

export function notifCheckinManual(locale: string | null | undefined, vars: { oficina: string; marca: string; modelo: string }) {
  const s = checkinManual[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, vars) };
}

const pedidoConfirmado: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Pedido de peça confirmado!', mensagem: '{oficina} confirmou o pedido de "{peca}"' },
  en: { titulo: 'Parts order confirmed!', mensagem: '{oficina} confirmed the order for "{peca}"' },
  et: { titulo: 'Varuosa tellimus kinnitatud!', mensagem: '{oficina} kinnitas tellimuse "{peca}"' },
  it: { titulo: 'Ordine ricambio confermato!', mensagem: '{oficina} ha confermato l\'ordine di "{peca}"' },
  'pt-PT': { titulo: 'Encomenda de peças confirmada!', mensagem: '{oficina} confirmou a encomenda de "{peca}"' },
  ru: { titulo: 'Заказ запчасти подтверждён!', mensagem: '{oficina} подтвердил заказ «{peca}»' },
};

export function notifPedidoConfirmado(locale: string | null | undefined, oficina: string, peca: string) {
  const s = pedidoConfirmado[resolveEmailLocale(locale)];
  return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficina, peca }) };
}

// Mensagens de CHAT compartilhado entre cliente e oficina (tabelas
// `mensagens`/`emergencia_mensagens`) - diferente de notificacao/e-mail,
// nao tem um destinatario unico pra localizar por (as duas partes leem a
// mesma mensagem). Decisao do usuario: nao usar tradutor automatico aqui -
// assume-se que cliente e oficina se falam no idioma do pais onde a
// transacao acontece, entao essas mensagens usam o idioma da OFICINA
// (representa o mercado/local da transacao) em vez de portugues fixo.
const resumoOrcamentoAceitoChat: Record<EmailLocale, string> = {
  pt: 'O orçamento de {valor} foi aceito na oficina {oficinaNome}{placaTexto}. O reparo está agendado com prazo de {dias} dias.',
  en: 'The {valor} quote was accepted at {oficinaNome}{placaTexto}. The repair is scheduled with a {dias}-day timeline.',
  et: 'Hinnapakkumine {valor} kinnitati töökojas {oficinaNome}{placaTexto}. Remont on planeeritud tähtajaga {dias} päeva.',
  it: 'Il preventivo di {valor} è stato accettato presso {oficinaNome}{placaTexto}. La riparazione è programmata con un tempo di {dias} giorni.',
  'pt-PT': 'O orçamento de {valor} foi aceite na oficina {oficinaNome}{placaTexto}. A reparação está marcada com um prazo de {dias} dias.',
  ru: 'Смета на {valor} принята в автосервисе {oficinaNome}{placaTexto}. Ремонт запланирован со сроком {dias} дн.',
};
const resumoOrcamentoAceitoChatPlaca: Record<EmailLocale, string> = {
  pt: ' para o veículo placa {placa}',
  en: ' for the vehicle with plate {placa}',
  et: ' sõidukile registreerimismärgiga {placa}',
  it: ' per il veicolo targato {placa}',
  'pt-PT': ' para o veículo com a matrícula {placa}',
  ru: ' для автомобиля с госномером {placa}',
};

export function chatResumoOrcamentoAceito(locale: string | null | undefined, valor: string, oficinaNome: string, dias: number, placa?: string) {
  const l = resolveEmailLocale(locale);
  const placaTexto = placa ? fmt(resumoOrcamentoAceitoChatPlaca[l], { placa }) : '';
  return fmt(resumoOrcamentoAceitoChat[l], { valor, oficinaNome, dias, placaTexto });
}

const orcamentoAceitoNegociarPagamentoChat: Record<EmailLocale, string> = {
  pt: 'Orçamento aceito. Você pode negociar o pagamento diretamente com a oficina {oficinaNome}.',
  en: 'Quote accepted. You can arrange payment directly with {oficinaNome}.',
  et: 'Hinnapakkumine kinnitatud. Saad maksega töökojaga {oficinaNome} otse kokku leppida.',
  it: 'Preventivo accettato. Puoi concordare il pagamento direttamente con {oficinaNome}.',
  'pt-PT': 'Orçamento aceite. Pode negociar o pagamento diretamente com a oficina {oficinaNome}.',
  ru: 'Смета принята. Вы можете договориться об оплате напрямую с автосервисом {oficinaNome}.',
};

export function chatOrcamentoAceitoNegociarPagamento(locale: string | null | undefined, oficinaNome: string) {
  return fmt(orcamentoAceitoNegociarPagamentoChat[resolveEmailLocale(locale)], { oficinaNome });
}

const novoOrcamentoRecebidoChat: Record<EmailLocale, string> = {
  pt: 'Novo orçamento recebido: {valor} da oficina {oficinaNome}. Prazo: {dias} dias.',
  en: 'New quote received: {valor} from {oficinaNome}. Timeline: {dias} days.',
  et: 'Uus hinnapakkumine saabus: {valor} töökojalt {oficinaNome}. Tähtaeg: {dias} päeva.',
  it: 'Nuovo preventivo ricevuto: {valor} da {oficinaNome}. Tempi: {dias} giorni.',
  'pt-PT': 'Novo orçamento recebido: {valor} da oficina {oficinaNome}. Prazo: {dias} dias.',
  ru: 'Новая смета: {valor} от автосервиса {oficinaNome}. Срок: {dias} дн.',
};

export function chatNovoOrcamentoRecebido(locale: string | null | undefined, valor: string, oficinaNome: string, dias: number) {
  return fmt(novoOrcamentoRecebidoChat[resolveEmailLocale(locale)], { valor, oficinaNome, dias });
}

const orcamentoRevisadoChat: Record<EmailLocale, { revisado: string; valor: string; prazo: string }> = {
  pt: { revisado: 'Orçamento revisado (Revisão #{numero})', valor: 'Valor: {valor}', prazo: 'Prazo: {dias} dias' },
  en: { revisado: 'Quote revised (Revision #{numero})', valor: 'Amount: {valor}', prazo: 'Timeline: {dias} days' },
  et: { revisado: 'Hinnapakkumine muudetud (versioon #{numero})', valor: 'Summa: {valor}', prazo: 'Tähtaeg: {dias} päeva' },
  it: { revisado: 'Preventivo rivisto (Revisione #{numero})', valor: 'Importo: {valor}', prazo: 'Tempi: {dias} giorni' },
  'pt-PT': { revisado: 'Orçamento revisto (Revisão #{numero})', valor: 'Valor: {valor}', prazo: 'Prazo: {dias} dias' },
  ru: { revisado: 'Смета пересмотрена (версия #{numero})', valor: 'Сумма: {valor}', prazo: 'Срок: {dias} дн.' },
};

export function chatOrcamentoRevisado(locale: string | null | undefined, numero: number, valor: string, dias: number, observacoes: string) {
  const s = orcamentoRevisadoChat[resolveEmailLocale(locale)];
  const linhas = [
    `📋 ${fmt(s.revisado, { numero })}`,
    `💰 ${fmt(s.valor, { valor })}`,
    `📅 ${fmt(s.prazo, { dias })}`,
  ];
  if (observacoes) linhas.push(`📝 ${observacoes}`);
  return linhas.join('\n');
}

export { fmt };

// Correcao feita pelo admin (agendamento, etapa, orcamento, pedido...) -
// texto generico: o detalhe fica na tela do servico.
const correcaoSuporte: Record<EmailLocale, { titulo: string; mensagem: string }> = {
  pt: { titulo: 'Atualização feita pelo suporte', mensagem: 'A equipe BipFix corrigiu uma informação do seu serviço ({item}). Abra o serviço para ver os detalhes.' },
  en: { titulo: 'Updated by BipFix support', mensagem: 'The BipFix team corrected some information on your job ({item}). Open the job to see the details.' },
  et: { titulo: 'Tugi uuendas andmeid', mensagem: 'BipFixi meeskond parandas sinu töö andmeid ({item}). Ava töö, et näha üksikasju.' },
  it: { titulo: 'Aggiornamento dal supporto BipFix', mensagem: 'Il team BipFix ha corretto un dato del tuo lavoro ({item}). Apri il lavoro per vedere i dettagli.' },
  'pt-PT': { titulo: 'Atualização feita pelo suporte', mensagem: 'A equipa BipFix corrigiu uma informação do seu serviço ({item}). Abra o serviço para ver os detalhes.' },
  ru: { titulo: 'Исправление от поддержки', mensagem: 'Команда BipFix исправила данные вашей работы ({item}). Откройте работу, чтобы увидеть детали.' },
};

const itemCorrecao: Record<EmailLocale, Record<string, string>> = {
  pt: { agenda: 'agendamento', etapa: 'etapa do conserto', orcamento: 'orçamento', pedido_peca: 'pedido de peça', emergencia: 'registro do acidente' },
  en: { agenda: 'appointment', etapa: 'repair stage', orcamento: 'quote', pedido_peca: 'parts order', emergencia: 'accident report' },
  et: { agenda: 'broneering', etapa: 'remondi etapp', orcamento: 'hinnapakkumine', pedido_peca: 'varuosa tellimus', emergencia: 'õnnetuse registreerimine' },
  it: { agenda: 'appuntamento', etapa: 'fase della riparazione', orcamento: 'preventivo', pedido_peca: 'ordine di ricambi', emergencia: 'segnalazione di incidente' },
  'pt-PT': { agenda: 'marcação', etapa: 'etapa da reparação', orcamento: 'orçamento', pedido_peca: 'encomenda de peça', emergencia: 'registo do acidente' },
  ru: { agenda: 'запись', etapa: 'этап ремонта', orcamento: 'смета', pedido_peca: 'заказ запчасти', emergencia: 'регистрация ДТП' },
};

export function notifCorrecaoSuporte(locale: string | null | undefined, entidade: string) {
  const l = resolveEmailLocale(locale);
  return { titulo: correcaoSuporte[l].titulo, mensagem: fmt(correcaoSuporte[l].mensagem, { item: itemCorrecao[l][entidade] || entidade }) };
}
