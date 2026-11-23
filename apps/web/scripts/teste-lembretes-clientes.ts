// Teste das REGRAS dos lembretes ao motorista (115) sem banco nem envio, com relogio falso:
// janela 09-20 Tallinn, prazo do orcamento, cada tipo no maximo 1 vez, juntar orcamentos, paradas,
// espaco entre e-mails, vespera do check-in, o unico SMS, textos (regras do dono, partes do SMS) e
// desenha os e-mails nos 6 idiomas (HTML) para conferir a olho.
//
//   npx tsx scripts/teste-lembretes-clientes.ts [pasta-dos-html]
// (o fluxo com banco, cron, pausa pelo link e o SMS: scripts/e2e/lembretes-clientes.mjs, contra o site local)
import fs from 'node:fs';
import path from 'node:path';
import {
  dentroDaJanela, prazoDoOrcamento, decidirPedido, decidirCheckin, decidirSmsLembrete, tiposResolvidos,
  type OrcLembrete, type RegistroLembrete,
} from '../src/lib/lembretes-cliente-regras';
import { montarEmailLembrete, textoSmsLembrete, type OrcEmail } from '../src/lib/lembretes-cliente-email';
import { TEXTOS_LEMBRETE } from '../src/lib/lembretes-cliente-textos';
import { partesSms } from '../src/lib/sms-regras';
import { aplicarIdentidade } from '../src/lib/email-marca';

