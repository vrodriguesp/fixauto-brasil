// Situacao do pedido para o motorista (auditoria do site 10/10, B3/C1/C2): uma
// frase do que esta acontecendo, uma do que acontece agora e o botao. Usada no
// cartao de acao do Inicio, no cabecalho do pedido e no selo da lista, com as
// mesmas cores em todo lugar (antes: cinza/ambar no app, outras cores no site).
import type { Ionicons } from '@expo/vector-icons';

type Icone = keyof typeof Ionicons.glyphMap;
export type Situacao = {
  chave: 'aguardando' | 'comparar' | 'agendado' | 'naOficina' | 'pronto' | 'entregue' | 'avaliar' | 'cancelado' | 'naoFoi';
  icone: Icone;
  fundo: string; // classe do cartao
  selo: string; // classe do selo (fundo + texto)
  texto: string; // cor do texto principal
  prioridade: number; // maior = vai para o cartao de acao do Inicio
  n?: number; // orcamentos para comparar
  etapa?: string; // ultima etapa no conserto
  dia?: string | null; // dia marcado (ISO)
};

const ATIVOS = ['enviado', 'visualizado'];

export function situacaoDoPedido(s: any, extra: { etapas?: { status: string; created_at: string }[]; agenda?: { status: string; data_inicio?: string | null }[]; avaliado?: boolean } = {}): Situacao {
  const ag = (extra.agenda || s.agenda || []).find((a: any) => a.status !== 'cancelado');
  const etapas = [...(extra.etapas || (s.agenda || []).flatMap((a: any) => a.etapas || []))].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const ultima = etapas[etapas.length - 1]?.status;
  const n = (s.orcamentos || []).filter((o: any) => ATIVOS.includes(o.status)).length;
  switch (s.status) {
    case 'aberta':
    case 'em_orcamento':
      return n > 0
        ? { chave: 'comparar', n, icone: 'pricetags-outline', fundo: 'bg-amber-50 border-amber-300', selo: 'bg-amber-100 text-amber-900', texto: 'text-amber-900', prioridade: 80 }
        : { chave: 'aguardando', icone: 'time-outline', fundo: 'bg-sky-50 border-sky-200', selo: 'bg-sky-100 text-sky-900', texto: 'text-sky-900', prioridade: 20 };
    case 'aceita':
      return { chave: 'agendado', dia: ag?.data_inicio || null, icone: 'calendar-outline', fundo: 'bg-indigo-50 border-indigo-200', selo: 'bg-indigo-100 text-indigo-900', texto: 'text-indigo-900', prioridade: 50 };
    case 'em_andamento':
      return ultima === 'concluido'
        ? { chave: 'pronto', icone: 'checkmark-circle-outline', fundo: 'bg-emerald-50 border-emerald-300', selo: 'bg-emerald-100 text-emerald-900', texto: 'text-emerald-900', prioridade: 90 }
        : { chave: 'naOficina', etapa: ultima, icone: 'construct-outline', fundo: 'bg-orange-50 border-orange-200', selo: 'bg-orange-100 text-orange-900', texto: 'text-orange-900', prioridade: 60 };
    case 'concluida':
      return extra.avaliado === false
        ? { chave: 'avaliar', icone: 'star-outline', fundo: 'bg-yellow-50 border-yellow-300', selo: 'bg-gray-100 text-gray-800', texto: 'text-yellow-900', prioridade: 70 }
        : { chave: 'entregue', icone: 'checkmark-done-outline', fundo: 'bg-gray-50 border-gray-200', selo: 'bg-gray-100 text-gray-800', texto: 'text-gray-800', prioridade: 0 };
    case 'no_show':
      return { chave: 'naoFoi', icone: 'alert-circle-outline', fundo: 'bg-red-50 border-red-200', selo: 'bg-red-100 text-red-900', texto: 'text-red-900', prioridade: 75 };
    default:
      return { chave: 'cancelado', icone: 'close-circle-outline', fundo: 'bg-gray-50 border-gray-200', selo: 'bg-gray-100 text-gray-600', texto: 'text-gray-700', prioridade: 0 };
  }
}
