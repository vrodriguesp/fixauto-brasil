import { diaNaOficina, minutoNaOficina, horaLocalEmUtc, fusoDoPais } from './fuso';

// Periodos de check-in oferecidos pela oficina: manha 08-12, tarde 13-17
// (mesmos horarios do aceite, da agenda e do que o cliente ve). Para hoje so
// vale o periodo que ainda nao acabou - nunca um periodo ja vencido.
//
// Fuso (revisao Fable 079, M3; igual ao site apps/web/src/lib/turnos.ts): com `pais` (o da OFICINA)
// tudo e calculado no fuso dela - o motorista com o telefone em outro fuso ve os mesmos turnos que o
// servidor aceita. Sem `pais` cai no fuso do aparelho, como antes.
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

// Hora digitada pela oficina esta no fuso dela: instante em UTC de verdade e leitura de volta no mesmo fuso
// (iguais ao site apps/web/src/lib/turnos.ts).
export function localParaIso(data: string, hora: string, pais?: Pais): string {
  if (temPais(pais)) return horaLocalEmUtc(data, hora, pais);
  return new Date(`${data}T${hora}:00`).toISOString();
}
export function horaLocalDe(iso: string, pais?: Pais): string {
  const p = (n: number) => String(n).padStart(2, '0');
  if (temPais(pais)) { const m = minutoNaOficina(new Date(iso), pais); return `${p(Math.floor(m / 60))}:${p(m % 60)}`; }
  const d = new Date(iso);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================================================================================
// Check-in v2 (migracao 082): espelho das funcoes puras do site apps/web/src/lib/turnos.ts - mudar la, mudar
// aqui (teste: apps/mobile/scripts/teste-turnos.ts). Cada horario oferecido e uma JANELA de chegada
// 'HH:MM'-'HH:MM' no dia de calendario da oficina:
//  - gravada no envio (hora_inicio/hora_fim), nunca recalculada; linha antiga (nula) = 08-12 / 13-17;
//  - vale ate o FIM da janela (fuso da oficina);
//  - depois do aceite a fonte e a agenda: data_inicio + checkin_ate;
//  - 079: o motorista sugere dia + manha/tarde e a oficina confirma a 1a faixa do perfil nesse turno.
// Conta em minutos do dia ('HH:MM'), sem Date; instante so via localParaIso.
// ============================================================================================
export type HorarioDia = { aberto?: boolean; inicio?: string; fim?: string };
export type HorarioSemana = Record<string, HorarioDia | undefined> | null | undefined;
export type Janela = { inicio: string; fim: string };
export type ContextoOficina = {
  horario?: HorarioSemana;
  recepcao_inicio?: string | null; recepcao_fim?: string | null;
  almoco_inicio?: string | null; almoco_fim?: string | null;
};
export const JANELA_MIN = 30;
export const PASSO_FAIXA = 120;
const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const minutos = (h?: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** DEFAULT da migracao 006 (perfil sem horario ou com JSON estragado) */
export const HORARIO_PADRAO: Record<string, HorarioDia> = {
  seg: { aberto: true, inicio: '08:00', fim: '18:00' }, ter: { aberto: true, inicio: '08:00', fim: '18:00' },
  qua: { aberto: true, inicio: '08:00', fim: '18:00' }, qui: { aberto: true, inicio: '08:00', fim: '18:00' },
  sex: { aberto: true, inicio: '08:00', fim: '18:00' }, sab: { aberto: true, inicio: '08:00', fim: '12:00' },
  dom: { aberto: false, inicio: '', fim: '' },
};
/** o que o motorista sempre viu para linhas antigas (sem hora gravada) */
export const LEGADO: Record<Turno, Janela> = { manha: { inicio: '08:00', fim: '12:00' }, tarde: { inicio: '13:00', fim: '17:00' } };
const p2 = (n: number) => String(n).padStart(2, '0');
export const hhmm = (m: number) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
/** 'HH:MM:SS' (Postgres time) -> 'HH:MM' */
export const horaCurta = (h?: string | null) => (h ? String(h).slice(0, 5) : '');
export const minutosDe = minutos;

/** Abertura/fechamento do dia (minutos) pelo perfil; null = fechado. Sem horario/estragado -> HORARIO_PADRAO. */
export function expedienteDoDia(data: string, horario: HorarioSemana): { ab: number; fe: number } | null {
  if (!data) return null;
  const chave = CHAVE_DIA[new Date(`${data}T12:00:00Z`).getUTCDay()];
  const horas = (x?: HorarioDia) => { const a = minutos(x?.inicio), f = minutos(x?.fim); return a != null && f != null && f > a ? { ab: a, fe: f } : null; };
  const h = horario && typeof horario === 'object' ? horario[chave] : undefined;
  if (h && typeof h === 'object') {
    if (h.aberto === false) return null;
    const r = horas(h);
    if (r) return r;
    // "aberto" sem horas (ou horas viradas): horas do padrao, ou 08-18 se o padrao fecha nesse dia
    if (h.aberto === true) return horas(HORARIO_PADRAO[chave]) || { ab: 480, fe: 1080 };
  }
  const p = HORARIO_PADRAO[chave];
  return p.aberto === false ? null : horas(p);
}

const parValido = (ini?: string | null, fim?: string | null, min = 1): [number, number] | null => {
  const a = minutos(ini || ''), b = minutos(fim || '');
  return a != null && b != null && b - a >= min ? [a, b] : null;
};
const tirar = (seg: [number, number], corte: [number, number] | null): [number, number][] => {
  if (!corte) return [seg];
  const [a, b] = seg, [c, d] = corte;
  if (d <= a || c >= b) return [seg];
  const out: [number, number][] = [];
  if (c > a) out.push([a, c]);
  if (d < b) out.push([d, b]);
  return out;
};
const janelaDe = ([a, b]: [number, number]): Janela => ({ inicio: hhmm(a), fim: hhmm(b) });

/** Recepcao do perfil cortada pelo horario do dia e pelo almoco (null = a recepcao nao vale nesse dia). */
function pedacosDaRecepcao(e: { ab: number; fe: number }, ctx: ContextoOficina | null | undefined): [number, number][] | null {
  const rec = parValido(ctx?.recepcao_inicio, ctx?.recepcao_fim, JANELA_MIN);
  if (!rec) return null;
  const a = Math.max(rec[0], e.ab), b = Math.min(rec[1], e.fe);
  if (b - a < JANELA_MIN) return null;
  const pedacos = tirar([a, b], parValido(ctx?.almoco_inicio, ctx?.almoco_fim)).filter(([x, y]) => y - x >= JANELA_MIN);
  return pedacos.length ? pedacos : null;
}

/**
 * Faixas oferecidas num dia: recepcao do perfil (cortada pelo dia e pelo almoco) ou grade de 2 h
 * ancorada na abertura, pulando o almoco; pedacos < 30 min caem; dia fechado = [].
 */
export function faixasDoDia(data: string, ctx: ContextoOficina | null | undefined): Janela[] {
  const e = expedienteDoDia(data, ctx?.horario);
  if (!e) return [];
  const rec = pedacosDaRecepcao(e, ctx);
  if (rec) return rec.map(janelaDe);
  const out: Janela[] = [];
  for (const [s, f] of tirar([e.ab, e.fe], parValido(ctx?.almoco_inicio, ctx?.almoco_fim))) {
    for (let i = s; i < f; i += PASSO_FAIXA) {
      const fim = Math.min(i + PASSO_FAIXA, f);
      if (fim - i >= JANELA_MIN) out.push(janelaDe([i, fim]));
    }
  }
  return out;
}

/** 'manha' se a janela comeca antes do meio-dia (turno derivado) */
export const turnoDaJanela = (j: Janela): Turno => (j.inicio < '12:00' ? 'manha' : 'tarde');

/** Janela gravada no horario oferecido; linha antiga (sem horas) = 08-12 / 13-17. */
export function janelaDoSlot(s: { turno?: string | null; hora_inicio?: string | null; hora_fim?: string | null }): Janela {
  if (s.hora_inicio && s.hora_fim) return { inicio: horaCurta(s.hora_inicio), fim: horaCurta(s.hora_fim) };
  return LEGADO[s.turno === 'tarde' ? 'tarde' : 'manha'];
}

/** "09:00–11:00"; janela de 30 min ou menos = so a hora ("09:00") */
export function formatarJanela(j: Janela | null | undefined): string {
  if (!j) return '';
  const a = minutos(j.inicio), b = minutos(j.fim);
  if (a == null) return '';
  if (b == null || b - a <= JANELA_MIN) return hhmm(a);
  return `${hhmm(a)}–${hhmm(b)}`;
}

/** instantes (UTC) do inicio e do fim da janela no fuso da oficina */
export function instanteDaJanela(data: string, j: Janela, pais?: Pais): { inicio: string; fim: string } {
  return { inicio: localParaIso(data, j.inicio, pais), fim: localParaIso(data, j.fim, pais) };
}

/** a janela ainda nao acabou (o motorista ainda pode aceitar ate o fim dela) */
export function janelaAindaVale(data: string, j: Janela, agora = new Date(), pais?: Pais): boolean {
  if (!data) return true;
  return Date.parse(localParaIso(data, j.fim, pais)) > agora.getTime();
}
export const slotAindaVale = (s: { data_checkin: string; turno?: string | null; hora_inicio?: string | null; hora_fim?: string | null }, agora = new Date(), pais?: Pais) =>
  janelaAindaVale(s.data_checkin, janelaDoSlot(s), agora, pais);

/** 079: o motorista sugere "dia + manha/tarde"; a oficina confirma -> a 1a faixa do perfil/grade nesse turno */
export function janelaDaSugestao(data: string, turno: Turno, ctx: ContextoOficina | null | undefined): Janela {
  return faixasDoDia(data, ctx).find((j) => turnoDaJanela(j) === turno) || LEGADO[turno];
}

/**
 * Janela de chegada depois do aceite (agenda): data_inicio + checkin_ate no fuso da oficina. Agenda antiga
 * (sem checkin_ate): 08:00/13:00 eram o inicio do periodo -> 08-12 / 13-17; outra hora = hora exata.
 */
export function janelaDaAgenda(dataInicio: string, checkinAte: string | null | undefined, pais?: Pais): Janela {
  const ini = horaLocalDe(dataInicio, pais);
  if (checkinAte) return { inicio: ini, fim: horaLocalDe(checkinAte, pais) };
  if (ini === LEGADO.manha.inicio) return LEGADO.manha;
  if (ini === LEGADO.tarde.inicio) return LEGADO.tarde;
  return { inicio: ini, fim: ini };
}

/** agenda (depois do aceite): dia no fuso da oficina + janela ("ter, 17 nov · 09:00–11:00") */
export const textoDaAgenda = (dataInicio: string, checkinAte: string | null | undefined, pais: Pais, intl: string, sep = ' · ') =>
  `${new Date(dataInicio).toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: fusoDoPais(pais) })}${sep}${formatarJanela(janelaDaAgenda(dataInicio, checkinAte, pais))}`;
