import { hojeLocal, janelaAindaVale, conflitoHorario, turnoDaJanela, erroValidade, somarDias, maiorData, type HorarioSemana } from './turnos';

// Regras do formulario de orcamento da oficina (app) - as MESMAS do site
// (apps/web/src/app/[locale]/oficina/orcamento/[id]/page.tsx, handleSubmit) e do hook use-orcamentos.
// Funcoes puras: testadas em scripts/teste-oficina.ts sem aparelho.

export type TipoItem = 'mao_de_obra' | 'peca' | 'material' | 'outro';
export const TIPOS_ITEM: TipoItem[] = ['mao_de_obra', 'peca', 'material', 'outro'];
export type ItemForm = { descricao: string; tipo: TipoItem; quantidade: number; valor_unitario: number };
export type SlotForm = { data: string; hora_inicio: string; hora_fim: string };

export type Falta = 'valor' | 'datas' | 'validade';
export type ErrosForm = {
  faltas: Falta[];
  semValor: boolean;
  semCheckin: boolean;
  horarioPassado: boolean;
  diaFechado: boolean;
  validade: 'vazia' | 'passado' | 'antes' | null;
};

export const totalDosItens = (itens: ItemForm[]) => itens.reduce((acc, i) => acc + (Number(i.valor_unitario) || 0) * (Number(i.quantidade) || 0), 0);

/**
 * Valida igual ao site: valor > 0; com as datas visiveis (pedido ainda nao em andamento) pelo menos 1 data,
 * nenhuma ja passada (fuso da oficina) e nenhuma num dia fechado pelo horario do perfil; validade obrigatoria,
 * nunca antes de amanha nem antes da ultima data de check-in. Com o carro ja na oficina so "validade vazia" conta.
 */
export function validarOrcamento(p: { itens: ItemForm[]; slots: SlotForm[]; validade: string; horario: HorarioSemana; pais: string | null | undefined; datasVisiveis: boolean; agora?: Date }): ErrosForm {
  const agora = p.agora ?? new Date();
  const semValor = totalDosItens(p.itens) <= 0;
  const slots = p.slots.filter((s) => s.data);
  const semCheckin = p.datasVisiveis && slots.length === 0;
  const horarioPassado = p.datasVisiveis && slots.some((s) => !janelaAindaVale(s.data, { inicio: s.hora_inicio, fim: s.hora_fim }, agora, p.pais));
  const diaFechado = p.datasVisiveis && slots.some((s) => conflitoHorario(s.data, 'manha', p.horario) === 'fechado');
  const ev = erroValidade(p.validade, p.datasVisiveis ? slots.map((s) => s.data) : [], somarDias(hojeLocal(agora, p.pais), 1));
  const validade = ev && (p.datasVisiveis || ev === 'vazia') ? ev : null;
  const faltas: Falta[] = [];
  if (semValor) faltas.push('valor');
  if (semCheckin || horarioPassado || diaFechado) faltas.push('datas');
  if (validade) faltas.push('validade');
  return { faltas, semValor, semCheckin, horarioPassado, diaFechado, validade };
}

/** validade minima: amanha (dono 21/11, item 7) ou a ultima data de check-in, o que for maior */
export function validadeMinima(slots: SlotForm[], pais: string | null | undefined, agora = new Date()): string {
  const amanha = somarDias(hojeLocal(agora, pais), 1);
  const ultima = maiorData(slots.map((s) => s.data));
  return ultima && ultima > amanha ? ultima : amanha;
}

/** linhas de orcamento_itens: item com valor e sem nome recebe o rotulo do tipo do pedido (caso real 19/11) */
export function itensParaGravar(itens: ItemForm[], nomePadrao: string) {
  return itens
    .filter((i) => (Number(i.valor_unitario) || 0) > 0 || i.descricao.trim())
    .map((i) => ({
      descricao: i.descricao.trim() || nomePadrao,
      tipo: i.tipo,
      valor_unitario: Number(i.valor_unitario) || 0,
      quantidade: Number(i.quantidade) || 1,
      valor_total: (Number(i.valor_unitario) || 0) * (Number(i.quantidade) || 1),
    }));
}

/** linhas de orcamento_disponibilidade: janela gravada no envio, turno derivado, previsao = data + prazo */
export function slotsParaGravar(slots: SlotForm[], prazoDias: number) {
  return slots.filter((s) => s.data).map((s) => ({
    data_checkin: s.data,
    turno: turnoDaJanela({ inicio: s.hora_inicio, fim: s.hora_fim }),
    hora_inicio: s.hora_inicio,
    hora_fim: s.hora_fim,
    data_previsao_entrega: somarDias(s.data, prazoDias),
  }));
}

/** observacoes com o prefixo da comissao, como o site grava: [COMISSAO:<modo>:<pct>] */
export function observacoesComComissao(observacoes: string, modo: 'absorver' | 'repassar', pct: number) {
  return `[COMISSAO:${modo}:${pct}]${observacoes.trim() ? `\n${observacoes.trim()}` : ''}`;
}

/** percentual da comissao sobre o total (2 casas), igual ao COMISSAO_PERCENTUAL do site */
export function percentualComissao(total: number, info: { taxa?: number; tipo?: string; valorFixo?: number } | null): number {
  if (total <= 0) return 0;
  const fixo = info?.tipo === 'valor_fixo' ? Math.min(info.valorFixo || 0, total) : null;
  const valor = fixo != null ? fixo : total * (info ? (info.taxa ?? 0.1) : 0.1);
  return Math.round((valor / total) * 10000) / 100;
}
