import { supabaseAdmin } from './supabase-admin';
import { MIN_AVALIACOES_PUBLICAS } from './loja-publica-regras';
import type { ItemShop } from './pecas-lote5';

// Pecas lote 5 (20/11, migracao 106): conteudo editavel da pagina do Shop (so o admin edita: /admin/shop-pagina).
// Textos por idioma (fallback: idioma pedido -> en -> et), banner, blocos curtos, SEO e itens em destaque.
// Tudo o que entra passa por limparConteudo (tamanhos, tipos, ids): o JSON gravado e sempre o limpo.

export const IDIOMAS_SHOP = ['et', 'ru', 'en', 'pt', 'pt-PT', 'it'] as const;
export type IdiomaShop = (typeof IDIOMAS_SHOP)[number];
export const MAX_BLOCOS = 4;
export const MAX_DESTAQUES_PAGINA = 12;
export const MAX_VERSOES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CAMINHO_BANNER = /^banners\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export type TextosShop = { titulo?: string; subtitulo?: string; bannerAlt?: string; seoTitulo?: string; seoDescricao?: string; blocos?: { titulo: string; texto: string }[] };
export type ConteudoShop = {
  textos: Partial<Record<IdiomaShop, TextosShop>>;
  banner: string | null;
  destaques: { tipo: 'item' | 'promocao'; id: string }[];
};
export type PaginaResolvida = { titulo: string | null; subtitulo: string | null; bannerAlt: string; seoTitulo: string | null; seoDescricao: string | null; blocos: { titulo: string; texto: string }[]; banner: string | null };

export const CONTEUDO_VAZIO: ConteudoShop = { textos: {}, banner: null, destaques: [] };

// texto puro: sem controle, espacos normalizados (o React escapa na tela; nada de HTML)
const texto = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return s || undefined;
};

