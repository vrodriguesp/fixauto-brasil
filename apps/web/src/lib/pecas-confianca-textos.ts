// Textos do lote 3 de pecas ("confianca", 17/11) para sinos e e-mails, nas 6 linguas (mesmo padrao de
// notif-i18n.ts / email-i18n.ts, num arquivo proprio para nao mexer nos textos de hoje: os e-mails e
// sinos dos pedidos de hoje continuam byte a byte). {var} preenchido por fmt(); texto livre (peca,
// nomes) sempre escapado antes de ir ao HTML.
import { resolveEmailLocale, fmt, type EmailLocale } from './email-i18n';

type L<T> = Record<EmailLocale, T>;
type Aviso = { titulo: string; mensagem: string };

// ---------- motivos e problemas (texto do e-mail/sino) ----------
export const MOTIVOS_CANCELAMENTO_TXT: L<Record<string, string>> = {
  pt: { sem_estoque: 'sem estoque', prazo: 'não consegue no prazo', compradora_pediu: 'a compradora pediu', comprei_outro: 'comprou noutro lugar', carro_saiu: 'o carro saiu da oficina', erro_pedido: 'erro no pedido', nao_entregou: 'peça não entregue', outro: 'outro motivo' },
  'pt-PT': { sem_estoque: 'sem stock', prazo: 'não consegue no prazo', compradora_pediu: 'a compradora pediu', comprei_outro: 'comprou noutro sítio', carro_saiu: 'o carro saiu da oficina', erro_pedido: 'erro na encomenda', nao_entregou: 'peça não entregue', outro: 'outro motivo' },
  en: { sem_estoque: 'out of stock', prazo: 'cannot deliver in time', compradora_pediu: 'the buyer asked', comprei_outro: 'bought elsewhere', carro_saiu: 'the car left the shop', erro_pedido: 'ordering mistake', nao_entregou: 'part not delivered', outro: 'other reason' },
  et: { sem_estoque: 'laos pole', prazo: 'ei jõua õigeks ajaks', compradora_pediu: 'ostja palus', comprei_outro: 'ostis mujalt', carro_saiu: 'auto lahkus töökojast', erro_pedido: 'viga tellimuses', nao_entregou: 'varuosa jäi tarnimata', outro: 'muu põhjus' },
  ru: { sem_estoque: 'нет на складе', prazo: 'не успевает в срок', compradora_pediu: 'по просьбе покупателя', comprei_outro: 'купили в другом месте', carro_saiu: 'машина уехала из сервиса', erro_pedido: 'ошибка в заказе', nao_entregou: 'запчасть не доставлена', outro: 'другая причина' },
  it: { sem_estoque: 'non disponibile', prazo: 'non riesce nei tempi', compradora_pediu: "l'acquirente ha chiesto", comprei_outro: 'acquistato altrove', carro_saiu: "l'auto ha lasciato l'officina", erro_pedido: "errore nell'ordine", nao_entregou: 'ricambio non consegnato', outro: 'altro motivo' },
};
export const PROBLEMAS_TXT: L<Record<string, string>> = {
  pt: { nao_entregou: 'não foi entregue', peca_errada: 'peça errada', avariada: 'peça avariada', outro: 'outro problema' },
  'pt-PT': { nao_entregou: 'não foi entregue', peca_errada: 'peça errada', avariada: 'peça danificada', outro: 'outro problema' },
  en: { nao_entregou: 'not delivered', peca_errada: 'wrong part', avariada: 'damaged part', outro: 'other problem' },
  et: { nao_entregou: 'jäi tarnimata', peca_errada: 'vale varuosa', avariada: 'kahjustatud varuosa', outro: 'muu probleem' },
  ru: { nao_entregou: 'не доставлена', peca_errada: 'не та запчасть', avariada: 'запчасть повреждена', outro: 'другая проблема' },
  it: { nao_entregou: 'non consegnato', peca_errada: 'ricambio sbagliato', avariada: 'ricambio danneggiato', outro: 'altro problema' },
};
const motivoTxt = (l: EmailLocale, m: string | null | undefined) => (m ? MOTIVOS_CANCELAMENTO_TXT[l][m] || m : '-');
const problemaTxt = (l: EmailLocale, p: string | null | undefined) => (p ? PROBLEMAS_TXT[l][p] || p : '-');

