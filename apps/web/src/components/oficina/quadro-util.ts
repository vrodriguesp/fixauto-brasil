import { diaNaOficina } from '@/lib/fuso';

// Regras do Quadro da oficina (docs/PROJETO_QUADRO_OFICINA_2026-10-09.md):
// estado de cada carro, datas PREVISTAS x REAIS e os tempos do modo
// Monitoramento. Tudo calculado no fuso da oficina.

export type Estado = 'agendado' | 'checkinAtrasado' | 'naOficina' | 'aguardandoPecas' | 'aguardandoCliente' | 'pausado' | 'pronto' | 'falta' | 'entregue';
export type Box = { id: string; nome: string; tipo: 'elevador' | 'box' | 'vaga'; ativo: boolean; ordem: number; capacidade?: number };
export type Ocupacao = { id: string; box_id: string; agenda_id: string; inicio: string; fim: string | null; real: boolean; observacao?: string | null };

export const COR: Record<Estado, string> = {
  agendado: 'bg-blue-600 text-white',
  checkinAtrasado: 'bg-red-600 text-white',
  naOficina: 'bg-green-600 text-white',
  aguardandoPecas: 'bg-amber-500 text-white',
  aguardandoCliente: 'bg-violet-400 text-white',
  pausado: 'bg-slate-400 text-white',
  pronto: 'bg-purple-600 text-white',
  falta: 'bg-orange-400 text-white',
  entregue: 'bg-gray-300 text-gray-700',
};
export const ORDEM_LEGENDA: Estado[] = ['agendado', 'naOficina', 'aguardandoPecas', 'aguardandoCliente', 'pausado', 'pronto', 'checkinAtrasado', 'falta', 'entregue'];
// carro na oficina agora (ocupa lugar)
export const NA_OFICINA: Estado[] = ['naOficina', 'aguardandoPecas', 'aguardandoCliente', 'pausado', 'pronto'];
// etapas em que o carro espera por algo de fora (nao conta como "parado")
const ESPERA = ['aguardando_pecas', 'pausa_pecas', 'pausa_cliente', 'pausa_geral', 'concluido'];

export const somaDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3);

export function etapasOrdenadas(ev: any): { status: string; created_at: string }[] {
  return [...(ev.etapas || [])].sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1));
}

export interface Barra {
  ev: any;
  estado: Estado;
  rotulo: string;
  prevIni: string; prevFim: string; // dias previstos (combinados)
  realIni: string | null; realFim: string | null; // dias reais (check-in -> entrega ou hoje)
  ini: string; fim: string; // barra principal desenhada
  atrasoDesde: string | null; // dia a partir do qual passou da entrega prevista
  difereDoPrevisto: boolean;
  interno: boolean; // servico de balcao (sem pedido da plataforma)
}

