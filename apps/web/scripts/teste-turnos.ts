// Datas de check-in x horario de funcionamento, sem banco nem servidor (dono 14/11 + auditoria Fable 14/11):
// - conflitoHorario: dia fechado, periodo fora do horario (manha e tarde), sem horario, formatos estranhos
// - primeiroTurnoAberto: nunca hoje; proximo dia em que a oficina abre; manha ou o 1o periodo que cabe
// - turnoAcabaLogo: no fuso da OFICINA (Tallinn), nao no do computador
//
//   npx tsx scripts/teste-turnos.ts
import {
  conflitoHorario, horarioDoDia, primeiroTurnoAberto, turnoAcabaLogo, type HorarioSemana,
  faixasDoDia, formatarJanela, validarRecepcao, turnoDaJanela, janelaDoSlot, janelaAindaVale, faixasValidas, diaEscolhivel,
  janelaAcabaLogo, primeiroDiaComFaixa, opcoesOutroHorario, janelaDaSugestao, instanteDaJanela, janelaDaAgenda,
  erroValidade, maiorData, somarDias, VALIDADE_FOLGA_DIAS, validadeSugerida, janelaLegadaDoInicio, partesDaAgenda, textoDaAgenda,
} from '../src/lib/turnos';
import { fimPrevistoDoServico } from '../src/lib/fuso';

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
// semana tipica: seg-qui 08-18, sex 08-12, sab/dom fechados (caso YuMotors: sabado fechado)
const H: HorarioSemana = { seg: aberto('08:00', '18:00'), ter: aberto('08:00', '18:00'), qua: aberto('08:00', '18:00'), qui: aberto('08:00', '18:00'), sex: aberto('08:00', '12:00'), sab: fechado, dom: fechado };
// novembro de 2026: 16 = segunda ... 20 = sexta, 21 = sabado, 22 = domingo
const SEG = '2026-11-16', TER = '2026-11-17', SEX = '2026-11-20', SAB = '2026-11-21', DOM = '2026-11-22';
const tallinn = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+02:00`); // inverno: UTC+2

// 1) conflitoHorario
confere('sabado fechado (manha)', conflitoHorario(SAB, 'manha', H), 'fechado');
confere('sabado fechado (tarde)', conflitoHorario(SAB, 'tarde', H), 'fechado');
confere('domingo fechado', conflitoHorario(DOM, 'manha', H), 'fechado');
confere('segunda manha ok', conflitoHorario(SEG, 'manha', H), null);
confere('segunda tarde ok', conflitoHorario(SEG, 'tarde', H), null);
confere('sexta fecha 12:00 + tarde -> turno', conflitoHorario(SEX, 'tarde', H), 'turno');
confere('sexta fecha 12:00 + manha ok', conflitoHorario(SEX, 'manha', H), null);
confere('abre 14:00 + manha -> turno', conflitoHorario(SEG, 'manha', { seg: aberto('14:00', '20:00') }), 'turno');
confere('abre 14:00 + tarde ok (cruza 14-17)', conflitoHorario(SEG, 'tarde', { seg: aberto('14:00', '20:00') }), null);
confere('fecha 13:00 + tarde -> turno (fecha quando o periodo comeca)', conflitoHorario(SEG, 'tarde', { seg: aberto('08:00', '13:00') }), 'turno');
confere('sobreposicao parcial 08-15 + tarde -> sem aviso', conflitoHorario(SEG, 'tarde', { seg: aberto('08:00', '15:00') }), null);
confere('sem horario (null)', conflitoHorario(SAB, 'tarde', null), null);
confere('sem horario (undefined)', conflitoHorario(SAB, 'tarde', undefined), null);
confere('chave do dia ausente', conflitoHorario(SAB, 'tarde', { seg: aberto('08:00', '18:00') }), null);
confere('aberto sem horas', conflitoHorario(SEG, 'manha', { seg: { aberto: true } }), null);
confere('sem "aberto", 14-18 + manha -> turno', conflitoHorario(SEG, 'manha', { seg: { inicio: '14:00', fim: '18:00' } }), 'turno');
confere('horario virado 22-02 -> sem aviso', conflitoHorario(SEG, 'manha', { seg: aberto('22:00', '02:00') }), null);
confere('data vazia', conflitoHorario('', 'manha', H), null);
confere('horarioDoDia(sexta)', horarioDoDia(SEX, H), aberto('08:00', '12:00'));

// 2) primeiroTurnoAberto: nunca hoje, proximo dia aberto
confere('seg 09:00 -> terca manha (nunca hoje)', primeiroTurnoAberto(tallinn(SEG, '09:00'), 'EE', H), { data: TER, turno: 'manha' });
confere('seg 07:00 (antes de abrir) -> terca manha', primeiroTurnoAberto(tallinn(SEG, '07:00'), 'EE', H), { data: TER, turno: 'manha' });
confere('qui 16:00 -> sexta manha', primeiroTurnoAberto(tallinn('2026-11-19', '16:00'), 'EE', H), { data: SEX, turno: 'manha' });
confere('sex 10:00 (sab/dom fechados) -> segunda manha', primeiroTurnoAberto(tallinn(SEX, '10:00'), 'EE', H), { data: '2026-11-23', turno: 'manha' });
confere('sab 19:00 (caso 14/11) -> segunda manha', primeiroTurnoAberto(tallinn('2026-11-14', '19:00'), 'EE', H), { data: SEG, turno: 'manha' });
confere('dom 23:30 -> segunda manha', primeiroTurnoAberto(tallinn('2026-11-15', '23:30'), 'EE', H), { data: SEG, turno: 'manha' });
confere('amanha so a tarde (abre 14:00) -> amanha tarde', primeiroTurnoAberto(tallinn(SEG, '09:00'), 'EE', { ...H, ter: aberto('14:00', '19:00') }), { data: TER, turno: 'tarde' });
confere('amanha fechado e depois so tarde -> quarta tarde', primeiroTurnoAberto(tallinn(SEG, '09:00'), 'EE', { ...H, ter: fechado, qua: aberto('13:00', '18:00') }), { data: '2026-11-18', turno: 'tarde' });
confere('sem horario -> amanha manha', primeiroTurnoAberto(tallinn(SEX, '10:00'), 'EE', null), { data: SAB, turno: 'manha' });
confere('tudo fechado -> amanha manha (nao trava)', primeiroTurnoAberto(tallinn(SEG, '09:00'), 'EE', { seg: fechado, ter: fechado, qua: fechado, qui: fechado, sex: fechado, sab: fechado, dom: fechado }), { data: TER, turno: 'manha' });
// virada do dia: 00:30 de terca em Tallinn ainda e segunda (22:30) em UTC - vale o dia da oficina
confere('ter 00:30 Tallinn (seg 22:30 UTC) -> quarta manha (dia da oficina)', primeiroTurnoAberto(tallinn(TER, '00:30'), 'EE', H), { data: '2026-11-18', turno: 'manha' });

// 3) turnoAcabaLogo (fuso da oficina)
confere('seg 15:30 tarde -> acaba em 1,5 h', turnoAcabaLogo(SEG, 'tarde', 2, tallinn(SEG, '15:30'), 'EE'), true);
confere('seg 14:30 tarde -> 2,5 h, nao', turnoAcabaLogo(SEG, 'tarde', 2, tallinn(SEG, '14:30'), 'EE'), false);
confere('seg 10:30 manha -> 1,5 h', turnoAcabaLogo(SEG, 'manha', 2, tallinn(SEG, '10:30'), 'EE'), true);
confere('seg 17:30 tarde -> ja passou (nao e "acaba logo")', turnoAcabaLogo(SEG, 'tarde', 2, tallinn(SEG, '17:30'), 'EE'), false);
confere('amanha -> nunca', turnoAcabaLogo(TER, 'tarde', 2, tallinn(SEG, '16:30'), 'EE'), false);

// ===================== check-in v2 (decisoes finais 14/11 noite, spec Fable v2 D.3/D.4/D.5) =====================
const fx = (data: string, ctx: Parameters<typeof faixasDoDia>[1]) => faixasDoDia(data, ctx).map(formatarJanela);
const dia = (inicio: string, fim: string): HorarioSemana => ({ seg: aberto(inicio, fim) });
// 4) grade de 2 h (tabela D.3)
confere('D3 08-18 sem almoco -> 5 faixas', fx(SEG, { horario: dia('08:00', '18:00') }), ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00']);
confere('D3 08-18 almoco 12-13 -> pula o almoco', fx(SEG, { horario: dia('08:00', '18:00'), almoco_inicio: '12:00', almoco_fim: '13:00' }), ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00', '17:00–18:00']);
confere('D3 09-18 almoco 12:30-13:30 (ultima de 30 min vale, mostrada como hora)', fx(SEG, { horario: dia('09:00', '18:00'), almoco_inicio: '12:30', almoco_fim: '13:30' }), ['09:00–11:00', '11:00–12:30', '13:30–15:30', '15:30–17:30', '17:30']);
confere('D3 08-17 almoco 12-13', fx(SEG, { horario: dia('08:00', '17:00'), almoco_inicio: '12:00', almoco_fim: '13:00' }), ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00']);
confere('D3 08-17 almoco 12:15-13:00 -> 12:00-12:15 cai', fx(SEG, { horario: dia('08:00', '17:00'), almoco_inicio: '12:15', almoco_fim: '13:00' }), ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00']);
confere('D3 sab 08-12 almoco 12-13 -> almoco fora do dia ignorado', fx(SAB, { horario: { sab: aberto('08:00', '12:00') }, almoco_inicio: '12:00', almoco_fim: '13:00' }), ['08:00–10:00', '10:00–12:00']);
confere('D3 14-20 almoco 12-13', fx(SEG, { horario: dia('14:00', '20:00'), almoco_inicio: '12:00', almoco_fim: '13:00' }), ['14:00–16:00', '16:00–18:00', '18:00–20:00']);
confere('D3 08-17 sem almoco -> ultima 16-17', fx(SEG, { horario: dia('08:00', '17:00') }), ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–17:00']);
confere('D3 08:30-17:00 ancorada na abertura', fx(SEG, { horario: dia('08:30', '17:00') }), ['08:30–10:30', '10:30–12:30', '12:30–14:30', '14:30–16:30', '16:30']);
confere('D3 abre 12:30 com almoco 12-13 -> comeca 13:00', fx(SEG, { horario: dia('12:30', '18:00'), almoco_inicio: '12:00', almoco_fim: '13:00' }), ['13:00–15:00', '15:00–17:00', '17:00–18:00']);
// recepcao (um par para a semana, cortado pelo dia e pelo almoco)
confere('D3 recepcao 08-10 + almoco 12-13 -> so 08-10', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '08:00', recepcao_fim: '10:00', almoco_inicio: '12:00', almoco_fim: '13:00' }), ['08:00–10:00']);
confere('D3 recepcao 11-14 + almoco 12-13 -> duas faixas', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '11:00', recepcao_fim: '14:00', almoco_inicio: '12:00', almoco_fim: '13:00' }), ['11:00–12:00', '13:00–14:00']);
confere('D3 hora fixa 09:00 (09:00-09:30) -> "09:00"', fx(SEG, { horario: dia('08:00', '18:00'), recepcao_inicio: '09:00', recepcao_fim: '09:30' }), ['09:00']);
confere('recepcao 07-19 cortada pelo dia 08-17', fx(SEG, { horario: dia('08:00', '17:00'), recepcao_inicio: '07:00', recepcao_fim: '19:00' }), ['08:00–17:00']);
confere('recepcao 09-13 no sabado 08-12 -> 09-12 (corte)', fx(SAB, { horario: { sab: aberto('08:00', '12:00') }, recepcao_inicio: '09:00', recepcao_fim: '13:00' }), ['09:00–12:00']);
confere('recepcao 13-16 no sabado 08-12 -> nao cruza: grade do dia', fx(SAB, { horario: { sab: aberto('08:00', '12:00') }, recepcao_inicio: '13:00', recepcao_fim: '16:00' }), ['08:00–10:00', '10:00–12:00']);
confere('dia fechado -> nenhuma faixa', fx(SAB, { horario: H }), []);
confere('sem horario (null) -> padrao 006 seg 08-18', fx(SEG, { horario: null }), ['08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00']);
confere('sem horario (null) -> padrao 006 sab 08-12', fx(SAB, { horario: null }), ['08:00–10:00', '10:00–12:00']);
confere('sem horario (null) -> padrao 006 domingo fechado', fx(DOM, { horario: null }), []);
confere('aberto sem horas -> horas do padrao', fx(SEG, { horario: { seg: { aberto: true } } }).length, 5);
confere('horario virado 22-02 -> padrao', fx(SEG, { horario: dia('22:00', '02:00') }).length, 5);
// validacao do perfil
confere('perfil: hora fixa 12:30 dentro do almoco 12-13 -> erro', validarRecepcao({ horario: dia('08:00', '18:00'), recepcao_inicio: '12:30', recepcao_fim: '13:00', almoco_inicio: '12:00', almoco_fim: '13:00' }), 'recepcao_almoco');
confere('perfil: recepcao de 20 min -> curta', validarRecepcao({ horario: H, recepcao_inicio: '09:00', recepcao_fim: '09:20' }), 'recepcao_curta');
confere('perfil: recepcao 19-21 nao cruza nenhum dia -> fora', validarRecepcao({ horario: H, recepcao_inicio: '19:00', recepcao_fim: '21:00' }), 'recepcao_fora');
confere('perfil: recepcao 08-10 ok', validarRecepcao({ horario: H, recepcao_inicio: '08:00', recepcao_fim: '10:00' }), null);
confere('perfil: almoco invertido -> erro', validarRecepcao({ horario: H, almoco_inicio: '13:00', almoco_fim: '12:00' }), 'almoco_invalido');
confere('perfil: so almoco valido -> ok', validarRecepcao({ horario: H, almoco_inicio: '12:00', almoco_fim: '13:00' }), null);
// 5) turno derivado, janela do slot (linha antiga), formato
confere('turno 11:30-13:30 -> manha', turnoDaJanela({ inicio: '11:30', fim: '13:30' }), 'manha');
confere('turno 12:00-14:00 -> tarde', turnoDaJanela({ inicio: '12:00', fim: '14:00' }), 'tarde');
confere('slot antigo manha -> 08-12', janelaDoSlot({ turno: 'manha', hora_inicio: null, hora_fim: null }), { inicio: '08:00', fim: '12:00' });
confere('slot antigo tarde -> 13-17', janelaDoSlot({ turno: 'tarde' }), { inicio: '13:00', fim: '17:00' });
confere('slot novo (time do Postgres)', janelaDoSlot({ turno: 'manha', hora_inicio: '09:30:00', hora_fim: '10:00:00' }), { inicio: '09:30', fim: '10:00' });
confere('formato 30 min = hora', formatarJanela({ inicio: '09:30', fim: '10:00' }), '09:30');
confere('formato 3 h', formatarJanela({ inicio: '09:00', fim: '12:00' }), '09:00–12:00');
// 6) validade da janela e "hoje" (fuso de Tallinn)
confere('janela 14-16 ainda vale as 15:59', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '15:59'), 'EE'), true);
confere('janela 14-16 acabou as 16:00', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '16:00'), 'EE'), false);
confere('janela 14-16 acabou as 16:01', janelaAindaVale(SEG, { inicio: '14:00', fim: '16:00' }, tallinn(SEG, '16:01'), 'EE'), false);
confere('hoje 15:10 -> so 16-18 (as outras acabaram)', faixasValidas(SEG, { horario: dia('08:00', '18:00') }, tallinn(SEG, '15:10'), 'EE').map(formatarJanela), ['14:00–16:00', '16:00–18:00']);
confere('hoje 18:30 -> dia nao escolhivel', diaEscolhivel(SEG, { horario: dia('08:00', '18:00') }, tallinn(SEG, '18:30'), 'EE'), false);
confere('ontem -> nao escolhivel', diaEscolhivel(SEG, { horario: dia('08:00', '18:00') }, tallinn(TER, '09:00'), 'EE'), false);
confere('sabado fechado -> nao escolhivel', diaEscolhivel(SAB, { horario: H }, tallinn(SEG, '09:00'), 'EE'), false);
confere('janela 16-18 acaba logo as 16:30', janelaAcabaLogo(SEG, { inicio: '16:00', fim: '18:00' }, 2, tallinn(SEG, '16:30'), 'EE'), true);
confere('realce do calendario: sex 10:00 (sab/dom fechados) -> segunda', primeiroDiaComFaixa(tallinn(SEX, '10:00'), 'EE', { horario: H }), '2026-11-23');
confere('realce depois da 1a data (ter) -> quarta', primeiroDiaComFaixa(tallinn(SEG, '10:00'), 'EE', { horario: H }, TER), '2026-11-18');
// outro horario (passo 30 min, dentro do dia)
const oh = opcoesOutroHorario(SEX, { horario: H }, tallinn(SEG, '09:00'), 'EE');
confere('outro horario sex 08-12: inicios 08:00..11:30', oh.inicios, ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
confere('outro horario sex: fins depois de 10:30', oh.fins('10:30'), ['11:00', '11:30', '12:00']);
confere('outro horario hoje 10:10 -> 1o inicio 10:00 (09:30-10:00 ja acabou)', opcoesOutroHorario(SEX, { horario: H }, tallinn(SEX, '10:10'), 'EE').inicios[0], '10:00');
confere('outro horario dia fechado -> nada', opcoesOutroHorario(SAB, { horario: H }, tallinn(SEG, '09:00'), 'EE').inicios, []);
// 7) 079: sugestao "dia + turno" -> faixa (2.13)
confere('079 manha -> 1a faixa da manha', janelaDaSugestao(SEG, 'manha', { horario: H }), { inicio: '08:00', fim: '10:00' });
confere('079 tarde -> 1a faixa que comeca >= 12:00', janelaDaSugestao(SEG, 'tarde', { horario: H, almoco_inicio: '12:00', almoco_fim: '13:00' }), { inicio: '13:00', fim: '15:00' });
confere('079 tarde com recepcao 08-10 -> sem faixa na tarde: legado', janelaDaSugestao(SEG, 'tarde', { horario: H, recepcao_inicio: '08:00', recepcao_fim: '10:00' }), { inicio: '13:00', fim: '17:00' });
// 8) fuso / horario de verao (instante gravado na agenda)
confere('DST 29/03/2026 08:00 Tallinn -> 05:00Z (EEST)', instanteDaJanela('2026-03-29', { inicio: '08:00', fim: '10:00' }, 'EE'), { inicio: '2026-03-29T05:00:00.000Z', fim: '2026-03-29T07:00:00.000Z' });
confere('DST 25/10/2026 08:00 Tallinn -> 06:00Z (EET)', instanteDaJanela('2026-10-25', { inicio: '08:00', fim: '10:00' }, 'EE'), { inicio: '2026-10-25T06:00:00.000Z', fim: '2026-10-25T08:00:00.000Z' });
confere('DST 28/03/2026 (vespera) 16:00-18:00 -> 14:00Z-16:00Z (EET)', instanteDaJanela('2026-03-28', { inicio: '16:00', fim: '18:00' }, 'EE'), { inicio: '2026-03-28T14:00:00.000Z', fim: '2026-03-28T16:00:00.000Z' });
confere('17/11/2026 09:00 -> 07:00Z', instanteDaJanela('2026-11-17', { inicio: '09:00', fim: '09:30' }, 'EE').inicio, '2026-11-17T07:00:00.000Z');
confere('agenda: 07:00Z + 09:00Z -> 09:00-11:00 Tallinn', janelaDaAgenda('2026-11-17T07:00:00.000Z', '2026-11-17T09:00:00.000Z', 'EE'), { inicio: '09:00', fim: '11:00' });
confere('agenda verao 29/03: 05:00Z + 07:00Z -> 08:00-10:00', janelaDaAgenda('2026-03-29T05:00:00.000Z', '2026-03-29T07:00:00.000Z', 'EE'), { inicio: '08:00', fim: '10:00' });
confere('agenda antiga 08:00 sem checkin_ate -> 08-12', janelaDaAgenda('2026-11-17T06:00:00.000Z', null, 'EE'), { inicio: '08:00', fim: '12:00' });
confere('agenda antiga hora exata 14:00 -> so a hora', formatarJanela(janelaDaAgenda('2026-11-17T12:00:00.000Z', null, 'EE')), '14:00');
// 9) validade (decisao 4)
confere('validade vazia -> erro', erroValidade('', [SEG], SEG), 'vazia');
confere('validade antes da ultima data -> erro', erroValidade(SEG, [SEG, '2026-11-25'], SEG), 'antes');
confere('validade = ultima data -> ok', erroValidade('2026-11-25', [SEG, '2026-11-25'], SEG), null);
confere('validade no passado (sem datas) -> erro', erroValidade('2026-11-10', [], SEG), 'passado');
confere('validade +7 depois da ultima -> ok', erroValidade(somarDias('2026-11-25', VALIDADE_FOLGA_DIAS), ['2026-11-25'], SEG), null);
confere('maiorData ignora vazios', maiorData(['', '2026-11-20', '2026-11-18', undefined]), '2026-11-20');

// 10) correcoes 15/11 (auditoria Fable + QA do check-in v2)
// D17: sugestao da validade = ultima data valida + 7; dia fechado -> proximo dia aberto; sem data valida -> nada
confere('D17: validade sugerida seg 16 + 7 = seg 23 (aberto)', validadeSugerida(SEG, H), '2026-11-23');
confere('D17: validade sugerida sex 20 + 7 = sex 27 (aberto)', validadeSugerida(SEX, H), '2026-11-27');
confere('D17: sab 14 + 7 = sab 21 fechado -> seg 23', validadeSugerida('2026-11-14', H), '2026-11-23');
confere('D17: folga 8: sab 14 + 8 = dom 22 fechado -> seg 23', validadeSugerida('2026-11-14', H, 8), '2026-11-23');
confere('D17: sem data valida -> sem sugestao', validadeSugerida('', H), '');
confere('D17: sem horario -> padrao 006 (domingo fechado): sab 15 + 7 = dom 22 -> seg 23', validadeSugerida('2026-11-15', null), '2026-11-23');
// D20: faixa invertida tem erro proprio
confere('D20: recepcao 16:00-09:00 -> invertida', validarRecepcao({ horario: H, recepcao_inicio: '16:00', recepcao_fim: '09:00' }), 'recepcao_invertida');
confere('D20: recepcao 09:00-09:00 -> invertida', validarRecepcao({ horario: H, recepcao_inicio: '09:00', recepcao_fim: '09:00' }), 'recepcao_invertida');
confere('D20: recepcao 09:00-09:20 continua curta', validarRecepcao({ horario: H, recepcao_inicio: '09:00', recepcao_fim: '09:20' }), 'recepcao_curta');
// R-10: uma regra so para agenda antiga
confere('R-10: legado 08:00 -> 08-12', janelaLegadaDoInicio('08:00'), { inicio: '08:00', fim: '12:00' });
confere('R-10: legado 13:00 -> 13-17', janelaLegadaDoInicio('13:00'), { inicio: '13:00', fim: '17:00' });
confere('R-10: legado 10:15 -> hora exata', janelaLegadaDoInicio('10:15'), { inicio: '10:15', fim: '10:15' });
// R-05: fim previsto 18:00 do dia da previsao, nunca antes do fim da janela
confere('R-05: previsao ter 17 -> 18:00 Tallinn (16:00Z)', fimPrevistoDoServico(TER, '2026-11-17T09:00:00.000Z', 'EE'), '2026-11-17T16:00:00.000Z');
confere('R-05: janela ate 19:00 no mesmo dia -> fim = 19:00 (nao 18:00)', fimPrevistoDoServico(TER, '2026-11-17T17:00:00.000Z', 'EE'), '2026-11-17T17:00:00.000Z');
// D13: dia e janela separados (a tela poe a janela sem quebra); o texto inteiro continua igual
confere('D13: partesDaAgenda', partesDaAgenda('2026-11-17T07:00:00.000Z', '2026-11-17T09:00:00.000Z', 'EE', 'en-GB'), { dia: 'Tue 17 Nov', janela: '09:00–11:00' });
confere('D13: textoDaAgenda = dia · janela', textoDaAgenda('2026-11-17T07:00:00.000Z', '2026-11-17T09:00:00.000Z', 'EE', 'en-GB'), 'Tue 17 Nov · 09:00–11:00');

console.log(`\n${total - falhas}/${total} ${falhas ? `- ${falhas} FALHA(S)` : 'TUDO OK'}`);
process.exit(falhas ? 1 : 0);