// ---------- sinos ----------
const recebido: L<Aviso> = {
  pt: { titulo: 'Peça recebida', mensagem: '{oficina} confirmou que recebeu "{peca}"' },
  'pt-PT': { titulo: 'Peça recebida', mensagem: '{oficina} confirmou que recebeu "{peca}"' },
  en: { titulo: 'Part received', mensagem: '{oficina} confirmed receiving "{peca}"' },
  et: { titulo: 'Varuosa kätte saadud', mensagem: '{oficina} kinnitas, et sai kätte "{peca}"' },
  ru: { titulo: 'Запчасть получена', mensagem: '{oficina} подтвердил получение «{peca}»' },
  it: { titulo: 'Ricambio ricevuto', mensagem: '{oficina} ha confermato di aver ricevuto "{peca}"' },
};
export const notifRecebido = (loc: string | null | undefined, oficina: string, peca: string): Aviso => {
  const s = recebido[resolveEmailLocale(loc)]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficina, peca }) };
};

const problema: L<Aviso> = {
  pt: { titulo: 'Problema num pedido de peça', mensagem: '{oficina} informou um problema em "{peca}": {problema}' },
  'pt-PT': { titulo: 'Problema numa encomenda de peça', mensagem: '{oficina} indicou um problema em "{peca}": {problema}' },
  en: { titulo: 'Problem with a parts order', mensagem: '{oficina} reported a problem with "{peca}": {problema}' },
  et: { titulo: 'Probleem varuosa tellimusega', mensagem: '{oficina} teatas probleemist: "{peca}" - {problema}' },
  ru: { titulo: 'Проблема с заказом запчасти', mensagem: '{oficina} сообщил о проблеме с «{peca}»: {problema}' },
  it: { titulo: 'Problema con un ordine di ricambi', mensagem: '{oficina} ha segnalato un problema con "{peca}": {problema}' },
};
export const notifProblema = (loc: string | null | undefined, oficina: string, peca: string, prob: string): Aviso => {
  const l = resolveEmailLocale(loc); const s = problema[l]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficina, peca, problema: problemaTxt(l, prob) }) };
};

const cancelado: L<Aviso> = {
  pt: { titulo: 'Pedido de peça cancelado', mensagem: '{quem} cancelou o pedido de "{peca}" ({motivo})' },
  'pt-PT': { titulo: 'Encomenda de peça cancelada', mensagem: '{quem} cancelou a encomenda de "{peca}" ({motivo})' },
  en: { titulo: 'Parts order cancelled', mensagem: '{quem} cancelled the order for "{peca}" ({motivo})' },
  et: { titulo: 'Varuosa tellimus tühistatud', mensagem: '{quem} tühistas tellimuse "{peca}" ({motivo})' },
  ru: { titulo: 'Заказ запчасти отменён', mensagem: '{quem} отменил заказ «{peca}» ({motivo})' },
  it: { titulo: 'Ordine di ricambi annullato', mensagem: '{quem} ha annullato l\'ordine di "{peca}" ({motivo})' },
};
export const notifCancelado = (loc: string | null | undefined, quem: string, peca: string, motivo: string): Aviso => {
  const l = resolveEmailLocale(loc); const s = cancelado[l]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { quem, peca, motivo: motivoTxt(l, motivo) }) };
};

const avaliacaoRecebida: L<Aviso> = {
  pt: { titulo: 'Nova avaliação', mensagem: '{oficina} avaliou o pedido de "{peca}" com {nota}/5' },
  'pt-PT': { titulo: 'Nova avaliação', mensagem: '{oficina} avaliou a encomenda de "{peca}" com {nota}/5' },
  en: { titulo: 'New review', mensagem: '{oficina} rated the order for "{peca}" {nota}/5' },
  et: { titulo: 'Uus hinnang', mensagem: '{oficina} hindas tellimust "{peca}": {nota}/5' },
  ru: { titulo: 'Новый отзыв', mensagem: '{oficina} оценил заказ «{peca}» на {nota}/5' },
  it: { titulo: 'Nuova recensione', mensagem: '{oficina} ha valutato l\'ordine di "{peca}" con {nota}/5' },
};
export const notifAvaliacaoRecebida = (loc: string | null | undefined, oficina: string, peca: string, nota: number): Aviso => {
  const s = avaliacaoRecebida[resolveEmailLocale(loc)]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { oficina, peca, nota: String(nota) }) };
};

