// Datas de check-in x horario de funcionamento, sem banco nem servidor (dono 14/11 + auditoria Fable 14/11):
// - conflitoHorario: dia fechado, periodo fora do horario (manha e tarde), sem horario, formatos estranhos
// - primeiroTurnoAberto: nunca hoje; proximo dia em que a oficina abre; manha ou o 1o periodo que cabe
// - turnoAcabaLogo: no fuso da OFICINA (Tallinn), nao no do computador
//
//   npx tsx scripts/teste-turnos.ts
import { conflitoHorario, horarioDoDia, primeiroTurnoAberto, turnoAcabaLogo, type HorarioSemana } from '../src/lib/turnos';

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

console.log(`\n${total - falhas}/${total} ${falhas ? `- ${falhas} FALHA(S)` : 'TUDO OK'}`);
process.exit(falhas ? 1 : 0);
