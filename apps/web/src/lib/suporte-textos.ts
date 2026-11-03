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

export const SUPORTE_EMAIL_RESPOSTA: Record<L, { assunto: string; titulo: string; ola: string; abrir: string; rodape: string }> = {
  pt: { assunto: 'Resposta do BipFix', titulo: 'Você tem uma resposta do BipFix', ola: 'Olá {nome},', abrir: 'Abrir a conversa', rodape: 'Para responder, abra a conversa no site (botão de chat no canto da página).' },
  'pt-PT': { assunto: 'Resposta do BipFix', titulo: 'Tem uma resposta do BipFix', ola: 'Olá {nome},', abrir: 'Abrir a conversa', rodape: 'Para responder, abra a conversa no site (botão de chat no canto da página).' },
  en: { assunto: 'Reply from BipFix', titulo: 'You have a reply from BipFix', ola: 'Hi {nome},', abrir: 'Open the chat', rodape: 'To reply, open the chat on the website (chat button in the corner of the page).' },
  et: { assunto: 'BipFixi vastus', titulo: 'Sulle on BipFixist vastus', ola: 'Tere, {nome}!', abrir: 'Ava vestlus', rodape: 'Vastamiseks ava vestlus veebilehel (vestlusnupp lehe nurgas).' },
  it: { assunto: 'Risposta da BipFix', titulo: 'Hai una risposta da BipFix', ola: 'Ciao {nome},', abrir: 'Apri la chat', rodape: 'Per rispondere, apri la chat sul sito (pulsante della chat nell\'angolo della pagina).' },
  ru: { assunto: 'Ответ от BipFix', titulo: 'Вам ответили в BipFix', ola: 'Здравствуйте, {nome}!', abrir: 'Открыть чат', rodape: 'Чтобы ответить, откройте чат на сайте (кнопка чата в углу страницы).' },
};

export const linguaTexto = (l: string): L => (['pt', 'pt-PT', 'en', 'et', 'it', 'ru'].includes(l) ? l : 'et') as L;
