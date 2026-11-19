import { supabaseAdmin } from './supabase-admin';
import { contaTeste, interruptorPecasV3Global } from './pecas-v3';
import { MIN_AVALIACOES_PUBLICAS } from './loja-publica-regras';

// Pecas lote 5 (20/11, migracao 105): catalogo v3, promocoes, Shop e "pedir de novo".
// Mapa: Documentos/Analises/Pecas_lote5_2026-11-20/Mapa_lote5.md. SO no servidor (service role).
// Interruptor proprio (padrao false): pecas_shop_ativo (exige tambem pecas_v3_ativo). Itens publicos: fora do lote 5.
// Contas de teste veem antes, e so entre contas de teste (paridade teste/real, como nos lotes 1-4).

export const UNIDADES_P5 = ['un', 'jogo', 'par', 'litro', 'kg', 'metro', 'caixa'] as const;
export const CONDICOES_P5 = ['nova', 'usada', 'recondicionada'] as const;
export const MAX_PROMOCOES_ATIVAS = 50;
export const MAX_DESTAQUES = 3;
export const LIMITE_SHOP = 60;
/** P-14: no Shop, no maximo 3 promocoes por loja (destaques primeiro) */
export const PROMOCOES_POR_LOJA_SHOP = 3;
/** cotacoes de 1 fornecedor abertas por par (oficina, loja) - contra inundar uma loja (auditoria do mapa, achado 7) */
export const MAX_ABERTAS_POR_PAR = 3;
/** o que entra no Shop ('interno' = so a loja ve; padrao dos itens antigos) */
export const VISIVEIS_SHOP = ['oficinas', 'publico'];

async function lerConfig(): Promise<{ shop: boolean }> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('pecas_shop_ativo').eq('id', 1).maybeSingle();
  // sem a coluna (build novo antes da 105): desligado
  if (error) return { shop: false };
  return { shop: !!(data as { pecas_shop_ativo?: boolean } | null)?.pecas_shop_ativo };
}

export async function interruptoresLote5(): Promise<{ shop: boolean; v3: boolean }> {
  const [c, v3] = await Promise.all([lerConfig(), interruptorPecasV3Global()]);
  return { ...c, v3 };
}

/** O Shop (e o "pedir"/"pedir de novo") vale para esta pessoa? (Shop E v3 globais) OU conta de teste */
export async function pecasShopAtivo(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const [{ shop, v3 }, teste] = await Promise.all([interruptoresLote5(), contaTeste(userId)]);
  return (shop && v3) || teste;
}

/** Oficina ATIVA de que a pessoa e DONA (o Shop e o pedido sao so da dona, como criar cotacao hoje). */
export async function oficinaDaDona(userId: string): Promise<{ id: string; pais: string | null; teste: boolean } | null> {
  const { data } = await supabaseAdmin.from('oficinas')
    .select('id, pais, ativa, profile:profiles!oficinas_profile_id_fkey(conta_teste, ativo)')
    .eq('profile_id', userId).eq('ativa', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!data) return null;
  const p = (data as any).profile;
  if (p?.ativo === false) return null;
  return { id: (data as any).id, pais: (data as any).pais, teste: !!p?.conta_teste };
}

export interface LojaShop { id: string; nome: string; cidade: string; nota: number | null; avaliacoes: number }
export interface ItemShop {
  tipo: 'item' | 'promocao';
  id: string;
  nome: string;
  descricao: string | null;
  codigo: string | null;
  especificacao: string | null;
  unidade: string;
  embalagem: string | null;
  condicao: string | null;
  preco: number;
  precoAnterior: number | null;
  validoAte: string | null;
  atualizadoEm: string;
  destaque: boolean;
  loja: LojaShop;
}

