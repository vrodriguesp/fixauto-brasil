import { supabaseAdmin } from './supabase-admin';
import { contaTeste, pecasV3Ativo } from './pecas-v3';
import { oficinaDaDona } from './pecas-lote5';

// Botao "Pedir peca" na pagina do pedido do motorista (21/11, aprovado pelo dono; migracao 113).
// Mapa: Documentos/Analises/Pecas_botao_pedido_2026-11-21/Mapa.md. SO no servidor (service role).
// Antes o botao aparecia so porque pecas_v3_ativo estava ligado. Agora so aparece se:
//   pecasV3Ativo(U) E (conta de teste OU pecas_botao_pedido_ativo) E lojas ao alcance >= pecas_botao_min_lojas.
// "Ao alcance" = exatamente as lojas que lib/avisar-fornecedores-cotacao.ts avisaria numa cotacao desta
// oficina: lojas_pecas.ativa, mesmo pais da compradora, perfil existe, perfil.ativo !== false e a mesma
// paridade teste/real (conta_teste da dona). A oficina e a da DONA (oficinaDaDona): so a dona cria cotacao
// (RLS cotacoes_pecas_insert da 093) e so a dona dispara o aviso (notificar-fornecedores-cotacao-peca).

export const MIN_LOJAS_PADRAO = 3;
export const MIN_LOJAS_MAX = 50;

export interface ConfigBotaoPedido { ativo: boolean; minLojas: number }

/** Sem as colunas (build novo antes da 113): desligado, minimo 3 (mesmo padrao de interruptorPecasV3Global). */
export async function configBotaoPedido(): Promise<ConfigBotaoPedido> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('pecas_botao_pedido_ativo, pecas_botao_min_lojas').eq('id', 1).maybeSingle();
  if (error || !data) return { ativo: false, minLojas: MIN_LOJAS_PADRAO };
  const d = data as { pecas_botao_pedido_ativo?: boolean; pecas_botao_min_lojas?: number | null };
  const n = Number(d.pecas_botao_min_lojas);
  return { ativo: !!d.pecas_botao_pedido_ativo, minLojas: Number.isInteger(n) && n >= 0 && n <= MIN_LOJAS_MAX ? n : MIN_LOJAS_PADRAO };
}

/** Quantas lojas seriam avisadas numa cotacao de uma oficina deste pais/tipo de conta (contagem, sem N+1). */
export async function lojasAoAlcance(pais: string | null | undefined, teste: boolean): Promise<number> {
  if (!pais) return 0;
  const { count, error } = await supabaseAdmin.from('lojas_pecas')
    .select('id, profile:profiles!inner(conta_teste, ativo)', { count: 'exact', head: true })
    .eq('ativa', true)
    .eq('pais', pais)
    .eq('profile.conta_teste', teste)
    .eq('profile.ativo', true);
  if (error) return 0;
  return count || 0;
}

/** O botao "Pedir peca" do pedido do motorista vale para esta pessoa? Qualquer erro: nao. */
// v3Ja: a resposta de pecasV3Ativo(userId) quando quem chama ja a tem (GET /api/pecas-v3?botao=1)
export async function botaoPedirPecaAtivo(userId: string | null | undefined, v3Ja?: boolean): Promise<boolean> {
  if (!userId || v3Ja === false) return false;
  const [v3, teste, cfg, oficina] = await Promise.all([v3Ja ?? pecasV3Ativo(userId), contaTeste(userId), configBotaoPedido(), oficinaDaDona(userId)]);
  if (!v3 || !(teste || cfg.ativo) || !oficina) return false;
  if (cfg.minLojas === 0) return true;
  return (await lojasAoAlcance(oficina.pais, oficina.teste)) >= cfg.minLojas;
}

/** Admin: lojas ativas REAIS (as que contam para oficinas reais) por pais. */
export async function lojasReaisPorPais(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin.from('lojas_pecas')
    .select('pais, profile:profiles!inner(conta_teste, ativo)')
    .eq('ativa', true)
    .eq('profile.conta_teste', false)
    .eq('profile.ativo', true);
  const por: Record<string, number> = {};
  if (error) return por;
  for (const l of (data as { pais: string | null }[]) || []) {
    // o valor cru (o aviso compara pais = pais da oficina, sem normalizar)
    const p = l.pais || '?';
    por[p] = (por[p] || 0) + 1;
  }
  return por;
}
