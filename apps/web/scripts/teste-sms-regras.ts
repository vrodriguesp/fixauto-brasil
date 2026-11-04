// Teste do SMS "chegou orcamento" sem banco nem Twilio: quem recebe (decidirSms),
// numero em E.164 so da Estonia e quantas partes cada texto custa.
//
//   npx tsx scripts/teste-sms-regras.ts
import { decidirSms, partesSms } from '../src/lib/sms-regras';
import { telefoneE164 } from '../src/lib/notifications';
import { SMS_I18N, fmt } from '../src/lib/email-i18n';

let falhas = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

const base: { tipo: 'orcamento_auto' | 'manual'; smsAtivo: boolean; status: string; telefone: string; temApp: boolean; jaEnviado: boolean; temOrcamento: boolean } = { tipo: 'orcamento_auto', smsAtivo: true, status: 'aberta', telefone: '+372 5123 4567', temApp: false, jaEnviado: false, temOrcamento: true };
const motivo = (p: Partial<typeof base>) => { const d = decidirSms({ ...base, ...p }); return d.enviar ? 'envia' : d.motivo; };

// automatico
confere('auto: pedido aberto, sem app', motivo({}), 'envia');
confere('auto: pedido em_orcamento', motivo({ status: 'em_orcamento' }), 'envia');
confere('auto: interruptor desligado', motivo({ smsAtivo: false }), 'sms_desligado');
confere('auto: cliente tem o app', motivo({ temApp: true }), 'tem_app');
confere('auto: ja enviado para este orcamento', motivo({ jaEnviado: true }), 'ja_enviado');
for (const st of ['cancelada', 'aceita', 'em_andamento', 'concluida', 'no_show']) confere(`auto: pedido ${st}`, motivo({ status: st }), 'pedido_fechado');
confere('auto: status nulo', motivo({ status: null as any }), 'pedido_fechado');
confere('auto: sem telefone', motivo({ telefone: null as any }), 'sem_telefone');
confere('auto: telefone so com espacos', motivo({ telefone: '  ' }), 'sem_telefone');
confere('auto: sem orcamento', motivo({ temOrcamento: false }), 'sem_orcamento');
// cancelado vence o interruptor e o app (pedido fechado nunca recebe)
confere('auto: cancelado + desligado', motivo({ status: 'cancelada', smsAtivo: false }), 'pedido_fechado');

// manual (admin): ignora interruptor, app e "ja enviado"; nunca pedido fechado
confere('manual: interruptor desligado', motivo({ tipo: 'manual', smsAtivo: false }), 'envia');
confere('manual: cliente tem o app', motivo({ tipo: 'manual', temApp: true }), 'envia');
confere('manual: ja enviado antes', motivo({ tipo: 'manual', jaEnviado: true }), 'envia');
confere('manual: pedido cancelado', motivo({ tipo: 'manual', status: 'cancelada' }), 'pedido_fechado');
confere('manual: sem orcamento', motivo({ tipo: 'manual', temOrcamento: false }), 'sem_orcamento');

// numero -> E.164 com o pais do mercado (EE). O envio so aceita os que comecam com 372.
const ee = (n: string) => telefoneE164(n, 'EE');
confere('E164: +372 5123 4567', ee('+372 5123 4567'), '37251234567');
confere('E164: 5123 4567 (nacional)', ee('5123 4567'), '37251234567');
confere('E164: 0037251234567', ee('0037251234567'), '37251234567');
confere('E164: 37251234567 (sem +)', ee('37251234567'), '37251234567');
confere('E164: +39 333 1234567 (italiano)', ee('+39 333 1234567'), '393331234567');
confere('E164: vazio', ee(''), null);
confere('E164: letras', ee('abc'), null);
const soEstonia = (n: string) => { const e = ee(n); return !!e && e.startsWith('372'); };
confere('so Estonia: +372', soEstonia('+372 5123 4567'), true);
confere('so Estonia: nacional', soEstonia('51234567'), true);
confere('so Estonia: +39 bloqueado', soEstonia('+39 333 1234567'), false);
confere('so Estonia: +55 bloqueado', soEstonia('+55 11 91234 5678'), false);

// textos reais com o link real mais longo (uuid) - partes cobradas
const url = (l: string) => `https://bipfix.com/ee/${l}/cliente/orcamentos/0d1f2a3b-1111-2222-3333-444455556666`;
const txt = (l: 'et' | 'ru' | 'en') => fmt(SMS_I18N.quoteSms[l], { url: url(l) });
confere('ET cabe em 1 SMS', partesSms(txt('et')), 1);
confere('EN cabe em 1 SMS', partesSms(txt('en')), 1);
confere('RU em 2 partes (cirilico)', partesSms(txt('ru')), 2);
confere('ET sem nome/valor (tela bloqueada)', /\{|€/.test(txt('et')), false);
confere('texto com õ vira UCS-2 (70)', partesSms('õ'.repeat(70)), 1);
confere('texto com õ 71 letras = 2 partes', partesSms('õ'.repeat(71)), 2);
confere('GSM-7 160 letras = 1 parte', partesSms('a'.repeat(160)), 1);
confere('GSM-7 161 letras = 2 partes', partesSms('a'.repeat(161)), 2);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
