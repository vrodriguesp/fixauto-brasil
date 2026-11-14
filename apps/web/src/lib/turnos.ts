import { diaNaOficina, horaLocalEmUtc, minutoNaOficina, fusoDoPais } from '@/lib/fuso';

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

// ============================================================================================
// Check-in v2 (decisoes finais do dono 14/11 noite - Documentos/Analises/Checkin_v2_decisoes_finais_2026-11-14.md;
// spec Fable v2 secao D; migracao 082). Cada horario oferecido e uma JANELA de chegada 'HH:MM'-'HH:MM' no dia
// de calendario da oficina:
//  - faixas padrao de 2 h da abertura ao fechamento, pulando o almoco do perfil; pedaco < 30 min cai;
//  - recepcao de carros do perfil (um par para a semana, faixa ou hora fixa = +30 min) cortada pelo horario
//    do dia e pelo almoco; se nao cruza o dia, vale a grade de 2 h desse dia;
//  - o tempo de execucao NAO limita nada (D2);
//  - gravada no envio (hora_inicio/hora_fim), nunca recalculada; linha antiga (nula) = 08-12 / 13-17;
//  - depois do aceite a fonte e a agenda: data_inicio + checkin_ate.
// Toda a conta e em minutos do dia ('HH:MM'), sem Date; instante so via localParaIso (fuso da oficina).
// ============================================================================================
export type Janela = { inicio: string; fim: string };
export type ContextoOficina = {
  horario?: HorarioSemana;
  recepcao_inicio?: string | null; recepcao_fim?: string | null;
  almoco_inicio?: string | null; almoco_fim?: string | null;
};
export const JANELA_MIN = 30;
export const PASSO_FAIXA = 120;
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
const somarDiasYmd = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export { somarDiasYmd as somarDias };

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
 * Faixas oferecidas num dia (D.3): recepcao do perfil (cortada pelo dia e pelo almoco) ou grade de 2 h
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

/** a recepcao do perfil vale em algum dia aberto? (validacao ao salvar o perfil) */
export function validarRecepcao(ctx: ContextoOficina): 'recepcao_curta' | 'recepcao_invertida' | 'recepcao_fora' | 'recepcao_almoco' | 'almoco_invalido' | null {
  const temAlmoco = !!(ctx.almoco_inicio || ctx.almoco_fim);
  if (temAlmoco && !parValido(ctx.almoco_inicio, ctx.almoco_fim, 15)) return 'almoco_invalido';
  if (!ctx.recepcao_inicio && !ctx.recepcao_fim) return null;
  // fim antes (ou igual) do inicio, ex. 16:00-09:00: "o fim precisa ser depois do inicio" (QA D20; antes "minimo 30 min")
  const ri = minutos(ctx.recepcao_inicio || ''), rf = minutos(ctx.recepcao_fim || '');
  if (ri != null && rf != null && rf <= ri) return 'recepcao_invertida';
  if (!parValido(ctx.recepcao_inicio, ctx.recepcao_fim, JANELA_MIN)) return 'recepcao_curta';
  let cruza = false;
  for (let i = 0; i < 7; i++) {
    const data = somarDiasYmd('2026-11-16', i); // uma semana qualquer, seg..dom
    const e = expedienteDoDia(data, ctx.horario);
    if (!e) continue;
    const rec = parValido(ctx.recepcao_inicio, ctx.recepcao_fim, JANELA_MIN)!;
    if (Math.min(rec[1], e.fe) - Math.max(rec[0], e.ab) < JANELA_MIN) continue;
    cruza = true;
    if (pedacosDaRecepcao(e, ctx)) return null;
  }
  return cruza ? 'recepcao_almoco' : 'recepcao_fora';
}

/** 'manha' se a janela comeca antes do meio-dia (turno derivado: app antigo, e2e, sugestoes do 079) */
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

/** janela de hoje que ainda vale, mas acaba em menos de `horas` */
export function janelaAcabaLogo(data: string, j: Janela, horas = 2, agora = new Date(), pais?: Pais): boolean {
  if (!data || data !== hojeLocal(agora, pais) || !janelaAindaVale(data, j, agora, pais)) return false;
  return Date.parse(localParaIso(data, j.fim, pais)) - agora.getTime() < horas * 3600e3;
}

/** faixas do dia que ainda valem (hoje: so as que nao acabaram; passado: nenhuma) */
export function faixasValidas(data: string, ctx: ContextoOficina | null | undefined, agora = new Date(), pais?: Pais): Janela[] {
  if (!data || data < hojeLocal(agora, pais)) return [];
  return faixasDoDia(data, ctx).filter((j) => janelaAindaVale(data, j, agora, pais));
}

/** dia escolhivel no mini calendario (D.5): nao passado e com pelo menos uma faixa valida */
export const diaEscolhivel = (data: string, ctx: ContextoOficina | null | undefined, agora = new Date(), pais?: Pais) =>
  faixasValidas(data, ctx, agora, pais).length > 0;

/** primeiro dia DEPOIS de hoje com faixa (realce do calendario; nunca e pre-selecionado) */
export function primeiroDiaComFaixa(agora = new Date(), pais?: Pais, ctx?: ContextoOficina | null, depoisDe?: string): string {
  const base = depoisDe && depoisDe >= hojeLocal(agora, pais) ? depoisDe : hojeLocal(agora, pais);
  for (let i = 1; i <= 60; i++) { const d = somarDiasYmd(base, i); if (faixasDoDia(d, ctx).length) return d; }
  return somarDiasYmd(base, 1);
}

