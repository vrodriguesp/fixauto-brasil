import { diaNaOficina, horaLocalEmUtc, minutoNaOficina } from '@/lib/fuso';

// Periodos de check-in oferecidos pela oficina: manha 08-12, tarde 13-17
// (mesmos horarios do aceite, da agenda e do que o cliente ve). Para hoje so
// vale o periodo que ainda nao acabou - nunca um periodo ja vencido.
//
// Fuso: com `pais` (o da OFICINA) tudo e calculado no fuso dela - o dono que
// abre a oficina da Estonia estando no Brasil ve o dia/hora de Tallinn, igual
// ao Quadro (auditoria do painel 10/10, A6). Sem `pais` (dado ainda
// carregando) cai no fuso do aparelho, como antes.
export type Turno = 'manha' | 'tarde';
const FIM_TURNO: Record<Turno, number> = { manha: 12, tarde: 17 };
type Pais = string | null | undefined;
const temPais = (pais: Pais) => pais !== undefined;

/** Data de hoje no fuso da oficina (ou do aparelho, sem pais). */
export function hojeLocal(agora = new Date(), pais?: Pais): string {
  if (temPais(pais)) return diaNaOficina(agora, pais);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export function turnoDisponivel(data: string, turno: Turno, agora = new Date(), pais?: Pais): boolean {
  if (!data) return true;
  const hoje = hojeLocal(agora, pais);
  if (data < hoje) return false;
  if (data > hoje) return true;
  const hora = temPais(pais) ? minutoNaOficina(agora, pais) / 60 : agora.getHours();
  return hora < FIM_TURNO[turno];
}

/** Primeiro periodo ainda valido: agora ou o proximo. */
export function primeiroTurnoLivre(agora = new Date(), pais?: Pais): { data: string; turno: Turno } {
  const hoje = hojeLocal(agora, pais);
  if (turnoDisponivel(hoje, 'manha', agora, pais)) return { data: hoje, turno: 'manha' };
  if (turnoDisponivel(hoje, 'tarde', agora, pais)) return { data: hoje, turno: 'tarde' };
  if (temPais(pais)) {
    const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1);
    return { data: d.toISOString().slice(0, 10), turno: 'manha' };
  }
  const amanha = new Date(agora);
  amanha.setDate(amanha.getDate() + 1);
  return { data: hojeLocal(amanha), turno: 'manha' };
}

// Data/hora digitadas pela oficina estao no fuso dela: gravar em UTC de
// verdade e ler de volta no mesmo fuso. Antes gravava "08:00Z" e a agenda
// mostrava 11:00 em Tallinn (auditoria Fable 08/10, M-03).
export function localParaIso(data: string, hora: string, pais?: Pais): string {
  if (temPais(pais)) return horaLocalEmUtc(data, hora, pais);
  return new Date(`${data}T${hora}:00`).toISOString();
}
export function dataLocalDe(iso: string, pais?: Pais): string {
  return hojeLocal(new Date(iso), pais);
}
export function horaLocalDe(iso: string, pais?: Pais): string {
  if (temPais(pais)) { const m = minutoNaOficina(iso, pais); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Horario de funcionamento (oficinas.horario_funcionamento: seg..dom com
// {aberto, inicio, fim}) x periodo de check-in. Caso real 14/11: a oficina
// ofereceu so "sabado a tarde" estando fechada no sabado pelo proprio perfil.
// So avisa (a oficina pode abrir excepcionalmente); sem horario, nada a dizer.
export type HorarioDia = { aberto?: boolean; inicio?: string; fim?: string };
export type HorarioSemana = Record<string, HorarioDia | undefined> | null | undefined;
const INICIO_TURNO: Record<Turno, number> = { manha: 8, tarde: 13 };
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const minutos = (hhmm?: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Horario do dia da semana de `data` ('YYYY-MM-DD', dia de calendario - sem fuso). */
export function horarioDoDia(data: string, horario: HorarioSemana): HorarioDia | undefined {
  if (!data || !horario) return undefined;
  return horario[CHAVE_DIA[new Date(`${data}T12:00:00Z`).getUTCDay()]];
}

/**
 * 'fechado': a oficina nao abre nesse dia; 'turno': abre, mas o horario dela nao
 * cruza o periodo (ex.: fecha as 12 e o periodo e a tarde 13-17); null: tudo certo
 * ou horario nao cadastrado.
 */
export function conflitoHorario(data: string, turno: Turno, horario: HorarioSemana): 'fechado' | 'turno' | null {
  const h = horarioDoDia(data, horario);
  if (!h) return null;
  if (h.aberto === false) return 'fechado';
  const ini = minutos(h.inicio), fim = minutos(h.fim);
  if (ini == null || fim == null || fim <= ini) return null;
  return fim <= INICIO_TURNO[turno] * 60 || ini >= FIM_TURNO[turno] * 60 ? 'turno' : null;
}

/** Periodo de hoje que ainda vale, mas acaba em menos de `horas` (no fuso da oficina). */
export function turnoAcabaLogo(data: string, turno: Turno, horas = 2, agora = new Date(), pais?: Pais): boolean {
  if (!data || data !== hojeLocal(agora, pais) || !turnoDisponivel(data, turno, agora, pais)) return false;
  const min = temPais(pais) ? minutoNaOficina(agora, pais) : agora.getHours() * 60 + agora.getMinutes();
  return FIM_TURNO[turno] * 60 - min < horas * 60;
}

/**
 * Sugestao inicial do formulario do orcamento (dono 14/11): nunca hoje - o primeiro
 * dia DEPOIS de hoje (no fuso da oficina) em que ela abre pelo horario dela, de manha
 * se o horario do dia cobre a manha, senao o primeiro periodo que cabe no horario.
 * Procura ate 14 dias; sem horario cadastrado (ou tudo fechado) fica amanha de manha.
 * A oficina ainda pode escolher hoje a mao.
 */
export function primeiroTurnoAberto(agora = new Date(), pais?: Pais, horario?: HorarioSemana): { data: string; turno: Turno } {
  const somar = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const amanha = somar(hojeLocal(agora, pais), 1);
  if (!horario) return { data: amanha, turno: 'manha' };
  for (let i = 0; i < 14; i++) {
    const data = somar(amanha, i);
    for (const turno of ['manha', 'tarde'] as Turno[]) if (!conflitoHorario(data, turno, horario)) return { data, turno };
  }
  return { data: amanha, turno: 'manha' };
}
