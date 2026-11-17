import type { SupabaseClient } from '@supabase/supabase-js';
import { tipoCompativel, distanciaKm } from '@fixauto/shared';

// Regras da caixa de pedidos da oficina (oficina/pedidos/page.tsx) num lugar so: a lista, a bolinha
// vermelha da aba "Para responder" e a do menu "Pedidos" (pedidos novos, dono 17/11) contam igual.

export const STATUS_PEDIDO_ABERTO = ['aberta', 'em_orcamento'];

type OficinaCaixa = { id: string; latitude: number | null; longitude: number | null; raio_atendimento_km?: number | null; especialidades?: readonly string[] | null };
type PedidoCaixa = {
  id: string; status: string; tipo: string; latitude: number | null; longitude: number | null;
  orcamentos?: { oficina_id: string; status: string }[] | null; convites?: { oficina_id: string }[] | null;
};

/** A oficina ve o pedido na caixa: orcamento aceito dela, convite da BipFix ou especialidade + raio
 *  (mesma regra do banco, migracoes 056/085). Usado pelo useSolicitacoes({ nearby: true }). */
export function oficinaVePedido(s: PedidoCaixa, oficina: OficinaCaixa): boolean {
  // pedido com orcamento aceito desta oficina aparece sempre
  if (s.orcamentos?.some((o) => o.oficina_id === oficina.id && ['aceito'].includes(o.status))) return true;
  // pedido novo: raio + especialidade
  const noRaio = s.latitude != null && oficina.latitude != null &&
    distanciaKm(s.latitude, s.longitude as number, oficina.latitude, oficina.longitude as number) <= (oficina.raio_atendimento_km || 30);
  const especialidade = tipoCompativel(oficina.especialidades, s.tipo);
  // enviado pela BipFix a esta oficina (migracao 085): o banco ja libera (minha_oficina_atende); sem isto o
  // filtro do navegador escondia a convidada de outro tipo ou fora do raio
  const convidada = s.convites?.some((c) => c.oficina_id === oficina.id);
  return !!convidada || (noRaio && especialidade);
}

/** Pedido na aba "Para responder": aberto, sem orcamento desta oficina e sem "nao tenho interesse" (070). */
export function paraResponder(s: Pick<PedidoCaixa, 'status' | 'orcamentos'>, oficinaId: string, dispensado: boolean): boolean {
  return !dispensado && STATUS_PEDIDO_ABERTO.includes(s.status) && !(s.orcamentos || []).some((o) => o.oficina_id === oficinaId);
}

/** Bolinha vermelha (dono 17/11): pedidos da aba "Para responder" que a oficina ainda nao abriu
 *  (pedido_vistos, gravado ao abrir oficina/pedidos/[id]). Consulta leve, so as colunas da regra;
 *  null = nao deu para contar (fica o numero anterior). */
export async function contarPedidosNovos(sb: SupabaseClient, oficina: OficinaCaixa): Promise<number | null> {
  const { data, error } = await sb.from('solicitacoes')
    .select('id, status, tipo, latitude, longitude, orcamentos(oficina_id, status), convites:pedido_convites(oficina_id)')
    .in('status', STATUS_PEDIDO_ABERTO);
  if (error) return null;
  const ids = ((data || []) as PedidoCaixa[]).filter((s) => oficinaVePedido(s, oficina) && paraResponder(s, oficina.id, false)).map((s) => s.id);
  if (!ids.length) return 0;
  // vistos e dispensas so destes pedidos (a lista inteira da oficina cresce com o tempo); muitos -> todos
  const marcas = (tabela: string) => {
    const q = sb.from(tabela).select('solicitacao_id').eq('oficina_id', oficina.id);
    return ids.length <= 150 ? q.in('solicitacao_id', ids) : q;
  };
  const [vistos, dispensas] = await Promise.all([marcas('pedido_vistos'), marcas('pedido_dispensas')]);
  if (vistos.error || dispensas.error) return null;
  const fora = new Set([...(vistos.data || []), ...(dispensas.data || [])].map((v: { solicitacao_id: string }) => v.solicitacao_id));
  return ids.filter((id) => !fora.has(id)).length;
}