/**
 * Opcoes do "Outro horario" (passo 30 min, dentro do expediente do dia, inicio ancorado na abertura):
 * inicios possiveis e, para um inicio, os fins (>= inicio + 30). Hoje: so o que ainda nao acabou.
 */
export function opcoesOutroHorario(data: string, ctx: ContextoOficina | null | undefined, agora = new Date(), pais?: Pais): { inicios: string[]; fins: (inicio: string) => string[] } {
  const e = expedienteDoDia(data, ctx?.horario);
  if (!e || !data || data < hojeLocal(agora, pais)) return { inicios: [], fins: () => [] };
  const vale = (m: number) => janelaAindaVale(data, { inicio: hhmm(m), fim: hhmm(m) }, agora, pais);
  const inicios: string[] = [];
  for (let m = e.ab; m + JANELA_MIN <= e.fe; m += JANELA_MIN) if (vale(m + JANELA_MIN)) inicios.push(hhmm(m));
  const fins = (inicio: string) => {
    const a = minutos(inicio); if (a == null) return [];
    const out: string[] = [];
    for (let m = a + JANELA_MIN; m <= e.fe; m += JANELA_MIN) out.push(hhmm(m));
    if (out.length && minutos(out[out.length - 1])! < e.fe && e.fe - a >= JANELA_MIN) out.push(hhmm(e.fe));
    return out;
  };
  return { inicios, fins };
}

/** 079: o motorista sugere "dia + manha/tarde"; a oficina confirma -> a 1a faixa do perfil/grade nesse turno (2.13) */
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
  return janelaLegadaDoInicio(ini);
}
/** agenda antiga sem checkin_ate, pela hora local de inicio: 08:00 -> 08-12, 13:00 -> 13-17, outra = hora exata */
export function janelaLegadaDoInicio(ini: string): Janela {
  if (ini === LEGADO.manha.inicio) return LEGADO.manha;
  if (ini === LEGADO.tarde.inicio) return LEGADO.tarde;
  return { inicio: ini, fim: ini };
}

// ---------- textos de tela (mesma forma em todo lugar: "ter, 17 nov · 09:00–11:00") ----------
type OpcDia = Intl.DateTimeFormatOptions;
const DIA_CURTO: OpcDia = { weekday: 'short', day: 'numeric', month: 'short' };
/** dia de calendario 'YYYY-MM-DD' (sem fuso) no idioma da tela */
export const diaDoCalendario = (ymd: string, intl: string, opc: OpcDia = DIA_CURTO) =>
  ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString(intl, { ...opc, timeZone: 'UTC' }) : '';
/** horario oferecido (antes do aceite): dia + janela gravada */
export const textoDoSlot = (s: { data_checkin: string; turno?: string | null; hora_inicio?: string | null; hora_fim?: string | null }, intl: string, opc: OpcDia = DIA_CURTO, sep = ' · ') =>
  `${diaDoCalendario(s.data_checkin, intl, opc)}${sep}${formatarJanela(janelaDoSlot(s))}`;
/** agenda (depois do aceite): dia no fuso da oficina + janela data_inicio..checkin_ate */
export const textoDaAgenda = (dataInicio: string, checkinAte: string | null | undefined, pais: Pais, intl: string, opc: OpcDia = DIA_CURTO, sep = ' · ') => {
  const p = partesDaAgenda(dataInicio, checkinAte, pais, intl, opc);
  return `${p.dia}${sep}${p.janela}`;
};
/** dia e janela separados (a tela poe a janela num span sem quebra: "08:00–" / "10:00" nunca - QA D13) */
export const partesDaAgenda = (dataInicio: string, checkinAte: string | null | undefined, pais: Pais, intl: string, opc: OpcDia = DIA_CURTO) =>
  ({ dia: new Date(dataInicio).toLocaleDateString(intl, { ...opc, timeZone: fusoDoPais(pais) }), janela: formatarJanela(janelaDaAgenda(dataInicio, checkinAte, pais)) });

// ---------- validade do orcamento (decisao 4: obrigatoria, >= ultima data de check-in) ----------
export const maiorData = (datas: (string | null | undefined)[]) => datas.filter((d): d is string => !!d).sort().at(-1) || '';
/** dias recomendados depois da ultima data de check-in (texto do erro da validade) */
export const VALIDADE_FOLGA_DIAS = 7;
/**
 * Sugestao do botao "Usar <data>" da validade (QA D17): a ultima data de check-in VALIDA (futura e num dia
 * aberto) + 7 dias; se cair num dia fechado, o proximo dia aberto. Sem data valida = sem sugestao.
 */
export function validadeSugerida(ultimaValida: string, horario: HorarioSemana, folga = VALIDADE_FOLGA_DIAS): string {
  if (!ultimaValida) return '';
  let d = somarDiasYmd(ultimaValida, folga);
  for (let i = 0; i < 14 && !expedienteDoDia(d, horario); i++) d = somarDiasYmd(d, 1);
  return d;
}
export function erroValidade(validade: string, datas: string[], hoje: string): 'vazia' | 'passado' | 'antes' | null {
  if (!validade) return 'vazia';
  const m = maiorData(datas);
  if (m && validade < m) return 'antes';
  if (validade < hoje) return 'passado';
  return null;
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
