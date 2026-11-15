// Check-in v2 no app: as funcoes puras de lib/turnos.ts (espelho do site) dao o MESMO resultado que o site
// (mesmos casos de apps/web/scripts/teste-turnos.ts secoes 4-8), sem banco, servidor nem aparelho.
// Sem tsx no projeto: compila com o tsc do app para uma pasta temporaria e roda com node, por exemplo
//   npx tsc apps/mobile/scripts/teste-turnos.ts --outDir <tmp> --module commonjs --target es2022 --skipLibCheck
//   node <tmp>/scripts/teste-turnos.js
import {
  faixasDoDia, formatarJanela, turnoDaJanela, janelaDoSlot, janelaAindaVale, slotAindaVale, janelaDaSugestao,
  instanteDaJanela, janelaDaAgenda, expedienteDoDia, horaCurta, LEGADO, semQuebra, type HorarioSemana,
} from '../lib/turnos';
import { horaLocalEmUtc } from '../lib/fuso';

let falhas = 0;
let total = 0;
function confere(nome: string, obtido: unknown, esperado: unknown) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${JSON.stringify(obtido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`);
}

const aberto = (inicio: string, fim: string) => ({ aberto: true, inicio, fim });
const fechado = { aberto: false, inicio: '', fim: '' };
const H: HorarioSemana = { seg: aberto('08:00', '18:00'), ter: aberto('08:00', '18:00'), qua: aberto('08:00', '18:00'), qui: aberto('08:00', '18:00'), sex: aberto('08:00', '12:00'), sab: fechado, dom: fechado };
// novembro de 2026: 16 = segunda ... 20 = sexta, 21 = sabado, 22 = domingo
const SEG = '2026-11-16', SAB = '2026-11-21', DOM = '2026-11-22';
const tallinn = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+02:00`); // inverno: UTC+2
const fx = (data: string, ctx: Parameters<typeof faixasDoDia>[1]) => faixasDoDia(data, ctx).map(formatarJanela);
const dia = (inicio: string, fim: string): HorarioSemana => ({ seg: aberto(inicio, fim) });

// 4) grade de 2 h e recepcao (base da previa do 079)
confere('08-18 sem almoco -> 5 faixas', fx(SEG, { horario: dia('08:00', '18:00') }), ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00']);
confere('08-18 almoco 12-13 -> pula o almoco', fx(SEG, { horario: dia('08:00', '18:00'), almoco_inicio: '12:00', almoco_fim: '13:00' }), ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00', '17:00–18:00']);
confere('09-18 almoco 12:30-13:30 (ultima de 30 min = hora)', fx(SEG, { horario: dia('09:00', '18:00'), almoco_inicio: '12:30', almoco_fim: '13:30' }), ['09:00–11:00', '11:00–12:30', '13:30–15:30', '15:30–17:30', '17:30']);
confere('recepcao 11-14 + almoco 12-13 -> duas faixas', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '11:00', recepcao_fim: '14:00', almoco_inicio: '12:00', almoco_fim: '13:00' }), ['11:00–12:00', '13:00–14:00']);
confere('hora fixa 09:00 (09:00-09:30) -> "09:00"', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '09:00', recepcao_fim: '09:30' }), ['09:00']);
confere('recepcao com time do Postgres (HH:MM:SS)', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '09:00:00', recepcao_fim: '11:00:00' }), ['09:00–11:00']);
confere('recepcao 13-16 no sabado 08-12 -> grade do dia', fx(SAB, { horario: { sab: aberto('08:00', '12:00') }, recepcao_inicio: '13:00', recepcao_fim: '16:00' }), ['08:00–10:00', '10:00–12:00']);
confere('dia fechado -> nenhuma faixa', fx(SAB, { horario: H }), []);
confere('sem horario (null) -> padrao 006 seg 08-18', fx(SEG, { horario: null }).length, 5);
confere('sem horario (null) -> domingo fechado', fx(DOM, { horario: null }), []);
confere('aberto sem horas -> horas do padrao', expedienteDoDia(SEG, { seg: { aberto: true } }), { ab: 480, fe: 1080 });
// 5) turno derivado, janela do slot (linha antiga), formato
confere('turno 11:30-13:30 -> manha', turnoDaJanela({ inicio: '11:30', fim: '13:30' }), 'manha');
confere('turno 12:00-14:00 -> tarde', turnoDaJanela({ inicio: '12:00', fim: '14:00' }), 'tarde');
confere('slot antigo manha -> 08-12', janelaDoSlot({ turno: 'manha', hora_inicio: null, hora_fim: null }), { inicio: '08:00', fim: '12:00' });
confere('slot antigo tarde -> 13-17', janelaDoSlot({ turno: 'tarde' }), { inicio: '13:00', fim: '17:00' });
confere('slot novo (time do Postgres)', janelaDoSlot({ turno: 'manha', hora_inicio: '09:30:00', hora_fim: '10:00:00' }), { inicio: '09:30', fim: '10:00' });
confere('formato 30 min = hora', formatarJanela({ inicio: '09:30', fim: '10:00' }), '09:30');
confere('formato 3 h', formatarJanela({ inicio: '09:00', fim: '12:00' }), '09:00–12:00');
confere('formato legado', [formatarJanela(LEGADO.manha), formatarJanela(LEGADO.tarde)], ['08:00–12:00', '13:00–17:00']);
confere('horaCurta', [horaCurta('09:30:00'), horaCurta(null)], ['09:30', '']);
// 6) validade ate o FIM da janela (fuso de Tallinn)
confere('janela 14-16 ainda vale as 15:59', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '15:59'), 'EE'), true);
confere('janela 14-16 acabou as 16:00', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '16:00'), 'EE'), false);
confere('janela 14-16 acabou as 16:01', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '16:01'), 'EE'), false);
confere('slot antigo manha vale as 11:59', slotAindaVale({ data_checkin: SEG, turno: 'manha' }, tallinn(SEG, '11:59'), 'EE'), true);
confere('slot antigo manha vencido as 12:00', slotAindaVale({ data_checkin: SEG, turno: 'manha' }, tallinn(SEG, '12:00'), 'EE'), false);
confere('slot novo 09:00-09:30 vale as 09:10 (antes: turno inteiro)', slotAindaVale({ data_checkin: SEG, turno: 'manha', hora_inicio: '09:00:00', hora_fim: '09:30:00' }, tallinn(SEG, '09:10'), 'EE'), true);
confere('slot novo 09:00-09:30 vencido as 09:30', slotAindaVale({ data_checkin: SEG, turno: 'manha', hora_inicio: '09:00:00', hora_fim: '09:30:00' }, tallinn(SEG, '09:30'), 'EE'), false);
confere('slot de amanha vale', slotAindaVale({ data_checkin: '2026-11-17', turno: 'manha' }, tallinn(SEG, '23:50'), 'EE'), true);
confere('slot de ontem vencido', slotAindaVale({ data_checkin: '2026-11-15', turno: 'tarde' }, tallinn(SEG, '00:10'), 'EE'), false);
// 7) 079: sugestao "dia + turno" -> faixa (2.13)
confere('079 manha -> 1a faixa da manha', janelaDaSugestao(SEG, 'manha', { horario: H }), { inicio: '08:00', fim: '10:00' });
confere('079 tarde -> 1a faixa que comeca >= 12:00', janelaDaSugestao(SEG, 'tarde', { horario: H, almoco_inicio: '12:00', almoco_fim: '13:00' }), { inicio: '13:00', fim: '15:00' });
confere('079 tarde com recepcao 08-10 -> sem faixa na tarde: legado', janelaDaSugestao(SEG, 'tarde', { horario: H, recepcao_inicio: '08:00', recepcao_fim: '10:00' }), { inicio: '13:00', fim: '17:00' });
confere('079 sexta 08-12: tarde nao aparece (nenhuma faixa >= 12:00)', faixasDoDia('2026-11-20', { horario: H }).some((j) => turnoDaJanela(j) === 'tarde'), false);
// 8) fuso / horario de verao (horaLocalEmUtc sem hourCycle, como o resto do app)
confere('DST 29/03/2026 08:00 Tallinn -> 05:00Z (EEST)', instanteDaJanela('2026-03-29', { inicio: '08:00', fim: '10:00' }, 'EE'), { inicio: '2026-03-29T05:00:00.000Z', fim: '2026-03-29T07:00:00.000Z' });
confere('DST 25/10/2026 08:00 Tallinn -> 06:00Z (EET)', instanteDaJanela('2026-10-25', { inicio: '08:00', fim: '10:00' }, 'EE'), { inicio: '2026-10-25T06:00:00.000Z', fim: '2026-10-25T08:00:00.000Z' });
confere('DST 28/03/2026 (vespera) 16:00-18:00 -> 14:00Z-16:00Z (EET)', instanteDaJanela('2026-03-28', { inicio: '16:00', fim: '18:00' }, 'EE'), { inicio: '2026-03-28T14:00:00.000Z', fim: '2026-03-28T16:00:00.000Z' });
confere('17/11/2026 09:00 -> 07:00Z', instanteDaJanela('2026-11-17', { inicio: '09:00', fim: '09:30' }, 'EE').inicio, '2026-11-17T07:00:00.000Z');
confere('Sao Paulo 09:00 -> 12:00Z', horaLocalEmUtc('2026-11-17', '09:00', 'BR'), '2026-11-17T12:00:00.000Z');
confere('agenda: 07:00Z + 09:00Z -> 09:00-11:00 Tallinn', janelaDaAgenda('2026-11-17T07:00:00.000Z', '2026-11-17T09:00:00.000Z', 'EE'), { inicio: '09:00', fim: '11:00' });
confere('agenda verao 29/03: 05:00Z + 07:00Z -> 08:00-10:00', janelaDaAgenda('2026-03-29T05:00:00.000Z', '2026-03-29T07:00:00.000Z', 'EE'), { inicio: '08:00', fim: '10:00' });
confere('agenda antiga 08:00 sem checkin_ate -> 08-12', janelaDaAgenda('2026-11-17T06:00:00.000Z', null, 'EE'), { inicio: '08:00', fim: '12:00' });
confere('agenda antiga 13:00 sem checkin_ate -> 13-17', janelaDaAgenda('2026-11-17T11:00:00.000Z', null, 'EE'), { inicio: '13:00', fim: '17:00' });
confere('agenda antiga hora exata 14:00 -> so a hora', formatarJanela(janelaDaAgenda('2026-11-17T12:00:00.000Z', null, 'EE')), '14:00');
// D13 (15/11): a janela nao quebra no meio - word joiners (U+2060) dos dois lados do traco, so na tela
confere('D13: semQuebra 08:00–10:00', semQuebra('08:00–10:00'), '08:00⁠–⁠10:00');
confere('D13: semQuebra sem janela nao muda', semQuebra('ter, 17 nov, 09:00'), 'ter, 17 nov, 09:00');

console.log(`\n${total - falhas}/${total} ${falhas ? `- ${falhas} FALHA(S)` : 'TUDO OK'}`);
if (falhas) throw new Error(`${falhas} falha(s)`);
