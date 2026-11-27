import { tipoCompativel, distanciaKm } from '@fixauto/shared';

// Caixa de pedidos da oficina no app - ESPELHO de apps/web/src/lib/caixa-pedidos.ts e da ordem/abas de
// apps/web/src/app/[locale]/oficina/pedidos/page.tsx (mudar la, mudar aqui; teste: scripts/teste-oficina.ts).
// A regra de negocio e uma so: o que a oficina ve, o que esta "para responder" e a ordem dos cartoes.

export const STATUS_PEDIDO_ABERTO = ['aberta', 'em_orcamento'];
export type Aba = 'responder' | 'respondidos' | 'encerrados';
export const ABAS: Aba[] = ['responder', 'respondidos', 'encerrados'];
export type Estado = 'aceito' | 'visto' | 'enviado' | 'entregue' | 'recusado' | 'expirado' | 'perdido' | 'dispensado';

export type OficinaCaixa = { id: string; latitude: number | null; longitude: number | null; raio_atendimento_km?: number | null; especialidades?: readonly string[] | null; pais?: string | null };
export type OrcamentoCaixa = { id?: string; oficina_id: string; status: string; created_at?: string; validade?: string | null; valor_total?: number | null; recusado_motivo?: string | null; disponibilidade?: any[] | null; disponibilidade_escolhida_id?: string | null };
export type PedidoCaixa = {
  id: string; status: string; tipo: string; latitude: number | null; longitude: number | null; created_at: string;
  urgencia?: string | null; emergencia_id?: string | null; descricao?: string | null;
  orcamentos?: OrcamentoCaixa[] | null; convites?: { oficina_id: string; origem?: string | null }[] | null;
};
export type Dispensa = { solicitacao_id: string; motivo: string; comentario: string | null; created_at: string };
export type ItemCaixa = { s: PedidoCaixa; meu?: OrcamentoCaixa; estado?: Estado; disp?: Dispensa };

const MIN = 60e3, H = 60 * MIN;
export const ehAcidente = (s: { emergencia_id?: string | null; descricao?: string | null }) => !!s.emergencia_id || /\[TIPO:/.test(s.descricao || '');

/** A oficina ve o pedido: orcamento aceito dela, convite da BipFix ou especialidade + raio (migracoes 056/085). */
export function oficinaVePedido(s: PedidoCaixa, oficina: OficinaCaixa): boolean {
  if (s.orcamentos?.some((o) => o.oficina_id === oficina.id && o.status === 'aceito')) return true;
  const noRaio = s.latitude != null && oficina.latitude != null &&
    distanciaKm(s.latitude, s.longitude as number, oficina.latitude, oficina.longitude as number) <= (oficina.raio_atendimento_km || 30);
  const especialidade = tipoCompativel(oficina.especialidades, s.tipo);
  const convidada = s.convites?.some((c) => c.oficina_id === oficina.id);
  return !!convidada || (noRaio && especialidade);
}

/** Aba "Para responder": aberto, sem orcamento desta oficina e sem "nao tenho interesse" (070). */
export function paraResponder(s: Pick<PedidoCaixa, 'status' | 'orcamentos'>, oficinaId: string, dispensado: boolean): boolean {
  return !dispensado && STATUS_PEDIDO_ABERTO.includes(s.status) && !(s.orcamentos || []).some((o) => o.oficina_id === oficinaId);
}

/**
 * Separa e ordena os pedidos nas 3 abas, igual ao site: para responder = acidente > urgencia alta > quem
 * espera ha mais tempo (com mais de 48 h vai para o fim); respondidos = aceitos primeiro, depois o orcamento
 * mais recente; encerrados = o mais recente primeiro. `hojeYmd` no fuso da OFICINA (validade do orcamento).
 */
export function agruparPedidos(lista: PedidoCaixa[], oficina: OficinaCaixa, dispensas: Map<string, Dispensa>, hojeYmd: string, agora = Date.now()): Record<Aba, ItemCaixa[]> {
  const g: Record<Aba, ItemCaixa[]> = { responder: [], respondidos: [], encerrados: [] };
  for (const s of lista) {
    if (s.status === 'cancelada' || !oficinaVePedido(s, oficina)) continue;
    const meu = (s.orcamentos || []).find((o) => o.oficina_id === oficina.id);
    const aberto = STATUS_PEDIDO_ABERTO.includes(s.status);
    const disp = dispensas.get(s.id);
    if (paraResponder(s, oficina.id, !!disp)) { g.responder.push({ s }); continue; }
    if (!meu) { if (disp) g.encerrados.push({ s, disp, estado: 'dispensado' }); continue; }
    const vencido = meu.status === 'expirado' || (!!meu.validade && meu.validade < hojeYmd && ['enviado', 'visualizado'].includes(meu.status));
    if (meu.status === 'aceito' && s.status !== 'concluida') g.respondidos.push({ s, meu, estado: 'aceito' });
    else if (meu.status === 'aceito') g.encerrados.push({ s, meu, estado: 'entregue' });
    else if (meu.status === 'recusado') g.encerrados.push({ s, meu, estado: 'recusado' });
    else if (vencido) g.encerrados.push({ s, meu, estado: 'expirado' });
    else if (!aberto) g.encerrados.push({ s, meu, estado: 'perdido' });
    else g.respondidos.push({ s, meu, estado: meu.status === 'visualizado' ? 'visto' : 'enviado' });
  }
  const peso = (s: PedidoCaixa) => (agora - Date.parse(s.created_at) > 48 * H ? 3 : ehAcidente(s) ? 0 : s.urgencia === 'alta' ? 1 : 2);
  g.responder.sort((a, b) => peso(a.s) - peso(b.s) || Date.parse(a.s.created_at) - Date.parse(b.s.created_at));
  g.respondidos.sort((a, b) => (a.estado === 'aceito' ? 0 : 1) - (b.estado === 'aceito' ? 0 : 1) || Date.parse(b.meu!.created_at || '') - Date.parse(a.meu!.created_at || ''));
  g.encerrados.sort((a, b) => Date.parse(b.meu?.created_at || b.disp?.created_at || '') - Date.parse(a.meu?.created_at || a.disp?.created_at || ''));
  return g;
}

/** Contador do cartao "para responder": verde ate 1 h, ambar ate 4 h, vermelho ate 48 h, cinza depois. */
export function corDaEspera(createdAt: string, agora = Date.now()): 'verde' | 'ambar' | 'vermelho' | 'cinza' {
  const ms = agora - Date.parse(createdAt);
  if (ms > 48 * H) return 'cinza';
  if (ms > 4 * H) return 'vermelho';
  if (ms > H) return 'ambar';
  return 'verde';
}

/** minutos/horas/dias de espera, em partes (a tela traduz) */
export function partesDaEspera(ms: number): { d: number; h: number; m: number } {
  const total = Math.max(0, Math.floor(ms / MIN));
  return { d: Math.floor(total / 1440), h: Math.floor((total % 1440) / 60), m: total % 60 };
}

export const distanciaDoPedido = (s: { latitude: number | null; longitude: number | null }, oficina: OficinaCaixa): number | null =>
  oficina.latitude != null && s.latitude != null ? distanciaKm(s.latitude, s.longitude as number, oficina.latitude, oficina.longitude as number) : null;