const lembrete: L<Aviso> = {
  pt: { titulo: 'Recebeu a peça? Avalie o pedido', mensagem: 'Conte como foi o pedido de "{peca}" ({fornecedor}): recebeu e avalie' },
  'pt-PT': { titulo: 'Recebeu a peça? Avalie a encomenda', mensagem: 'Diga como correu a encomenda de "{peca}" ({fornecedor}): recebeu e avalie' },
  en: { titulo: 'Got the part? Rate the order', mensagem: 'Tell us how the order for "{peca}" ({fornecedor}) went: received and rating' },
  et: { titulo: 'Kas varuosa jõudis kohale? Hinda tellimust', mensagem: 'Anna teada, kuidas läks tellimus "{peca}" ({fornecedor}): kättesaamine ja hinnang' },
  ru: { titulo: 'Запчасть получена? Оцените заказ', mensagem: 'Расскажите, как прошёл заказ «{peca}» ({fornecedor}): получение и оценка' },
  it: { titulo: 'Ricambio ricevuto? Valuta l\'ordine', mensagem: 'Raccontaci com\'è andato l\'ordine di "{peca}" ({fornecedor}): ricezione e valutazione' },
};
export const notifLembrete = (loc: string | null | undefined, peca: string, fornecedor: string): Aviso => {
  const s = lembrete[resolveEmailLocale(loc)]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { peca, fornecedor }) };
};

const reaberta: L<Aviso> = {
  pt: { titulo: 'Cotação voltou a abrir', mensagem: 'O pedido de "{peca}" voltou a abrir: confirme se a sua oferta continua valendo' },
  'pt-PT': { titulo: 'Cotação voltou a abrir', mensagem: 'O pedido de "{peca}" voltou a abrir: confirme se a sua oferta continua válida' },
  en: { titulo: 'Quote request reopened', mensagem: 'The request for "{peca}" is open again: check that your offer still stands' },
  et: { titulo: 'Hinnapäring avati uuesti', mensagem: 'Päring "{peca}" on jälle avatud: kontrolli, kas sinu pakkumine kehtib' },
  ru: { titulo: 'Запрос снова открыт', mensagem: 'Запрос «{peca}» снова открыт: проверьте, действует ли ваше предложение' },
  it: { titulo: 'Richiesta riaperta', mensagem: 'La richiesta di "{peca}" è di nuovo aperta: verifica che la tua offerta sia ancora valida' },
};
export const notifReaberta = (loc: string | null | undefined, peca: string): Aviso => {
  const s = reaberta[resolveEmailLocale(loc)]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { peca }) };
};

// pedido v3 entregue: o sino pergunta "recebeu?"
const entregueV3: L<Aviso> = {
  pt: { titulo: 'Peça entregue: recebeu?', mensagem: '{fornecedor} marcou "{peca}" como entregue. Confirme que recebeu ou informe um problema' },
  'pt-PT': { titulo: 'Peça entregue: recebeu?', mensagem: '{fornecedor} marcou "{peca}" como entregue. Confirme que recebeu ou indique um problema' },
  en: { titulo: 'Part delivered: did you get it?', mensagem: '{fornecedor} marked "{peca}" as delivered. Confirm you received it or report a problem' },
  et: { titulo: 'Varuosa tarnitud: kas said kätte?', mensagem: '{fornecedor} märkis "{peca}" tarnituks. Kinnita kättesaamine või teata probleemist' },
  ru: { titulo: 'Запчасть доставлена: получили?', mensagem: '{fornecedor} отметил «{peca}» как доставленную. Подтвердите получение или сообщите о проблеме' },
  it: { titulo: 'Ricambio consegnato: ricevuto?', mensagem: '{fornecedor} ha segnato "{peca}" come consegnato. Conferma la ricezione o segnala un problema' },
};
export const notifEntregueV3 = (loc: string | null | undefined, fornecedor: string, peca: string): Aviso => {
  const s = entregueV3[resolveEmailLocale(loc)]; return { titulo: s.titulo, mensagem: fmt(s.mensagem, { fornecedor, peca }) };
};

