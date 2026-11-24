import type { EmailLocale } from './email-i18n';

// Textos do e-mail "a oficina te escreveu" ao MOTORISTA (dono 24/11; lib/email-mensagem-oficina.ts), nos 6 idiomas
// dos e-mails. Regras do dono: sem o texto da mensagem (privacidade), sem precos, sem "gratis", sem promessa;
// o link e sempre o do pedido (bipfix.com/r/<numero>). Mensagem de audio: o mesmo e-mail.
// {nome}, {oficina} (nome da oficina), {numero} (numero do pedido).

export type TextosEmailMensagem = {
  ola: string; olaSemNome: string;
  assunto: string; intro: string; acao: string; botao: string; rodape: string;
};

export const TEXTOS_EMAIL_MENSAGEM: Record<EmailLocale, TextosEmailMensagem> = {
  et: {
    ola: 'Tere, {nome}!', olaSemNome: 'Tere!',
    assunto: '{oficina} kirjutas sulle päringu {numero} kohta',
    intro: 'Töökoda {oficina} saatis sulle BipFixis sõnumi sinu päringu {numero} kohta.',
    acao: 'Ava päring, et sõnumit lugeda ja vastata.',
    botao: 'Loe sõnumit',
    rodape: 'Saadame selle e-kirja, kui töökoda kirjutab sulle BipFixis – sama vestluse kohta kõige rohkem ühe iga paari tunni tagant. Vastus sellele e-kirjale töökojani ei jõua: vasta päringu vestluses.',
  },
  ru: {
    ola: 'Здравствуйте, {nome}!', olaSemNome: 'Здравствуйте!',
    assunto: 'Новое сообщение от {oficina} по заявке {numero}',
    intro: 'Автосервис {oficina} написал вам в BipFix по вашей заявке {numero}.',
    acao: 'Откройте заявку, чтобы прочитать сообщение и ответить.',
    botao: 'Прочитать сообщение',
    rodape: 'Мы отправляем это письмо, когда автосервис пишет вам в BipFix, — не чаще одного раза в несколько часов по одному диалогу. Ответ на это письмо до автосервиса не дойдёт: отвечайте в чате заявки.',
  },
  en: {
    ola: 'Hi {nome},', olaSemNome: 'Hi,',
    assunto: '{oficina} wrote to you about request {numero}',
    intro: 'The repair shop {oficina} sent you a message on BipFix about your request {numero}.',
    acao: 'Open the request to read the message and reply.',
    botao: 'Read the message',
    rodape: 'We send this e-mail when a repair shop writes to you on BipFix, at most one every few hours for the same conversation. Replies to this e-mail don\'t reach the shop: please answer in the chat of your request.',
  },
  it: {
    ola: 'Ciao {nome},', olaSemNome: 'Ciao,',
    assunto: '{oficina} ti ha scritto per la richiesta {numero}',
    intro: 'L\'officina {oficina} ti ha inviato un messaggio su BipFix riguardo alla tua richiesta {numero}.',
    acao: 'Apri la richiesta per leggere il messaggio e rispondere.',
    botao: 'Leggi il messaggio',
    rodape: 'Ti inviamo questa email quando un\'officina ti scrive su BipFix, al massimo una ogni qualche ora per la stessa conversazione. Le risposte a questa email non arrivano all\'officina: rispondi nella chat della richiesta.',
  },
  pt: {
    ola: 'Olá, {nome}!', olaSemNome: 'Olá!',
    assunto: '{oficina} enviou uma mensagem sobre o seu pedido {numero}',
    intro: 'A oficina {oficina} enviou uma mensagem para você na BipFix sobre o seu pedido {numero}.',
    acao: 'Abra o pedido para ler a mensagem e responder.',
    botao: 'Ler a mensagem',
    rodape: 'Enviamos este e-mail quando uma oficina escreve para você na BipFix, no máximo um a cada algumas horas por conversa. Respostas a este e-mail não chegam à oficina: responda no chat do pedido.',
  },
  'pt-PT': {
    ola: 'Olá, {nome}!', olaSemNome: 'Olá!',
    assunto: '{oficina} enviou-lhe uma mensagem sobre o seu pedido {numero}',
    intro: 'A oficina {oficina} enviou-lhe uma mensagem na BipFix sobre o seu pedido {numero}.',
    acao: 'Abra o pedido para ler a mensagem e responder.',
    botao: 'Ler a mensagem',
    rodape: 'Enviamos este e-mail quando uma oficina lhe escreve na BipFix, no máximo um a cada algumas horas por conversa. As respostas a este e-mail não chegam à oficina: responda no chat do pedido.',
  },
};
