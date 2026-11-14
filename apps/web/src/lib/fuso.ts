// Hora local da OFICINA (pelo pais) convertida para UTC. Antes gravava-se
// "08:00Z" como se fosse a hora local: em Tallinn a agenda mostrava 11:00 e
// no Brasil 05:00 (auditoria Fable 08/10, M-03).
const FUSO_DO_PAIS: Record<string, string> = {
  EE: 'Europe/Tallinn', BR: 'America/Sao_Paulo', PT: 'Europe/Lisbon', IT: 'Europe/Rome',
  LV: 'Europe/Riga', LT: 'Europe/Vilnius', FI: 'Europe/Helsinki',
};

export const fusoDoPais = (pais?: string | null) => FUSO_DO_PAIS[(pais || '').toUpperCase()] || 'Europe/Tallinn';

// diferenca (minutos) entre a hora local do fuso e o UTC naquele instante
function deslocamento(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante);
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value);
  return (Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second')) - instante.getTime()) / 60000;
}

/** "2026-10-12" + "08:00" na hora local do pais -> ISO em UTC */
export function horaLocalEmUtc(data: string, hora: string, pais?: string | null): string {
  const fuso = fusoDoPais(pais);
  const ingenuo = new Date(`${data}T${hora}:00Z`);
  // duas passagens: acerta tambem perto da troca de horario de verao
  let t = ingenuo.getTime() - deslocamento(ingenuo, fuso) * 60000;
  t = ingenuo.getTime() - deslocamento(new Date(t), fuso) * 60000;
  return new Date(t).toISOString();
}

/**
 * Fim previsto do servico (agenda.data_fim/data_fim_prevista) ao marcar pelo horario oferecido: 18:00 (hora
 * local) do dia da previsao de entrega - a mesma regra no aceite e no reagendar (auditoria Fable R-05; antes o
 * reagendar usava 12:00 para a manha) - e nunca antes do fim da janela de chegada (checkin_ate).
 */
export function fimPrevistoDoServico(diaPrevisao: string, checkinAte: string, pais?: string | null): string {
  const fim = horaLocalEmUtc(diaPrevisao, '18:00', pais);
  return Date.parse(fim) < Date.parse(checkinAte) ? checkinAte : fim;
}

// Dia e hora no fuso da OFICINA (o Quadro nao usa o fuso do navegador: o dono
// pode olhar a oficina de Tallinn estando na Italia ou no Brasil).
function partesNoFuso(instante: Date, fuso: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante);
  const v = (t: string) => p.find((x) => x.type === t)?.value || '00';
  return { ymd: `${v('year')}-${v('month')}-${v('day')}`, h: Number(v('hour')), m: Number(v('minute')) };
}

/** instante -> 'YYYY-MM-DD' no fuso da oficina */
export function diaNaOficina(iso: string | Date, pais?: string | null): string {
  return partesNoFuso(typeof iso === 'string' ? new Date(iso) : iso, fusoDoPais(pais)).ymd;
}

/** instante -> minutos desde a meia-noite no fuso da oficina (0..1439) */
export function minutoNaOficina(iso: string | Date, pais?: string | null): number {
  const { h, m } = partesNoFuso(typeof iso === 'string' ? new Date(iso) : iso, fusoDoPais(pais));
  return h * 60 + m;
}

/** 'YYYY-MM-DD' + minutos do dia (hora local da oficina) -> instante em UTC */
export function instanteNaOficina(ymd: string, minutos: number, pais?: string | null): Date {
  const h = Math.floor(minutos / 60), m = minutos % 60;
  return new Date(horaLocalEmUtc(ymd, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, pais));
}

/**
 * Fim previsto quando o check-in muda de data/hora: anda os mesmos DIAS no
 * fuso da oficina e mantem a hora da entrega (08:00 -> 14:00 no mesmo dia nao
 * pode jogar a entrega das 18:00 para a meia-noite). Se assim ficar antes do
 * novo inicio, o carro fica o mesmo tempo de antes.
 */
export function moverFimPrevisto(fim: string, inicioAntigo: string, inicioNovo: string, pais?: string | null): string {
  const dias = (Date.parse(diaNaOficina(inicioNovo, pais)) - Date.parse(diaNaOficina(inicioAntigo, pais))) / 86400000;
  const diaFim = new Date(Date.parse(diaNaOficina(fim, pais)) + dias * 86400000).toISOString().slice(0, 10);
  const novo = instanteNaOficina(diaFim, minutoNaOficina(fim, pais), pais);
  if (novo.getTime() > new Date(inicioNovo).getTime()) return novo.toISOString();
  return new Date(new Date(inicioNovo).getTime() + (new Date(fim).getTime() - new Date(inicioAntigo).getTime())).toISOString();
}