// avaliacao denunciada (so ao admin)
export const notifDenuncia = (peca: string): Aviso => ({ titulo: 'Avaliação de fornecedor denunciada', mensagem: `Pedido "${peca}": o fornecedor pediu revisão de uma avaliação` });

// ---------- e-mails ----------
type Email = { subject: string; headerTag: string; greeting: string; intro: string; cta: string; extra?: string };
const saudacao: L<string> = {
  pt: 'Olá <strong>{name}</strong>,', 'pt-PT': 'Olá <strong>{name}</strong>,', en: 'Hi <strong>{name}</strong>,',
  et: 'Tere, <strong>{name}</strong>,', ru: 'Здравствуйте, <strong>{name}</strong>!', it: 'Ciao <strong>{name}</strong>,',
};

export const EMAIL_L3: Record<string, L<Email>> = {
  entregueV3: {
    pt: { subject: 'Peça entregue: {peca} - recebeu?', headerTag: 'Pedido entregue', greeting: '', intro: '<strong>{fornecedor}</strong> marcou como entregue o pedido de "{peca}". Recebeu a peça? Confirme ou informe um problema e depois avalie o fornecedor.', cta: 'Recebi / Problema' },
    'pt-PT': { subject: 'Peça entregue: {peca} - recebeu?', headerTag: 'Encomenda entregue', greeting: '', intro: '<strong>{fornecedor}</strong> marcou como entregue a encomenda de "{peca}". Recebeu a peça? Confirme ou indique um problema e depois avalie o fornecedor.', cta: 'Recebi / Problema' },
    en: { subject: 'Part delivered: {peca} - did you get it?', headerTag: 'Order delivered', greeting: '', intro: '<strong>{fornecedor}</strong> marked the order for "{peca}" as delivered. Did you get the part? Confirm or report a problem, then rate the supplier.', cta: 'Received / Problem' },
    et: { subject: 'Varuosa tarnitud: {peca} - kas said kätte?', headerTag: 'Tellimus tarnitud', greeting: '', intro: '<strong>{fornecedor}</strong> märkis tellimuse "{peca}" tarnituks. Kas varuosa jõudis kohale? Kinnita või teata probleemist ja hinda siis tarnijat.', cta: 'Sain kätte / Probleem' },
    ru: { subject: 'Запчасть доставлена: {peca} - получили?', headerTag: 'Заказ доставлен', greeting: '', intro: '<strong>{fornecedor}</strong> отметил заказ «{peca}» как доставленный. Запчасть получена? Подтвердите или сообщите о проблеме, затем оцените поставщика.', cta: 'Получил / Проблема' },
    it: { subject: 'Ricambio consegnato: {peca} - ricevuto?', headerTag: 'Ordine consegnato', greeting: '', intro: '<strong>{fornecedor}</strong> ha segnato come consegnato l\'ordine di "{peca}". Hai ricevuto il ricambio? Conferma o segnala un problema, poi valuta il fornitore.', cta: 'Ricevuto / Problema' },
  },
  cancelado: {
    pt: { subject: 'Pedido cancelado: {peca}', headerTag: 'Pedido cancelado', greeting: '', intro: '<strong>{quem}</strong> cancelou o pedido de "{peca}". Motivo: {motivo}.', cta: 'Ver pedido' },
    'pt-PT': { subject: 'Encomenda cancelada: {peca}', headerTag: 'Encomenda cancelada', greeting: '', intro: '<strong>{quem}</strong> cancelou a encomenda de "{peca}". Motivo: {motivo}.', cta: 'Ver encomenda' },
    en: { subject: 'Order cancelled: {peca}', headerTag: 'Order cancelled', greeting: '', intro: '<strong>{quem}</strong> cancelled the order for "{peca}". Reason: {motivo}.', cta: 'View order' },
    et: { subject: 'Tellimus tühistatud: {peca}', headerTag: 'Tellimus tühistatud', greeting: '', intro: '<strong>{quem}</strong> tühistas tellimuse "{peca}". Põhjus: {motivo}.', cta: 'Vaata tellimust' },
    ru: { subject: 'Заказ отменён: {peca}', headerTag: 'Заказ отменён', greeting: '', intro: '<strong>{quem}</strong> отменил заказ «{peca}». Причина: {motivo}.', cta: 'Посмотреть заказ' },
    it: { subject: 'Ordine annullato: {peca}', headerTag: 'Ordine annullato', greeting: '', intro: '<strong>{quem}</strong> ha annullato l\'ordine di "{peca}". Motivo: {motivo}.', cta: 'Vedi ordine' },
  },
  problema: {
    pt: { subject: 'Problema no pedido: {peca}', headerTag: 'Problema no pedido', greeting: '', intro: '<strong>{oficina}</strong> informou um problema no pedido de "{peca}": {problema}.', cta: 'Ver pedido', extra: 'Comentário: {texto}' },
    'pt-PT': { subject: 'Problema na encomenda: {peca}', headerTag: 'Problema na encomenda', greeting: '', intro: '<strong>{oficina}</strong> indicou um problema na encomenda de "{peca}": {problema}.', cta: 'Ver encomenda', extra: 'Comentário: {texto}' },
    en: { subject: 'Problem with order: {peca}', headerTag: 'Problem with an order', greeting: '', intro: '<strong>{oficina}</strong> reported a problem with the order for "{peca}": {problema}.', cta: 'View order', extra: 'Comment: {texto}' },
    et: { subject: 'Probleem tellimusega: {peca}', headerTag: 'Probleem tellimusega', greeting: '', intro: '<strong>{oficina}</strong> teatas probleemist tellimusega "{peca}": {problema}.', cta: 'Vaata tellimust', extra: 'Kommentaar: {texto}' },
    ru: { subject: 'Проблема с заказом: {peca}', headerTag: 'Проблема с заказом', greeting: '', intro: '<strong>{oficina}</strong> сообщил о проблеме с заказом «{peca}»: {problema}.', cta: 'Посмотреть заказ', extra: 'Комментарий: {texto}' },
    it: { subject: 'Problema con l\'ordine: {peca}', headerTag: 'Problema con un ordine', greeting: '', intro: '<strong>{oficina}</strong> ha segnalato un problema con l\'ordine di "{peca}": {problema}.', cta: 'Vedi ordine', extra: 'Commento: {texto}' },
  },
  lembrete1: {
    pt: { subject: 'Recebeu "{peca}"? Avalie o fornecedor', headerTag: 'Avalie o pedido', greeting: '', intro: 'O pedido de "{peca}" de <strong>{fornecedor}</strong> foi entregue. Confirme que recebeu (ou informe um problema) e avalie o fornecedor: leva menos de um minuto e ajuda as outras oficinas.', cta: 'Avaliar o pedido' },
    'pt-PT': { subject: 'Recebeu "{peca}"? Avalie o fornecedor', headerTag: 'Avalie a encomenda', greeting: '', intro: 'A encomenda de "{peca}" de <strong>{fornecedor}</strong> foi entregue. Confirme que recebeu (ou indique um problema) e avalie o fornecedor: demora menos de um minuto e ajuda as outras oficinas.', cta: 'Avaliar a encomenda' },
    en: { subject: 'Got "{peca}"? Rate the supplier', headerTag: 'Rate the order', greeting: '', intro: 'The order for "{peca}" from <strong>{fornecedor}</strong> was delivered. Confirm you received it (or report a problem) and rate the supplier: it takes less than a minute and helps other workshops.', cta: 'Rate the order' },
    et: { subject: 'Kas "{peca}" jõudis kohale? Hinda tarnijat', headerTag: 'Hinda tellimust', greeting: '', intro: 'Tellimus "{peca}" tarnijalt <strong>{fornecedor}</strong> on tarnitud. Kinnita kättesaamine (või teata probleemist) ja hinda tarnijat: see võtab alla minuti ja aitab teisi töökodasid.', cta: 'Hinda tellimust' },
    ru: { subject: 'Получили «{peca}»? Оцените поставщика', headerTag: 'Оцените заказ', greeting: '', intro: 'Заказ «{peca}» от <strong>{fornecedor}</strong> доставлен. Подтвердите получение (или сообщите о проблеме) и оцените поставщика: это займёт меньше минуты и поможет другим автосервисам.', cta: 'Оценить заказ' },
    it: { subject: 'Ricevuto "{peca}"? Valuta il fornitore', headerTag: 'Valuta l\'ordine', greeting: '', intro: 'L\'ordine di "{peca}" da <strong>{fornecedor}</strong> è stato consegnato. Conferma la ricezione (o segnala un problema) e valuta il fornitore: richiede meno di un minuto e aiuta le altre officine.', cta: 'Valuta l\'ordine' },
  },
  lembrete2: {
    pt: { subject: 'Último lembrete: avalie "{peca}"', headerTag: 'Avaliação pendente', greeting: '', intro: 'Ainda falta o retorno e a avaliação do pedido de "{peca}" de <strong>{fornecedor}</strong>.', cta: 'Avaliar agora', extra: 'A partir de amanhã, novos pedidos de peças e confirmações ficam bloqueados até a avaliação ser enviada.' },
    'pt-PT': { subject: 'Último lembrete: avalie "{peca}"', headerTag: 'Avaliação pendente', greeting: '', intro: 'Ainda falta a confirmação e a avaliação da encomenda de "{peca}" de <strong>{fornecedor}</strong>.', cta: 'Avaliar agora', extra: 'A partir de amanhã, novos pedidos de peças e confirmações ficam bloqueados até a avaliação ser enviada.' },
    en: { subject: 'Last reminder: rate "{peca}"', headerTag: 'Rating pending', greeting: '', intro: 'The order for "{peca}" from <strong>{fornecedor}</strong> still needs your feedback and rating.', cta: 'Rate now', extra: 'From tomorrow, new parts requests and confirmations are blocked until the rating is sent.' },
    et: { subject: 'Viimane meeldetuletus: hinda "{peca}"', headerTag: 'Hinnang puudu', greeting: '', intro: 'Tellimuse "{peca}" (tarnija <strong>{fornecedor}</strong>) kohta on tagasiside ja hinnang veel andmata.', cta: 'Hinda kohe', extra: 'Alates homsest on uued varuosapäringud ja kinnitused blokeeritud, kuni hinnang on saadetud.' },
    ru: { subject: 'Последнее напоминание: оцените «{peca}»', headerTag: 'Ожидается оценка', greeting: '', intro: 'По заказу «{peca}» от <strong>{fornecedor}</strong> всё ещё нет подтверждения и оценки.', cta: 'Оценить сейчас', extra: 'С завтрашнего дня новые запросы запчастей и подтверждения будут заблокированы, пока оценка не отправлена.' },
    it: { subject: 'Ultimo promemoria: valuta "{peca}"', headerTag: 'Valutazione in sospeso', greeting: '', intro: 'L\'ordine di "{peca}" da <strong>{fornecedor}</strong> attende ancora conferma e valutazione.', cta: 'Valuta ora', extra: 'Da domani le nuove richieste di ricambi e le conferme saranno bloccate finché la valutazione non sarà inviata.' },
  },
  avaliacao: {
    pt: { subject: 'Nova avaliação: {nota}/5', headerTag: 'Nova avaliação', greeting: '', intro: '<strong>{oficina}</strong> avaliou o pedido de "{peca}" com {nota}/5.', cta: 'Ver avaliação', extra: 'Comentário: {texto}' },
    'pt-PT': { subject: 'Nova avaliação: {nota}/5', headerTag: 'Nova avaliação', greeting: '', intro: '<strong>{oficina}</strong> avaliou a encomenda de "{peca}" com {nota}/5.', cta: 'Ver avaliação', extra: 'Comentário: {texto}' },
    en: { subject: 'New review: {nota}/5', headerTag: 'New review', greeting: '', intro: '<strong>{oficina}</strong> rated the order for "{peca}" {nota}/5.', cta: 'View review', extra: 'Comment: {texto}' },
    et: { subject: 'Uus hinnang: {nota}/5', headerTag: 'Uus hinnang', greeting: '', intro: '<strong>{oficina}</strong> hindas tellimust "{peca}": {nota}/5.', cta: 'Vaata hinnangut', extra: 'Kommentaar: {texto}' },
    ru: { subject: 'Новый отзыв: {nota}/5', headerTag: 'Новый отзыв', greeting: '', intro: '<strong>{oficina}</strong> оценил заказ «{peca}» на {nota}/5.', cta: 'Посмотреть отзыв', extra: 'Комментарий: {texto}' },
    it: { subject: 'Nuova recensione: {nota}/5', headerTag: 'Nuova recensione', greeting: '', intro: '<strong>{oficina}</strong> ha valutato l\'ordine di "{peca}" con {nota}/5.', cta: 'Vedi recensione', extra: 'Commento: {texto}' },
  },
  reaberta: {
    pt: { subject: 'Cotação voltou a abrir: {peca}', headerTag: 'Cotação reaberta', greeting: '', intro: 'O pedido de "{peca}" voltou a abrir e a sua oferta pode ser escolhida. Confirme se o preço e o prazo continuam valendo.', cta: 'Ver cotação' },
    'pt-PT': { subject: 'Cotação voltou a abrir: {peca}', headerTag: 'Cotação reaberta', greeting: '', intro: 'O pedido de "{peca}" voltou a abrir e a sua oferta pode ser escolhida. Confirme se o preço e o prazo continuam válidos.', cta: 'Ver cotação' },
    en: { subject: 'Quote request reopened: {peca}', headerTag: 'Request reopened', greeting: '', intro: 'The request for "{peca}" is open again and your offer can be chosen. Check that the price and delivery time still stand.', cta: 'View request' },
    et: { subject: 'Hinnapäring avati uuesti: {peca}', headerTag: 'Päring avati uuesti', greeting: '', intro: 'Päring "{peca}" on jälle avatud ja sinu pakkumise saab valida. Kontrolli, kas hind ja tarneaeg kehtivad.', cta: 'Vaata päringut' },
    ru: { subject: 'Запрос снова открыт: {peca}', headerTag: 'Запрос снова открыт', greeting: '', intro: 'Запрос «{peca}» снова открыт, и ваше предложение могут выбрать. Проверьте, действуют ли цена и срок.', cta: 'Посмотреть запрос' },
    it: { subject: 'Richiesta riaperta: {peca}', headerTag: 'Richiesta riaperta', greeting: '', intro: 'La richiesta di "{peca}" è di nuovo aperta e la tua offerta può essere scelta. Verifica che prezzo e tempi siano ancora validi.', cta: 'Vedi richiesta' },
  },
};

