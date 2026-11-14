// Plural de dias/horas sem banco nem servidor (Fable 14/11, itens #1 e #3):
// - diasTexto() dos e-mails/chat do sistema nos 6 idiomas
// - textos dos e-mails e do chat do sistema com 1 dia
// - chaves ICU das messages renderizadas pelo next-intl (1 e 2 dias)
// - execHours (unidade de hora por idioma) e avgResponseHours com decimal do idioma
//
//   npx tsx scripts/teste-plural-dias.ts
import fs from 'node:fs';
import path from 'node:path';
import { createTranslator } from 'next-intl';
import { diasTexto, EMAIL_I18N, fmt } from '../src/lib/email-i18n';
import { chatNovoOrcamentoRecebido, chatOrcamentoRevisado, chatResumoOrcamentoAceito } from '../src/lib/notif-i18n';

let falhas = 0;
let total = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

// 1) diasTexto
const esperadoDias: Record<string, Record<number, string>> = {
  et: { 1: '1 päev', 2: '2 päeva', 5: '5 päeva', 21: '21 päeva' },
  ru: { 1: '1 дн.', 2: '2 дн.', 5: '5 дн.', 21: '21 дн.' },
  en: { 1: '1 day', 2: '2 days', 5: '5 days', 21: '21 days' },
  it: { 1: '1 giorno', 2: '2 giorni', 5: '5 giorni', 21: '21 giorni' },
  pt: { 1: '1 dia', 2: '2 dias', 5: '5 dias', 21: '21 dias' },
  'pt-PT': { 1: '1 dia', 2: '2 dias', 5: '5 dias', 21: '21 dias' },
};
for (const [l, casos] of Object.entries(esperadoDias)) {
  for (const [n, txt] of Object.entries(casos)) confere(`diasTexto(${l}, ${n})`, diasTexto(l, Number(n)), txt);
}
confere('diasTexto(pt-BR -> pt, 1)', diasTexto('pt-BR', 1), '1 dia');
confere('diasTexto(sem idioma -> en, 1)', diasTexto(null, 1), '1 day');

// 2) templates de e-mail e chat do sistema com 1 dia (mesma montagem de lib/notifications.ts)
confere('e-mail novo orcamento ET 1', fmt(EMAIL_I18N.quoteNotification.et.prazo, { prazoDias: diasTexto('et', 1) }), 'Remondi kestus: 1 päev');
confere('e-mail novo orcamento EN 1', fmt(EMAIL_I18N.quoteNotification.en.prazo, { prazoDias: diasTexto('en', 1) }), 'Repair time: 1 day');
confere('e-mail novo orcamento RU 3', fmt(EMAIL_I18N.quoteNotification.ru.prazo, { prazoDias: diasTexto('ru', 3) }), 'Срок ремонта: 3 дн.');
confere('e-mail aceito pagamento IT 1', fmt(EMAIL_I18N.orcamentoAceitoPagamento.it.prazo, { dias: diasTexto('it', 1) }), 'Durata della riparazione: 1 giorno');
confere('e-mail aceito outro PT 1', fmt(EMAIL_I18N.orcamentoAceitoOutro.pt.prazo, { dias: diasTexto('pt', 1) }), 'Prazo do conserto: 1 dia');
confere('e-mail cotacao peca ET 1', fmt(EMAIL_I18N.cotacaoPecaRespondida.et.prazo, { prazoDias: diasTexto('et', 1) }), 'Tarneaeg: 1 päev');
confere('chat novo orcamento ET 1', chatNovoOrcamentoRecebido('et', '100 €', 'Töökoda', 1), 'Uus hinnapakkumine saabus: 100 € töökojalt Töökoda. Tähtaeg: 1 päev.');
confere('chat novo orcamento RU 2', chatNovoOrcamentoRecebido('ru', '100 €', 'СТО', 2), 'Новая смета: 100 € от автосервиса СТО. Срок: 2 дн.');
confere('chat revisado EN 1', chatOrcamentoRevisado('en', 2, '100 €', 1, '').split('\n')[2], '📅 Timeline: 1 day');
confere('chat aceito ET 1', chatResumoOrcamentoAceito('et', '100 €', 'Töökoda', 1).endsWith('tähtajaga 1 päev.'), true);
confere('chat aceito EN 5', chatResumoOrcamentoAceito('en', '100 €', 'Shop', 5).endsWith('with a timeline of 5 days.'), true);
confere('chat aceito RU 5', chatResumoOrcamentoAceito('ru', '100 €', 'СТО', 5).endsWith('со сроком 5 дн.'), true);

