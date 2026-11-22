import { diaNaOficina, minutoNaOficina, horaLocalEmUtc } from './fuso';
import { janelaDoSlot, slotAindaVale } from './turnos';
import { orcamentoVencido } from './orcamento-validade';

// Regras PURAS dos lembretes ao motorista (115; sem banco - testadas em scripts/teste-lembretes-clientes.ts).
// Decisoes do dono 21-22/11 (Documentos/Analises/Lembretes_2026-11-23/Pronto_para_deploy.md):
//  - so ao motorista; no maximo UM e-mail por tipo por pedido, juntando todos os orcamentos pendentes;
//  - nao_decidiu: D+1 do 1.o orcamento sem nenhuma acao do motorista;
//  - vencem: ~48 h antes de o 1.o orcamento pendente deixar de poder ser aceito (validade ou ultimo horario);
//  - venceram: nenhum orcamento pendente pode mais ser aceito, pedido ainda aberto;
//  - checkin: vespera do check-in agendado;
//  - para quando o motorista age (aceita, recusa todos, pede outra data, escreve a oficina), o pedido fecha
//    ou o motorista pausa pelo link; janela 09:00-20:00 no fuso do pedido (Tallinn); fora dela SEGURA (a
//    passada seguinte dentro da janela manda), nunca descarta;
//  - no maximo UM SMS de lembrete por pedido (no "vencem", so quem marcou "quero SMS" e ainda nao abriu).

export type TipoLembrete = 'nao_decidiu' | 'vencem' | 'venceram' | 'checkin';
export const TIPOS_LEMBRETE: TipoLembrete[] = ['nao_decidiu', 'vencem', 'venceram', 'checkin'];

const H = 3600 * 1000;
export const ABERTOS = ['aberta', 'em_orcamento'];
export const PENDENTES = ['enviado', 'visualizado'];
/** D+1: o 1.o orcamento chegou ha pelo menos isto */
export const NAO_DECIDIU_H = 24;
/** "vencem": quando faltam ate 48 h para o prazo... */
export const VENCEM_ANTES_H = 48;
/** ...e ainda faltam mais de 3 h (menos que isso ja nao ajuda: o e-mail chegaria tarde) */
export const VENCEM_MIN_H = 3;
/** orcamento que acabou de chegar: o e-mail "chegou orcamento" ja avisou */
export const IDADE_MIN_ORC_H = 12;
/** entre dois lembretes por e-mail do mesmo pedido (o "vencem" com prazo em menos de 24 h passa a frente) */
export const ESPACO_H = 20;
/** janela de envio, minutos do dia no fuso do pedido: 09:00 (inclusive) - 20:00 (exclusive) */
export const JANELA_INICIO_MIN = 9 * 60;
export const JANELA_FIM_MIN = 20 * 60;
/** e-mail que falhou (Resend recusou) tenta de novo nas passadas seguintes, ate este total */
export const MAX_TENTATIVAS = 3;

export type SlotLembrete = { data_checkin: string; turno?: string | null; hora_inicio?: string | null; hora_fim?: string | null };
export type OrcLembrete = { id: string; status: string; validade: string | null; created_at: string; pais: string | null; slots: SlotLembrete[] };
export type RegistroLembrete = { tipo: TipoLembrete; canal: 'email' | 'sms'; status: 'enviando' | 'enviado' | 'falhou' | 'pulado'; enviado_em: string | null; tentativas: number };

const somarDia = (ymd: string, n = 1) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** 09:00-20:00 no fuso do pedido (pais do pedido; sem pais = Tallinn) */
export function dentroDaJanela(agora: number, pais: string | null): boolean {
  const m = minutoNaOficina(new Date(agora), pais);
  return m >= JANELA_INICIO_MIN && m < JANELA_FIM_MIN;
}

/** o motorista ainda pode aceitar este orcamento como esta: validade nao passou e ha horario futuro */
export function orcamentoVivo(o: OrcLembrete, agora: number): boolean {
  if (orcamentoVencido(o.validade, o.pais, agora)) return false;
  return o.slots.some((s) => slotAindaVale(s, new Date(agora), o.pais));
}