export const textoEmailL3 = (tipo: keyof typeof EMAIL_L3, loc: string | null | undefined) => {
  const l = resolveEmailLocale(loc);
  return { l, s: EMAIL_L3[tipo][l], saudacao: saudacao[l] };
};
export const motivoNoIdioma = (loc: string | null | undefined, m: string | null | undefined) => motivoTxt(resolveEmailLocale(loc), m);
export const problemaNoIdioma = (loc: string | null | undefined, p: string | null | undefined) => problemaTxt(resolveEmailLocale(loc), p);

// "quem" cancelou, quando o nome falta
export const QUEM_SEM_NOME: L<{ fornecedor: string; compradora: string; admin: string }> = {
  pt: { fornecedor: 'O fornecedor', compradora: 'A oficina', admin: 'A BipFix' },
  'pt-PT': { fornecedor: 'O fornecedor', compradora: 'A oficina', admin: 'A BipFix' },
  en: { fornecedor: 'The supplier', compradora: 'The workshop', admin: 'BipFix' },
  et: { fornecedor: 'Tarnija', compradora: 'Töökoda', admin: 'BipFix' },
  ru: { fornecedor: 'Поставщик', compradora: 'Автосервис', admin: 'BipFix' },
  it: { fornecedor: 'Il fornitore', compradora: "L'officina", admin: 'BipFix' },
};
