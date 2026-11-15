import { NextResponse } from 'next/server';
import type { JaRecebeuConjunto, OficinaAviso } from './avisar-oficinas-pedido';

// Triagem do pedido no admin (Lote 2, migracao 085): o que as 4 rotas de
// /api/admin/solicitacoes/[id]/{tipo,avisar,oficinas,convidar} tem em comum.

/** So pedido aberto muda de tipo, recebe aviso novo ou convite (relatorios por tipo; mapa R14). */
export const STATUS_TRIAGEM = ['aberta', 'em_orcamento'];

/** Convites por chamada (contra erro de clique; mapa 1.6). */
export const MAX_CONVITES_POR_VEZ = 20;

/**
 * Pais do pedido para a lista de oficinas escolhidas (decisao do dono 15/11: so o mesmo pais).
 * Pedido sem pais gravado cai em EE, como o fuso (lib/fuso.ts) e o SMS (lib/sms.ts).
 */
export function paisDoPedido(sol: { pais?: string | null }): { pais: string; gravado: boolean } {
  const p = (sol.pais || '').trim().toUpperCase();
  return p ? { pais: p, gravado: true } : { pais: 'EE', gravado: false };
}
export const mesmoPais = (o: Pick<OficinaAviso, 'pais'>, pais: string) => (o.pais || '').trim().toUpperCase() === pais;

export type EstadoOficina = 'livre' | 'avisada' | 'orcou' | 'dispensou' | 'convidada';

/** Situacao da oficina neste pedido (o acesso mantido ao mudar o tipo conta como "avisada", nao como convite). */
export function estadoDaOficina(o: Pick<OficinaAviso, 'oficina_id' | 'profile_id'>, j: JaRecebeuConjunto): EstadoOficina {
  if (j.orcaram.has(o.oficina_id)) return 'orcou';
  if (j.dispensaram.has(o.oficina_id)) return 'dispensou';
  if (j.convidadas.get(o.oficina_id) === 'admin') return 'convidada';
  if (j.perfisAvisados.has(o.profile_id) || j.convidadas.has(o.oficina_id)) return 'avisada';
  return 'livre';
}

// Um envio por pedido de cada vez (duplo clique, duas abas): sem isso, dois "Confirmar" ao mesmo tempo
// calculariam a mesma lista e avisariam a mesma oficina duas vezes. O site roda num processo so (pm2 fork).
const emAndamento = new Set<string>();
export async function umDeCadaVez(chave: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  if (emAndamento.has(chave)) return NextResponse.json({ error: 'Já existe um envio em andamento para este pedido. Espere e veja de novo.' }, { status: 409 });
  emAndamento.add(chave);
  try { return await fn(); } finally { emAndamento.delete(chave); }
}

export const mesmoConjunto = (a: string[], b: string[]) => {
  const sa = new Set(a), sb = new Set(b);
  return sa.size === sb.size && Array.from(sa).every((x) => sb.has(x));
};