/**
 * Ate quando o orcamento pode ser aceito: o menor entre o fim do dia da validade (fuso da oficina) e o fim da
 * janela do ULTIMO horario oferecido (depois dele o cartao so oferece "pedir outra data"). 'pela' diz qual dos
 * dois manda (o e-mail mostra a data da validade ou o dia + hora do ultimo horario).
 */
export function prazoDoOrcamento(o: OrcLembrete): { em: number; pela: 'validade' | 'horario'; ultimoSlot: SlotLembrete | null } | null {
  const fimValidade = o.validade ? Date.parse(horaLocalEmUtc(somarDia(String(o.validade).slice(0, 10)), '00:00', o.pais)) : Infinity;
  let fimSlot = -Infinity; let ultimo: SlotLembrete | null = null;
  for (const s of o.slots) {
    const fim = Date.parse(horaLocalEmUtc(s.data_checkin, janelaDoSlot(s).fim, o.pais));
    if (fim > fimSlot) { fimSlot = fim; ultimo = s; }
  }
  if (!ultimo) return Number.isFinite(fimValidade) ? { em: fimValidade, pela: 'validade', ultimoSlot: null } : null;
  return fimValidade <= fimSlot ? { em: fimValidade, pela: 'validade', ultimoSlot: ultimo } : { em: fimSlot, pela: 'horario', ultimoSlot: ultimo };
}

/** tipos ja resolvidos (enviado, pulado, em curso ou falhado sem mais tentativas) - nunca de novo */
export function tiposResolvidos(registros: RegistroLembrete[], canal: 'email' | 'sms' = 'email'): Set<TipoLembrete> {
  return new Set(registros.filter((r) => r.canal === canal && !(r.status === 'falhou' && r.tentativas < MAX_TENTATIVAS)).map((r) => r.tipo));
}

export type DecisaoPedido = {
  tipo: Exclude<TipoLembrete, 'checkin'> | null;
  /** orcamentos que o e-mail lista */
  orcamentos: string[];
  /** tipos que deixam de fazer sentido (gravados como 'pulado' para nunca sairem) */
  pular: { tipo: TipoLembrete; motivo: string }[];
  motivo: string;
};

/** Qual lembrete de decisao (se algum) este pedido recebe agora. A janela de horario e o guarda da conta de teste ficam com quem chama. */
export function decidirPedido(p: {
  agora: number; desde: number; status: string | null; pausado: boolean; agiu: boolean;
  orcamentos: OrcLembrete[]; registros: RegistroLembrete[];
}): DecisaoPedido {
  const nada = (motivo: string, pular: DecisaoPedido['pular'] = []): DecisaoPedido => ({ tipo: null, orcamentos: [], pular, motivo });
  if (!p.status || !ABERTOS.includes(p.status)) return nada('pedido_fechado');
  if (p.orcamentos.some((o) => o.status === 'aceito')) return nada('aceito');
  if (!p.orcamentos.length) return nada('sem_orcamento');
  const primeiro = Math.min(...p.orcamentos.map((o) => Date.parse(o.created_at)));
  // pedido cujo 1.o orcamento e anterior ao deploy (plataforma_config.lembretes_cliente_desde): fora, sem rajada
  if (!(primeiro >= p.desde)) return nada('antigo');
  if (p.pausado) return nada('pausado');
  if (p.agiu) return nada('agiu');
  const pend = p.orcamentos.filter((o) => PENDENTES.includes(o.status));
  if (!pend.length) return nada('sem_pendente'); // recusou todos
  const feito = tiposResolvidos(p.registros);
  const enviados = p.registros.filter((r) => r.canal === 'email' && r.tipo !== 'checkin' && r.status === 'enviado' && r.enviado_em).map((r) => Date.parse(r.enviado_em as string));
  const ultimo = enviados.length ? Math.max(...enviados) : null;
  const espacoOk = ultimo == null || p.agora - ultimo >= ESPACO_H * H;
  const idadeOk = (o: OrcLembrete) => p.agora - Date.parse(o.created_at) >= IDADE_MIN_ORC_H * H;

  const vivos = pend.filter((o) => orcamentoVivo(o, p.agora));
  if (!vivos.length) {
    if (feito.has('venceram')) return nada('ja_enviado');
    // orcamento recem-chegado (ex.: sem horario futuro desde o inicio) nao vira "venceram" no mesmo dia
    if (!pend.every(idadeOk)) return nada('recente');
    if (!espacoOk) return nada('espaco');
    return { tipo: 'venceram', orcamentos: pend.map((o) => o.id), pular: [], motivo: 'devido' };
  }

  const pularNaoDecidiu = !feito.has('nao_decidiu') ? [{ tipo: 'nao_decidiu' as const, motivo: 'coberto_vencem' }] : [];
  // o prazo mais proximo entre os vivos que nao acabaram de chegar
  const prazos = vivos.filter(idadeOk).map((o) => prazoDoOrcamento(o)?.em).filter((x): x is number => x != null && Number.isFinite(x));
  const proximo = prazos.length ? Math.min(...prazos) : null;
  if (!feito.has('vencem') && proximo != null) {
    const falta = proximo - p.agora;
    if (falta <= VENCEM_ANTES_H * H && falta > VENCEM_MIN_H * H) {
      if (!espacoOk && falta > 24 * H) return nada('espaco');
      // "vencem" saiu: "ainda nao decidiu" ja nao acrescenta nada
      return { tipo: 'vencem', orcamentos: vivos.map((o) => o.id), pular: pularNaoDecidiu, motivo: 'devido' };
    }
  }
  if (feito.has('vencem')) return nada(feito.has('nao_decidiu') ? 'nada' : 'coberto', pularNaoDecidiu);
  if (!feito.has('nao_decidiu') && p.agora - primeiro >= NAO_DECIDIU_H * H) {
    if (!espacoOk) return nada('espaco');
    return { tipo: 'nao_decidiu', orcamentos: vivos.map((o) => o.id), pular: [], motivo: 'devido' };
  }
  return nada('nada');
}