// 3) chaves ICU das messages (next-intl) com 1 e 2
const MSG = path.join(__dirname, '..', 'messages');
function mensagens(l: string): Record<string, any> {
  const base = JSON.parse(fs.readFileSync(path.join(MSG, `${l}.json`), 'utf8'));
  for (const ns of ['cliente', 'misc', 'oficina']) Object.assign(base, JSON.parse(fs.readFileSync(path.join(MSG, `${l}.${ns}.json`), 'utf8')));
  return base;
}
const chaves: Array<[string, Record<string, string | number>]> = [
  ['emergenciaAcidenteDetalhe.deadlineLabel', {}],
  ['emergenciaAcidenteDetalhe.quoteMsgBase', { oficina: 'X', valor: '10 €' }],
  ['revisaoOrcamento.novoPrazo', {}],
  ['garantia.diasRestantes', {}],
  ['garantia.noOrcamento', {}],
  ['oficinaGarantias.diasRestantes', {}],
  ['oficinaEnviarOrcamento.garantiaDias', {}],
];
const palavra1: Record<string, RegExp> = { et: /\b1 päev\b(?!a)/, en: /\b1 day\b(?!s)/, it: /\b1 giorno\b/, pt: /\b1 dia\b(?!s)/, 'pt-PT': /\b1 dia\b(?!s)/, ru: /1 дн\./ };
const palavra2: Record<string, RegExp> = { et: /\b2 päeva\b/, en: /\b2 days\b/, it: /\b2 giorni\b/, pt: /\b2 dias\b/, 'pt-PT': /\b2 dias\b/, ru: /2 дн\./ };
const excecoes: Record<string, [string, string]> = {
  'en emergenciaAcidenteDetalhe.quoteMsgBase': ['Quote from X: 10 €, 1-day timeline.', 'Quote from X: 10 €, 2-day timeline.'],
  'ru oficinaGarantias.diasRestantes': ['Осталось дней: 1', 'Осталось дней: 2'],
};
for (const l of Object.keys(esperadoDias)) {
  const msgs = mensagens(l);
  for (const [chave, extra] of chaves) {
    const [ns, k] = chave.split('.');
    const t = createTranslator({ locale: l, messages: msgs, namespace: ns as never });
    const um = (t as any)(k, { ...extra, dias: 1 }) as string;
    const dois = (t as any)(k, { ...extra, dias: 2 }) as string;
    // textos que ja eram invariaveis e continuam iguais: EN "1-day timeline", RU "Осталось дней: 1"
    const fixo = excecoes[`${l} ${chave}`];
    if (fixo) { confere(`${l} ${chave} 1`, um, fixo[0]); confere(`${l} ${chave} 2`, dois, fixo[1]); continue; }
    confere(`${l} ${chave} 1 -> ${palavra1[l]}`, palavra1[l].test(um) ? 'ok' : um, 'ok');
    confere(`${l} ${chave} 2 -> ${palavra2[l]}`, palavra2[l].test(dois) ? 'ok' : dois, 'ok');
  }
  // so oficina ET tem plural nos textos curtos ("1 päev enne kavandatut" etc.)
  if (l === 'et') {
    const t = createTranslator({ locale: l, messages: msgs }) as any;
    confere('et oficinaAgenda.diasAntesDoPrevisto 1', t('oficinaAgenda.diasAntesDoPrevisto', { dias: 1 }), '1 päev enne kavandatut');
    confere('et oficinaVeiculosEmServico.diasAtrasado 1', t('oficinaVeiculosEmServico.diasAtrasado', { dias: 1 }), '1 päev hilinenud');
  }
  const t = createTranslator({ locale: l, messages: msgs }) as any;
  const horas: Record<string, string> = { et: '3 h', ru: '3 ч', it: '3 h', en: '3h', pt: '3h', 'pt-PT': '3h' };
  confere(`${l} clienteOrcamentoDetalhe.execHours 3`, t('clienteOrcamentoDetalhe.execHours', { h: 3 }), horas[l]);
  const media: Record<string, string> = { et: '2,5', ru: '2,5', it: '2,5', en: '2.5', pt: '2,5', 'pt-PT': '2,5' };
  // mesma formatacao de OficinaPerfilClient (decimal1)
  const txt = t('oficinaPerfilPublico.avgResponseHours', { horas: new Intl.NumberFormat(l, { maximumFractionDigits: 1 }).format(2.5) }) as string;
  confere(`${l} oficinaPerfilPublico.avgResponseHours 2.5`, txt.includes(media[l]) ? 'ok' : txt, 'ok');
}

console.log(`\n${total - falhas}/${total} ok`);
if (falhas) { console.log(`${falhas} FALHA(S)`); process.exit(1); }