export function montarBarra(ev: any, hoje: string, pais: string | null | undefined, rotuloPadrao: string): Barra {
  const dia = (x: string) => diaNaOficina(x, pais);
  const ultima = etapasOrdenadas(ev).slice(-1)[0]?.status;
  const prevIni = dia(ev.data_inicio_prevista || ev.data_inicio);
  let prevFim = dia(ev.data_fim_prevista || ev.data_fim);
  if (prevFim < prevIni) prevFim = prevIni;
  const entrou = ev.status === 'em_andamento' || ev.status === 'concluido';
  const realIni = entrou ? dia(ev.checkin_em || ev.data_inicio) : null;
  let realFim = entrou ? (ev.status === 'concluido' ? dia(ev.entregue_em || ev.data_fim) : hoje) : null;
  if (realIni && realFim && realFim < realIni) realFim = realIni;

  let estado: Estado;
  if (ev.no_show) estado = 'falta';
  else if (ev.status === 'concluido') estado = 'entregue';
  else if (ev.status === 'agendado') estado = prevIni < hoje ? 'checkinAtrasado' : 'agendado';
  else if (ultima === 'concluido') estado = 'pronto';
  else if (ultima === 'aguardando_pecas' || ultima === 'pausa_pecas') estado = 'aguardandoPecas';
  else if (ultima === 'pausa_cliente') estado = 'aguardandoCliente';
  else if (ultima === 'pausa_geral') estado = 'pausado';
  else estado = 'naOficina';

  let ini: string, fim: string;
  if (realIni && realFim) { ini = realIni; fim = realFim; }
  else if (estado === 'checkinAtrasado') { ini = prevIni; fim = prevFim < hoje ? hoje : prevFim; }
  else { ini = prevIni; fim = prevFim; }

  const atrasoDesde = ev.status === 'em_andamento' && hoje > prevFim ? somaDias(prevFim, 1) : null;
  const difereDoPrevisto = !!realIni && (realIni !== prevIni || (ev.status === 'concluido' && realFim !== prevFim));
  const v = ev.solicitacao?.veiculo;
  const rotulo = [v?.placa, v ? `${v.fipe_marca || ''} ${v.fipe_modelo || ''}`.trim() : ev.titulo].filter(Boolean).join(' · ') || ev.titulo || rotuloPadrao;
  return { ev, estado, rotulo, prevIni, prevFim, realIni, realFim, ini, fim, atrasoDesde, difereDoPrevisto, interno: ev.tipo === 'externo' };
}

// ---------- monitoramento (tudo sai dos carimbos ja gravados) ----------
export interface Tempos {
  naOficinaMin: number | null;
  emPostoMin: number;
  esperandoPecasMin: number;
  esperandoClienteMin: number;
  porEtapa: { status: string; min: number }[];
  atrasoEntregaMin: number | null; // entregue - previsto (positivo = atrasou)
  paradoDesde: string | null; // na oficina, fora de posto, sem etapa de espera
}

export function temposDoCarro(ev: any, agora = Date.now()): Tempos {
  const t = (x: string) => new Date(x).getTime();
  const fimReal = ev.entregue_em ? t(ev.entregue_em) : agora;
  const checkin = ev.checkin_em ? t(ev.checkin_em) : null;
  const ocup: Ocupacao[] = (ev.ocupacoes || []).filter((o: Ocupacao) => o.real);
  const emPostoMin = ocup.reduce((s, o) => s + Math.max(0, ((o.fim ? t(o.fim) : agora) - t(o.inicio)) / 60e3), 0);
  const et = etapasOrdenadas(ev);
  const porEtapa = et.map((e, i) => ({ status: e.status, min: Math.max(0, ((i + 1 < et.length ? t(et[i + 1].created_at) : fimReal) - t(e.created_at)) / 60e3) }))
    .filter((e) => e.status !== 'entregue');
  const soma = (sts: string[]) => porEtapa.filter((e) => sts.includes(e.status)).reduce((s, e) => s + e.min, 0);
  const prevFim = ev.data_fim_prevista || ev.data_fim;
  let paradoDesde: string | null = null;
  if (ev.status === 'em_andamento' && !ocup.some((o) => !o.fim) && !ESPERA.includes(et.slice(-1)[0]?.status || '')) {
    const marcos = [ev.checkin_em, et.slice(-1)[0]?.created_at, ...ocup.map((o) => o.fim)].filter(Boolean) as string[];
    paradoDesde = marcos.sort().slice(-1)[0] || null;
  }
  return {
    naOficinaMin: checkin ? Math.max(0, (fimReal - checkin) / 60e3) : null,
    emPostoMin,
    esperandoPecasMin: soma(['aguardando_pecas', 'pausa_pecas']),
    esperandoClienteMin: soma(['pausa_cliente']),
    porEtapa,
    atrasoEntregaMin: ev.entregue_em && prevFim ? (t(ev.entregue_em) - t(prevFim)) / 60e3 : null,
    paradoDesde,
  };
}

/** 95 min -> "1 h 35"; 3 dias -> "3 d 4 h" */
export function duracao(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}