/** Vespera do check-in: o dia do check-in (fuso da oficina) e amanha; agendado num dia anterior a hoje. */
export function decidirCheckin(p: {
  agora: number; desde: number; status: string | null; dataInicio: string; criadoEm: string; pais: string | null;
  pausado: boolean; statusPedido: string | null; registros: RegistroLembrete[];
}): { enviar: boolean; motivo: string } {
  if (tiposResolvidos(p.registros).has('checkin')) return { enviar: false, motivo: 'ja_enviado' };
  if (p.status !== 'agendado') return { enviar: false, motivo: 'agenda_inativa' };
  if (['cancelada', 'expirada', 'concluida', 'no_show'].includes(String(p.statusPedido))) return { enviar: false, motivo: 'pedido_fechado' };
  if (!(Date.parse(p.criadoEm) >= p.desde)) return { enviar: false, motivo: 'antigo' };
  if (p.pausado) return { enviar: false, motivo: 'pausado' };
  const hoje = diaNaOficina(new Date(p.agora), p.pais);
  if (diaNaOficina(p.dataInicio, p.pais) !== somarDia(hoje)) return { enviar: false, motivo: 'nao_e_vespera' };
  // marcado hoje para amanha: o e-mail da marcacao acabou de chegar
  if (diaNaOficina(p.criadoEm, p.pais) === hoje) return { enviar: false, motivo: 'agendado_hoje' };
  return { enviar: true, motivo: 'devido' };
}

/** O unico SMS de lembrete do pedido (junto com o e-mail "vencem"). */
export function decidirSmsLembrete(p: {
  smsPedido: boolean | null; telefone: string | null; smsAtivo: boolean; temApp: boolean; abriu: boolean; jaTemSms: boolean;
}): { enviar: boolean; motivo: string } {
  if (p.jaTemSms) return { enviar: false, motivo: 'ja_enviado' };
  // so quem marcou "quero SMS" NESTE pedido (086); pedido antigo sem a caixa (null) nao recebe lembrete por SMS
  if (p.smsPedido !== true) return { enviar: false, motivo: 'sem_sms_no_pedido' };
  if (!p.telefone || !p.telefone.replace(/\D/g, '')) return { enviar: false, motivo: 'sem_telefone' };
  if (!p.smsAtivo) return { enviar: false, motivo: 'sms_desligado' };
  if (p.temApp) return { enviar: false, motivo: 'tem_app' };
  if (p.abriu) return { enviar: false, motivo: 'ja_abriu' };
  return { enviar: true, motivo: 'devido' };
}