/** Limpa e valida o conteudo vindo do editor. Lixo vira vazio; nunca lanca. */
export function limparConteudo(bruto: unknown): ConteudoShop {
  const b = (bruto && typeof bruto === 'object' ? bruto : {}) as any;
  const textos: ConteudoShop['textos'] = {};
  for (const l of IDIOMAS_SHOP) {
    const x = b.textos?.[l];
    if (!x || typeof x !== 'object') continue;
    const blocos = Array.isArray(x.blocos)
      ? x.blocos.slice(0, MAX_BLOCOS).map((bl: any) => ({ titulo: texto(bl?.titulo, 80) || '', texto: texto(bl?.texto, 400) || '' })).filter((bl: any) => bl.titulo || bl.texto)
      : [];
    const t: TextosShop = {
      titulo: texto(x.titulo, 120), subtitulo: texto(x.subtitulo, 300), bannerAlt: texto(x.bannerAlt, 150),
      seoTitulo: texto(x.seoTitulo, 70), seoDescricao: texto(x.seoDescricao, 160), blocos: blocos.length ? blocos : undefined,
    };
    const limpo = Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)) as TextosShop;
    if (Object.keys(limpo).length) textos[l] = limpo;
  }
  const banner = typeof b.banner === 'string' && CAMINHO_BANNER.test(b.banner) ? b.banner : null;
  const vistos = new Set<string>();
  const destaques = (Array.isArray(b.destaques) ? b.destaques : [])
    .filter((d: any) => d && (d.tipo === 'item' || d.tipo === 'promocao') && UUID.test(String(d.id)))
    .filter((d: any) => { const k = `${d.tipo}:${d.id}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, MAX_DESTAQUES_PAGINA)
    .map((d: any) => ({ tipo: d.tipo, id: String(d.id).toLowerCase() }));
  return { textos, banner, destaques };
}

/** Textos para um idioma: cada campo cai para en e depois et quando vazio (pedido do dono: ET/RU primeiro). */
export function resolverIdioma(c: ConteudoShop, locale: string): PaginaResolvida {
  const ordem = [locale, 'en', 'et'].filter((l, i, a) => a.indexOf(l) === i) as IdiomaShop[];
  const campo = <K extends keyof TextosShop>(k: K): TextosShop[K] | undefined => {
    for (const l of ordem) { const v = c.textos[l]?.[k]; if (v !== undefined && (!Array.isArray(v) || v.length)) return v; }
    return undefined;
  };
  return {
    titulo: campo('titulo') || null, subtitulo: campo('subtitulo') || null, bannerAlt: campo('bannerAlt') || '',
    seoTitulo: campo('seoTitulo') || null, seoDescricao: campo('seoDescricao') || null, blocos: campo('blocos') || [], banner: c.banner,
  };
}

/** Versao publicada mais recente (null = nunca publicada: o Shop mostra so os textos padrao). */
export async function conteudoPublicado(): Promise<ConteudoShop | null> {
  const { data, error } = await supabaseAdmin.from('shop_pagina_versoes').select('conteudo').eq('estado', 'publicada')
    .order('publicado_em', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return limparConteudo((data as any).conteudo);
}

/**
 * Itens em destaque resolvidos para quem ve: so os que ainda existem, ativos, nao ocultos, visiveis no Shop,
 * de lojas ativas do pais e do mesmo tipo de conta (paridade). `filtro = null` (preview do admin): sem pais/paridade,
 * mas continua exigindo ativo/nao oculto/visivel - o admin ve o que o visitante veria se fosse da mesma conta.
 */
export async function resolverDestaques(destaques: ConteudoShop['destaques'], filtro: { pais: string | null; teste: boolean } | null): Promise<ItemShop[]> {
  if (!destaques.length) return [];
  const idsItem = destaques.filter((d) => d.tipo === 'item').map((d) => d.id);
  const idsPromo = destaques.filter((d) => d.tipo === 'promocao').map((d) => d.id);
  const agora = new Date().toISOString();
  const [{ data: its }, { data: prs }] = await Promise.all([
    idsItem.length ? supabaseAdmin.from('pecas_catalogo').select('id, loja_id, nome, descricao, codigo, especificacao, unidade, embalagem, condicao, preco, atualizado_em')
      .in('id', idsItem).eq('ativo', true).eq('oculto', false).in('visibilidade', ['oficinas', 'publico']) : Promise.resolve({ data: [] as any[] }),
    idsPromo.length ? supabaseAdmin.from('promocoes_pecas').select('id, loja_id, titulo, descricao, preco, unidade, preco_anterior, destaque, valido_ate, updated_at')
      .in('id', idsPromo).eq('oculta', false).in('visibilidade', ['oficinas', 'publico']).lte('valido_de', agora).gt('valido_ate', agora) : Promise.resolve({ data: [] as any[] }),
  ]);
  const lojaIds = Array.from(new Set([...((its as any[]) || []), ...((prs as any[]) || [])].map((x) => x.loja_id)));
  if (!lojaIds.length) return [];
  const [{ data: lojas }, { data: avs }] = await Promise.all([
    supabaseAdmin.from('lojas_pecas').select('id, nome_fantasia, cidade, pais, ativa, profile:profiles(conta_teste, ativo)').in('id', lojaIds),
    supabaseAdmin.from('fornecedores_avaliacoes').select('fornecedor_id, nota').eq('fornecedor_tipo', 'loja').eq('oculta', false).in('fornecedor_id', lojaIds),
  ]);
  const ok = new Map<string, any>();
  for (const l of (lojas as any[]) || []) {
    if (!l.ativa || l.profile?.ativo === false) continue;
    if (filtro && (!filtro.pais || l.pais !== filtro.pais || !!l.profile?.conta_teste !== filtro.teste)) continue;
    const notas = ((avs as any[]) || []).filter((a) => a.fornecedor_id === l.id).map((a) => Number(a.nota));
    const nota = notas.length >= MIN_AVALIACOES_PUBLICAS ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : null;
    ok.set(l.id, { id: l.id, nome: l.nome_fantasia, cidade: l.cidade, nota, avaliacoes: nota === null ? 0 : notas.length });
  }
  const porChave = new Map<string, ItemShop>();
  for (const i of (its as any[]) || []) if (ok.has(i.loja_id)) porChave.set(`item:${i.id}`, {
    tipo: 'item', id: i.id, nome: i.nome, descricao: i.descricao, codigo: i.codigo, especificacao: i.especificacao, unidade: i.unidade || 'un',
    embalagem: i.embalagem, condicao: i.condicao, preco: Number(i.preco), precoAnterior: null, validoAte: null, atualizadoEm: i.atualizado_em, destaque: true, loja: ok.get(i.loja_id),
  });
  for (const p of (prs as any[]) || []) if (ok.has(p.loja_id)) porChave.set(`promocao:${p.id}`, {
    tipo: 'promocao', id: p.id, nome: p.titulo, descricao: p.descricao, codigo: null, especificacao: null, unidade: p.unidade, embalagem: null, condicao: null,
    preco: Number(p.preco), precoAnterior: p.preco_anterior == null ? null : Number(p.preco_anterior), validoAte: p.valido_ate, atualizadoEm: p.updated_at, destaque: true, loja: ok.get(p.loja_id),
  });
  // a ordem e a do editor
  return destaques.map((d) => porChave.get(`${d.tipo}:${d.id}`)).filter((x): x is ItemShop => !!x);
}
