import { horaLocalEmUtc } from './fuso';

// Lote 2 de pecas (17/11): e-mails que nao inundam a loja. Hora de Tallinn calculada no
// servidor (o cron da VM corre em UTC, de hora em hora): o horario de verao se resolve sozinho.
// Regras: Fable_auditoria_mapa_lote2.md sec. 4.

// teto fixo de e-mails imediatos ("hoje"/"amanha") por fornecedor por dia de Tallinn; acima vai ao resumo
export const TETO_IMEDIATOS_DIA = 30;
// resumo: 08 = diario (o que ficou da noite/fim de semana); 10-18 = a cada 2 h; so dias uteis
export const HORAS_DO_RESUMO = [8, 10, 12, 14, 16, 18];
export const MAX_COTACOES_POR_RESUMO = 30;

function partesTallinn(agora: number) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Tallinn', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short' }).formatToParts(new Date(agora));
  const v = (t: string) => p.find((x) => x.type === t)?.value || '';
  return { ymd: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')), dia: v('weekday') };
}

/** 'YYYY-MM-DD-HH' (Tallinn) quando e hora de resumo; senao null (outras horas, sabado, domingo) */
export function slotDoResumo(agora = Date.now()): string | null {
  const { ymd, hora, dia } = partesTallinn(agora);
  if (dia === 'Sat' || dia === 'Sun' || !HORAS_DO_RESUMO.includes(hora)) return null;
  return `${ymd}-${String(hora).padStart(2, '0')}`;
}

/** 00:00 de Tallinn do dia de `agora`, em ISO UTC (janela do teto diario) */
export function inicioDoDiaTallinn(agora = Date.now()): string {
  return horaLocalEmUtc(partesTallinn(agora).ymd, '00:00', 'EE');
}