const limparBusca = (q: string) => q.replace(/[%_,()\\*"'.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/** Lojas ativas do pais e do mesmo tipo de conta (teste/real), com a nota publica (>= 3 avaliacoes visiveis). */
async function lojasVisiveis(pais: string | null, teste: boolean): Promise<Map<string, LojaShop & { profile_id: string }>> {
  const mapa = new Map<string, LojaShop & { profile_id: string }>();
  if (!pais) return mapa;
  const { data } = await supabaseAdmin.from('lojas_pecas')
    .select('id, profile_id, nome_fantasia, cidade, pais, ativa, profile:profiles(conta_teste, ativo)')
    .eq('ativa', true).eq('pais', pais);
  const lojas = ((data as any[]) || []).filter((l) => l.profile && l.profile.ativo !== false && !!l.profile.conta_teste === teste);
  if (!lojas.length) return mapa;
  const { data: avs } = await supabaseAdmin.from('fornecedores_avaliacoes').select('fornecedor_id, nota')
    .eq('fornecedor_tipo', 'loja').eq('oculta', false).in('fornecedor_id', lojas.map((l) => l.id));
  for (const l of lojas) {
    const notas = ((avs as any[]) || []).filter((a) => a.fornecedor_id === l.id).map((a) => Number(a.nota));
    const nota = notas.length >= MIN_AVALIACOES_PUBLICAS ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
    mapa.set(l.id, { id: l.id, profile_id: l.profile_id, nome: l.nome_fantasia, cidade: l.cidade, nota, avaliacoes: nota === null ? 0 : notas.length });
  }
  return mapa;
}

/** Busca do Shop (servidor). Ordem (Mapa sec. 2): promocoes validas (ate 3 por loja, destaques primeiro), depois itens;
 *  menor preco; mais recente. Nada pago. So itens 'oficinas'/'publico' (nunca 'interno'). */
export async function buscarShop(opts: { pais: string | null; teste: boolean; q?: string; soPromocoes?: boolean }): Promise<ItemShop[]> {
  const lojas = await lojasVisiveis(opts.pais, opts.teste);
  if (!lojas.size) return [];
  const ids = Array.from(lojas.keys());
  const q = limparBusca(opts.q || '');
  const agora = new Date().toISOString();

  let cp = supabaseAdmin.from('promocoes_pecas')
    .select('id, loja_id, item_id, titulo, descricao, preco, unidade, preco_anterior, destaque, valido_ate, updated_at')
    .in('loja_id', ids).in('visibilidade', VISIVEIS_SHOP).eq('oculta', false).lte('valido_de', agora).gt('valido_ate', agora)
    .order('destaque', { ascending: false }).order('preco', { ascending: true }).order('updated_at', { ascending: false }).limit(300);
  if (q) cp = cp.or(`titulo.ilike.%${q}%,descricao.ilike.%${q}%`);
  const consultas: Promise<any>[] = [cp as any];
  if (!opts.soPromocoes) {
    let ci = supabaseAdmin.from('pecas_catalogo')
      .select('id, loja_id, nome, descricao, codigo, especificacao, unidade, embalagem, condicao, preco, atualizado_em')
      .in('loja_id', ids).in('visibilidade', VISIVEIS_SHOP).eq('ativo', true).eq('oculto', false)
      .order('preco', { ascending: true }).order('atualizado_em', { ascending: false }).limit(LIMITE_SHOP);
    if (q) ci = ci.or(`nome.ilike.%${q}%,codigo.ilike.%${q}%,especificacao.ilike.%${q}%,descricao.ilike.%${q}%`);
    consultas.push(ci as any);
  }
  const [rp, ri] = await Promise.all(consultas);
  const loja = (id: string): LojaShop => { const l = lojas.get(id)!; return { id: l.id, nome: l.nome, cidade: l.cidade, nota: l.nota, avaliacoes: l.avaliacoes }; };
  const porLoja = new Map<string, number>();
  const promosBrutas = ((rp?.data as any[]) || []).filter((p) => { const n = (porLoja.get(p.loja_id) || 0) + 1; porLoja.set(p.loja_id, n); return n <= PROMOCOES_POR_LOJA_SHOP; })
    .sort((a, b) => Number(a.preco) - Number(b.preco) || String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, LIMITE_SHOP);
  const promos: ItemShop[] = promosBrutas.map((p) => ({
    tipo: 'promocao', id: p.id, nome: p.titulo, descricao: p.descricao, codigo: null, especificacao: null, unidade: p.unidade, embalagem: null,
    condicao: null, preco: Number(p.preco), precoAnterior: p.preco_anterior == null ? null : Number(p.preco_anterior), validoAte: p.valido_ate,
    atualizadoEm: p.updated_at, destaque: !!p.destaque, loja: loja(p.loja_id),
  }));
  const itens: ItemShop[] = ((ri?.data as any[]) || []).map((i) => ({
    tipo: 'item', id: i.id, nome: i.nome, descricao: i.descricao, codigo: i.codigo, especificacao: i.especificacao, unidade: i.unidade || 'un',
    embalagem: i.embalagem, condicao: i.condicao, preco: Number(i.preco), precoAnterior: null, validoAte: null, atualizadoEm: i.atualizado_em,
    destaque: false, loja: loja(i.loja_id),
  }));
  return [...promos, ...itens];
}
