// Textos do chat de suporte que saem do servidor (mensagem automatica e e-mail
// com a resposta do admin), nas 6 linguas do site. Os da tela estao em
// messages/*.json (namespace "suporte").

type L = 'pt' | 'pt-PT' | 'en' | 'et' | 'it' | 'ru';

/** quando o admin esta offline (dono 03/11: com ele online, nao sai) */
export const SUPORTE_AUTO: Record<L, string> = {
  pt: 'Obrigado pela mensagem! Neste momento não estamos online. Respondemos em até 1 dia útil — a resposta aparece aqui e também chega no seu e-mail.',
  'pt-PT': 'Obrigado pela mensagem! Neste momento não estamos online. Respondemos em até 1 dia útil — a resposta aparece aqui e também chega ao seu e-mail.',
  en: 'Thanks for your message! We are not online right now. We reply within 1 business day — the answer will appear here and also arrive by e-mail.',
  et: 'Aitäh sõnumi eest! Praegu me ei ole võrgus. Vastame 1 tööpäeva jooksul — vastus ilmub siia ja tuleb ka sinu e-postile.',
  it: 'Grazie per il messaggio! In questo momento non siamo online. Rispondiamo entro 1 giorno lavorativo: la risposta comparirà qui e arriverà anche via e-mail.',
  ru: 'Спасибо за сообщение! Сейчас мы не в сети. Ответим в течение 1 рабочего дня — ответ появится здесь и придёт на вашу электронную почту.',
};

// rodape: responder o e-mail chega no suporte (reply-to) - funciona noutro aparelho.
// porque: so para visitante (e-mail nao verificado): por que recebeu o e-mail.
export const SUPORTE_EMAIL_RESPOSTA: Record<L, { assunto: string; titulo: string; ola: string; abrir: string; rodape: string; porque: string }> = {
  pt: { assunto: 'Resposta do BipFix', titulo: 'Você tem uma resposta do BipFix', ola: 'Olá {nome},', abrir: 'Abrir a conversa', rodape: 'Para responder, responda a este e-mail ou abra a conversa no site, no mesmo navegador em que começou.', porque: 'Você recebeu este e-mail porque começou uma conversa no chat do bipfix.com com este endereço. Se não foi você, ignore esta mensagem.' },
  'pt-PT': { assunto: 'Resposta do BipFix', titulo: 'Tem uma resposta do BipFix', ola: 'Olá {nome},', abrir: 'Abrir a conversa', rodape: 'Para responder, responda a este e-mail ou abra a conversa no site, no mesmo navegador em que a começou.', porque: 'Recebeu este e-mail porque foi iniciada uma conversa no chat do bipfix.com com este endereço. Se não foi o próprio, ignore esta mensagem.' },
  en: { assunto: 'Reply from BipFix', titulo: 'You have a reply from BipFix', ola: 'Hi {nome},', abrir: 'Open the chat', rodape: 'To reply, answer this e-mail or open the chat on the website in the same browser where you started it.', porque: 'You received this e-mail because a chat was started on bipfix.com with this address. If it was not you, please ignore this message.' },
  et: { assunto: 'BipFixi vastus', titulo: 'Sulle on BipFixist vastus', ola: 'Tere, {nome}!', abrir: 'Ava vestlus', rodape: 'Vastamiseks vasta sellele e-kirjale või ava vestlus veebilehel samas brauseris, kus selle alustasid.', porque: 'Said selle e-kirja, sest bipfix.com vestluses alustati selle aadressiga vestlust. Kui see polnud sina, jäta sõnum tähelepanuta.' },
  it: { assunto: 'Risposta da BipFix', titulo: 'Hai una risposta da BipFix', ola: 'Ciao {nome},', abrir: 'Apri la chat', rodape: 'Per rispondere, rispondi a questa e-mail o apri la chat sul sito nello stesso browser in cui l\'hai iniziata.', porque: 'Hai ricevuto questa e-mail perché su bipfix.com è stata avviata una chat con questo indirizzo. Se non sei stato tu, ignora questo messaggio.' },
  ru: { assunto: 'Ответ от BipFix', titulo: 'Вам ответили в BipFix', ola: 'Здравствуйте, {nome}!', abrir: 'Открыть чат', rodape: 'Чтобы ответить, ответьте на это письмо или откройте чат на сайте в том же браузере, где вы его начали.', porque: 'Вы получили это письмо, потому что на bipfix.com начали чат с этим адресом. Если это были не вы, просто проигнорируйте его.' },
};

export const linguaTexto = (l: string): L => (['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].includes(l) ? l : 'et') as L;