let falhas = 0, oks = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (ok) oks++; else falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${ok ? '' : ` - obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}
const H = 3600e3;
// segunda 07/12/2026 10:00 em Tallinn (UTC+2 no inverno)
const T0 = Date.parse('2026-12-07T08:00:00Z');
const DESDE = T0 - 30 * 24 * H;
const iso = (t: number) => new Date(t).toISOString();
const slot = (data: string, inicio = '09:00', fim = '11:00') => ({ data_checkin: data, turno: inicio < '12:00' ? 'manha' : 'tarde', hora_inicio: `${inicio}:00`, hora_fim: `${fim}:00` });
const orc = (id: string, criadoH: number, slots: OrcLembrete['slots'], validade: string | null = '2026-12-20', status = 'enviado'): OrcLembrete =>
  ({ id, status, validade, created_at: iso(T0 - criadoH * H), pais: 'EE', slots });
const reg = (tipo: RegistroLembrete['tipo'], status: RegistroLembrete['status'], enviadoH: number | null, canal: 'email' | 'sms' = 'email', tentativas = 1): RegistroLembrete =>
  ({ tipo, canal, status, enviado_em: enviadoH == null ? null : iso(T0 - enviadoH * H), tentativas });
const base = { agora: T0, desde: DESDE, status: 'em_orcamento', pausado: false, agiu: false, registros: [] as RegistroLembrete[] };
const DIAS = ['2026-12-12', '2026-12-13'];

// ---------- janela 09:00-20:00 Tallinn ----------
confere('janela: 08:59 Tallinn -> fora', dentroDaJanela(Date.parse('2026-12-07T06:59:00Z'), 'EE'), false);
confere('janela: 09:00 Tallinn -> dentro', dentroDaJanela(Date.parse('2026-12-07T07:00:00Z'), 'EE'), true);
confere('janela: 19:59 Tallinn -> dentro', dentroDaJanela(Date.parse('2026-12-07T17:59:00Z'), 'EE'), true);
confere('janela: 20:00 Tallinn -> fora', dentroDaJanela(Date.parse('2026-12-07T18:00:00Z'), 'EE'), false);
confere('janela: sem pais = Tallinn', dentroDaJanela(Date.parse('2026-12-07T18:30:00Z'), null), false);
confere('janela: verao (UTC+3) 09:00 Tallinn -> dentro', dentroDaJanela(Date.parse('2026-06-01T06:00:00Z'), 'EE'), true);

// ---------- prazo ----------
{
  const p = prazoDoOrcamento(orc('a', 1, [slot('2026-12-09'), slot('2026-12-08', '14:00', '16:00')]));
  confere('prazo: fim do ULTIMO horario (09/12 11:00 Tallinn) antes da validade', p && { em: iso(p.em), pela: p.pela }, { em: '2026-12-09T09:00:00.000Z', pela: 'horario' });
  const q = prazoDoOrcamento(orc('b', 1, [slot('2026-12-15')], '2026-12-10'));
  confere('prazo: validade 10/12 manda (fim do dia em Tallinn = 10/12 22:00Z)', q && { em: iso(q.em), pela: q.pela }, { em: '2026-12-10T22:00:00.000Z', pela: 'validade' });
  confere('prazo: sem horario e sem validade -> null', prazoDoOrcamento(orc('c', 1, [], null)), null);
}

// ---------- decidirPedido ----------
const dois = [orc('o1', 26, [slot(DIAS[0])]), orc('o2', 25, [slot(DIAS[1], '14:00', '16:00')])];
{
  const d = decidirPedido({ ...base, orcamentos: dois });
  confere('nao_decidiu: D+1 do 1.o orcamento, junta os 2 pendentes num e-mail', [d.tipo, d.orcamentos], ['nao_decidiu', ['o1', 'o2']]);
  confere('nao_decidiu: 1.o orcamento ha 23 h -> ainda nao', decidirPedido({ ...base, orcamentos: [orc('o1', 23, [slot(DIAS[0])])] }).tipo, null);
  confere('nao_decidiu: ja enviado -> nunca de novo', decidirPedido({ ...base, orcamentos: dois, registros: [reg('nao_decidiu', 'enviado', 30)] }).tipo, null);
  confere('nao_decidiu: ja pulado (conta de teste) -> nunca', decidirPedido({ ...base, orcamentos: dois, registros: [reg('nao_decidiu', 'pulado', null)] }).tipo, null);
  confere('nao_decidiu: reservado (envio em curso noutra passada) -> nao repete', decidirPedido({ ...base, orcamentos: dois, registros: [reg('nao_decidiu', 'enviando', null)] }).tipo, null);
  confere('nao_decidiu: falhou 1x -> tenta de novo', decidirPedido({ ...base, orcamentos: dois, registros: [reg('nao_decidiu', 'falhou', null, 'email', 1)] }).tipo, 'nao_decidiu');
  confere('nao_decidiu: falhou 3x -> desiste', decidirPedido({ ...base, orcamentos: dois, registros: [reg('nao_decidiu', 'falhou', null, 'email', 3)] }).tipo, null);
  confere('parada: pausado pelo link', decidirPedido({ ...base, pausado: true, orcamentos: dois }).motivo, 'pausado');
  confere('parada: agiu (outra data / escreveu a oficina)', decidirPedido({ ...base, agiu: true, orcamentos: dois }).motivo, 'agiu');
  confere('parada: pedido cancelado', decidirPedido({ ...base, status: 'cancelada', orcamentos: dois }).motivo, 'pedido_fechado');
  confere('parada: pedido expirado', decidirPedido({ ...base, status: 'expirada', orcamentos: dois }).motivo, 'pedido_fechado');
  confere('parada: aceitou um orcamento', decidirPedido({ ...base, orcamentos: [dois[0], { ...dois[1], status: 'aceito' }] }).motivo, 'aceito');
  confere('parada: recusou todos', decidirPedido({ ...base, orcamentos: dois.map((o) => ({ ...o, status: 'recusado' })) }).motivo, 'sem_pendente');
  confere('recusou um: o e-mail lista so o outro', decidirPedido({ ...base, orcamentos: [{ ...dois[0], status: 'recusado' }, dois[1]] }).orcamentos, ['o2']);
  confere('antigo: 1.o orcamento antes do inicio dos lembretes (deploy) -> nunca', decidirPedido({ ...base, desde: T0 - 25.5 * H, orcamentos: dois }).motivo, 'antigo');
}
{
  // vence: unico horario termina em 30 h, orcamento chegou ha 30 h
  const v = [orc('o1', 30, [slot('2026-12-08', '14:00', '16:00')])]; // fim 08/12 16:00 Tallinn = T0 + 30 h
  const d = decidirPedido({ ...base, orcamentos: v });
  confere('vencem: prazo em 30 h -> "vencem" e "nao_decidiu" fica coberto (nunca sai)', [d.tipo, d.pular], ['vencem', [{ tipo: 'nao_decidiu', motivo: 'coberto_vencem' }]]);
  confere('vencem: orcamento recem-chegado (5 h) nao entra no "vencem"', decidirPedido({ ...base, orcamentos: [orc('o1', 5, [slot('2026-12-08', '14:00', '16:00')])] }).tipo, null);
  confere('vencem: ja enviado -> nao repete; "nao_decidiu" marcado coberto', (() => { const x = decidirPedido({ ...base, orcamentos: v, registros: [reg('vencem', 'enviado', 3)] }); return [x.tipo, x.pular.length]; })(), [null, 1]);
  const longe = [orc('o1', 30, [slot('2026-12-09', '09:00', '11:00')])]; // fim T0 + 49 h
  confere('vencem: prazo em 49 h -> ainda nao (sai "nao_decidiu")', decidirPedido({ ...base, orcamentos: longe }).tipo, 'nao_decidiu');
  confere('vencem: "nao_decidiu" ha 5 h e prazo > 24 h -> espera (espaco 20 h)', decidirPedido({ ...base, orcamentos: [orc('o1', 30, [slot('2026-12-09', '06:00', '08:00')])], registros: [reg('nao_decidiu', 'enviado', 5)] }).motivo, 'espaco');
  confere('vencem: "nao_decidiu" ha 5 h mas prazo < 24 h -> sai mesmo assim', decidirPedido({ ...base, orcamentos: [orc('o1', 30, [slot('2026-12-07', '14:00', '16:00')])], registros: [reg('nao_decidiu', 'enviado', 5)] }).tipo, 'vencem');
  confere('vencem: faltam 2 h -> tarde demais, nao manda', decidirPedido({ ...base, orcamentos: [orc('o1', 30, [slot('2026-12-07', '09:00', '12:00')])] }).tipo === 'vencem', false);
}
{
  // venceram: todos os pendentes passaram (horario e/ou validade)
  const passados = [orc('o1', 60, [slot('2026-12-06')]), orc('o2', 50, [slot('2026-12-12')], '2026-12-06')];
  confere('venceram: nenhum pode mais ser aceito -> "venceram" com os 2', (() => { const x = decidirPedido({ ...base, orcamentos: passados }); return [x.tipo, x.orcamentos]; })(), ['venceram', ['o1', 'o2']]);
  confere('venceram: "vencem" saiu ha 10 h -> espera o espaco de 20 h', decidirPedido({ ...base, orcamentos: passados, registros: [reg('vencem', 'enviado', 10)] }).motivo, 'espaco');
  confere('venceram: "vencem" ha 21 h -> sai', decidirPedido({ ...base, orcamentos: passados, registros: [reg('vencem', 'enviado', 21)] }).tipo, 'venceram');
  confere('venceram: ja enviado -> nunca de novo', decidirPedido({ ...base, orcamentos: passados, registros: [reg('venceram', 'enviado', 30)] }).tipo, null);
  confere('venceram: um ainda vivo -> nao', decidirPedido({ ...base, orcamentos: [passados[0], orc('o3', 30, [slot(DIAS[1])])], registros: [reg('nao_decidiu', 'enviado', 21)] }).tipo, null);
}
confere('resolvidos: enviado/pulado/enviando contam; falhou < 3 nao', Array.from(tiposResolvidos([reg('nao_decidiu', 'enviado', 1), reg('vencem', 'falhou', null), reg('venceram', 'pulado', null), reg('checkin', 'enviando', null)])).sort(), ['checkin', 'nao_decidiu', 'venceram']);

// ---------- vespera do check-in ----------
{
  const c = { agora: T0, desde: DESDE, status: 'agendado', dataInicio: '2026-12-08T07:00:00Z', criadoEm: iso(T0 - 50 * H), pais: 'EE', statusPedido: 'aceita', registros: [] as RegistroLembrete[] };
  confere('checkin: amanha 09:00, marcado ha 2 dias -> envia', decidirCheckin(c).enviar, true);
  confere('checkin: marcado hoje para amanha -> nao (o e-mail da marcacao acabou de chegar)', decidirCheckin({ ...c, criadoEm: iso(T0 - 2 * H) }).motivo, 'agendado_hoje');
  confere('checkin: depois de amanha -> ainda nao', decidirCheckin({ ...c, dataInicio: '2026-12-09T07:00:00Z' }).motivo, 'nao_e_vespera');
  confere('checkin: hoje (passou da vespera) -> nao', decidirCheckin({ ...c, dataInicio: '2026-12-07T13:00:00Z' }).motivo, 'nao_e_vespera');
  confere('checkin: ja enviado -> nao repete', decidirCheckin({ ...c, registros: [reg('checkin', 'enviado', 2)] }).motivo, 'ja_enviado');
  confere('checkin: agenda cancelada -> nao', decidirCheckin({ ...c, status: 'cancelado' }).motivo, 'agenda_inativa');
  // a pausa nao entra na decisao da vespera (aviso da marcacao, dono 23/11)
  confere('checkin: pedido cancelado -> nao', decidirCheckin({ ...c, statusPedido: 'cancelada' }).motivo, 'pedido_fechado');
  confere('checkin: agendado antes do deploy -> nao', decidirCheckin({ ...c, desde: T0 - 10 * H }).motivo, 'antigo');
}

// ---------- o unico SMS ----------
{
  const s = { smsPedido: true, telefone: '+372 5555 1234', smsAtivo: true, temApp: false, abriu: false, jaTemSms: false };
  confere('sms: quero SMS + telefone + sem app + nao abriu -> envia', decidirSmsLembrete(s).enviar, true);
  confere('sms: ja teve o SMS de lembrete -> nunca outro', decidirSmsLembrete({ ...s, jaTemSms: true }).motivo, 'ja_enviado');
  confere('sms: nao marcou "quero SMS" -> nao', decidirSmsLembrete({ ...s, smsPedido: false }).motivo, 'sem_sms_no_pedido');
  confere('sms: pedido antigo sem a caixa (null) -> nao', decidirSmsLembrete({ ...s, smsPedido: null }).motivo, 'sem_sms_no_pedido');
  confere('sms: sem telefone -> nao', decidirSmsLembrete({ ...s, telefone: ' ' }).motivo, 'sem_telefone');
  confere('sms: interruptor do admin desligado -> nao', decidirSmsLembrete({ ...s, smsAtivo: false }).motivo, 'sms_desligado');
  confere('sms: tem o app (push) -> nao', decidirSmsLembrete({ ...s, temApp: true }).motivo, 'tem_app');
  confere('sms: ja abriu o pedido pelo e-mail -> nao', decidirSmsLembrete({ ...s, abriu: true }).motivo, 'ja_abriu');
}

// ---------- textos ----------
const PROIBIDO = /sem cadastro|sem conta|no account|without (an )?account|ilma konto|ilma registreerimata|без регистрац|без аккаунт|senza account|senza registrazione|verific|kontrollitud|провер|várias|varios|several|multiple|mitu |несколько|diversi|molti preventivi| \d+ ?(h|horas|hours|tundi|часа?|ore)\b/i;
for (const [l, t] of Object.entries(TEXTOS_LEMBRETE)) {
  const ruim = Object.entries(t).filter(([, v]) => PROIBIDO.test(v)).map(([k]) => k);
  confere(`textos ${l}: sem "sem cadastro"/"verificado"/"varias ofertas"/prazo em horas`, ruim, []);
  const sms = textoSmsLembrete(l, 100123, 'https://bipfix.com/r/100123');
  confere(`sms ${l}: ${partesSms(sms)} parte(s) - "${sms}"`, partesSms(sms) <= (['ru', 'pt', 'pt-PT'].includes(l) ? 2 : 1), true); // ç, á e cirilico nao sao GSM-7 (70 por parte)
  confere(`sms ${l}: link curto sem portugues`, /https:\/\/bipfix\.com\/r\/100123$/.test(sms), true);
}

// ---------- os e-mails desenhados (6 idiomas x 4 tipos) ----------
const PASTA = process.argv[2] || path.resolve('../../../../Analises/Lembretes_2026-11-23/emails');
fs.mkdirSync(PASTA, { recursive: true });
const of1: OrcEmail = { id: 'o1', oficina: 'Kesklinna Autoteenindus', valor: '€ 320,00', validade: '2026-12-14', pais: 'EE', slots: [slot('2026-12-09'), slot('2026-12-10', '14:00', '16:00')] };
const of2: OrcEmail = { id: 'o2', oficina: 'Mustamäe Rehvid & Remont', valor: '€ 285,50', validade: '2026-12-12', pais: 'EE', slots: [slot('2026-12-08', '13:00', '15:00')] };
const NOMES: Record<string, string> = { et: 'Kadri', ru: 'Ольга', en: 'Kadri', it: 'Giulia', pt: 'Ana', 'pt-PT': 'Rita' };
for (const l of Object.keys(TEXTOS_LEMBRETE)) {
  const comum = { idioma: l, nome: NOMES[l], numero: 100123, agora: T0, link: 'https://bipfix.com/r/100123?k=EXEMPLO&l=' + l, linkPausa: 'https://bipfix.com/r/100123?s=EXEMPLO&l=' + l };
  const casos = {
    nao_decidiu: montarEmailLembrete({ ...comum, tipo: 'nao_decidiu', orcamentos: [of1, of2] }),
    vencem: montarEmailLembrete({ ...comum, tipo: 'vencem', orcamentos: [of1, of2] }),
    venceram: montarEmailLembrete({ ...comum, tipo: 'venceram', orcamentos: [of1, of2] }),
    checkin: montarEmailLembrete({ ...comum, linkPausa: null, tipo: 'checkin', orcamentos: [], checkin: { oficina: of1.oficina, inicio: '2026-12-08T07:00:00Z', fim: '2026-12-08T09:00:00Z', pais: 'EE', endereco: 'Tartu mnt 50, Tallinn' } }),
  };
  for (const [tipo, e] of Object.entries(casos)) {
    const html = aplicarIdentidade(e.html);
    fs.writeFileSync(path.join(PASTA, `${tipo}_${l}.html`), `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e.assunto.replace(/</g, '&lt;')}</title></head><body style="margin:0">\n<!-- assunto: ${e.assunto} -->\n<p style="font-family:Arial,sans-serif;font-size:13px;color:#374151;max-width:600px;margin:12px auto 0;padding:0 12px;"><b>Assunto:</b> ${e.assunto.replace(/</g, '&lt;')}</p>\n${html}\n</body></html>`);
    const restos = (html.match(/\{[a-z]+\}|\?\?|undefined|NaN|Invalid Date/g) || []);
    confere(`e-mail ${tipo} ${l}: sem chave crua nem data invalida`, restos, []);
    if (tipo === 'checkin') confere(`e-mail ${tipo} ${l}: botao do pedido, SEM link de pausa (aviso da marcacao)`, html.includes('data-botao="pedido"') && !html.includes('data-link="pausar"'), true);
    else confere(`e-mail ${tipo} ${l}: botao do pedido + link de pausa`, html.includes('data-botao="pedido"') && html.includes('data-link="pausar"') && html.includes('/r/100123?s='), true);
    if (tipo !== 'checkin') confere(`e-mail ${tipo} ${l}: os 2 orcamentos no mesmo e-mail`, (html.match(/data-orcamento="1"/g) || []).length, 2);
  }
}
console.log(`\nHTML dos e-mails em ${PASTA}`);
console.log(`\n${oks} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
