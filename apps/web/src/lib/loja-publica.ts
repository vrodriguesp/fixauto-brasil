import * as React from 'react';
import { supabaseAdmin } from './supabase-admin';
import {
  MIN_AVALIACOES_PUBLICAS, faltandoParaIndexar, segmentoLoja, type HorarioLoja, type ItemFaltando,
} from './loja-publica-regras';

// Pagina publica da loja de pecas (lote 4, 18/11; migracao 094). SO no servidor (service role), com campos
// escolhidos a dedo: nada de telefone, e-mail, registro, IVA ou dados do dono. Existe quando a loja esta
// ativa, quer a pagina (pagina_publica) e e da Estonia, E o interruptor proprio esta ligado OU o dono e conta
// de teste (sempre noindex). Avaliacoes: so as visiveis, e so com >= 3 (D-2); sem o nome de quem avaliou
// (decisao pendente do dono, Mapa_lote4.md P-1).

export interface AvaliacaoLojaPublica {
  id: string;
  nota: number;
  no_prazo: boolean | null;
  comentario: string | null;
  resposta: string | null;
  criado_em: string;
}

export interface LojaPublica {
  id: string;
  numero: number;
  nome_fantasia: string;
  descricao: string | null;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  categorias: string[];
  marcas: string[];
  horario_funcionamento: HorarioLoja | null;
  entrega: boolean;
  created_at: string;
  segmento: string;
  teste: boolean;
  faltando: ItemFaltando[];
  /** vai ao Google: nao e teste e o perfil esta completo */
  indexavel: boolean;
  /** null com menos de MIN_AVALIACOES_PUBLICAS visiveis */
  resumo: { media: number; total: number; pctNoPrazo: number | null } | null;
  avaliacoes: AvaliacaoLojaPublica[];
}

// `cache` do React so existe no servidor do Next; fora dele (teste do sitemap pelo jiti) vira a propria funcao
const cache: <T extends (...a: any[]) => any>(f: T) => T = (React as any).cache ?? ((f: any) => f);

const CAMPOS = 'id, numero, nome_fantasia, descricao, endereco, cidade, estado, cep, pais, latitude, longitude, categorias, marcas, horario_funcionamento, entrega, created_at, ativa, pagina_publica, profile:profiles(conta_teste)';

/** Interruptor global da pagina publica (sem a coluna = antes da 094: desligado). */
export async function paginaPublicaGlobal(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('plataforma_config').select('lojas_pagina_publica_ativo').eq('id', 1).maybeSingle();
  if (error) return false;
  return !!(data as { lojas_pagina_publica_ativo?: boolean } | null)?.lojas_pagina_publica_ativo;
}

function montar(bruta: any, avs: any[]): LojaPublica {
  const teste = !!bruta.profile?.conta_teste;
  const faltando = faltandoParaIndexar(bruta);
  const visiveis = avs.length >= MIN_AVALIACOES_PUBLICAS ? avs : [];
  const comPrazo = visiveis.filter((a) => a.no_prazo !== null && a.no_prazo !== undefined);
  return {
    id: bruta.id, numero: Number(bruta.numero), nome_fantasia: bruta.nome_fantasia, descricao: bruta.descricao,
    endereco: bruta.endereco, cidade: bruta.cidade, estado: bruta.estado, cep: bruta.cep, pais: bruta.pais,
    latitude: bruta.latitude, longitude: bruta.longitude, categorias: bruta.categorias || [], marcas: bruta.marcas || [],
    horario_funcionamento: bruta.horario_funcionamento, entrega: !!bruta.entrega, created_at: bruta.created_at,
    segmento: segmentoLoja(bruta.nome_fantasia, bruta.numero), teste, faltando, indexavel: !teste && faltando.length === 0,
    resumo: visiveis.length
      ? {
          media: Math.round((visiveis.reduce((s, a) => s + a.nota, 0) / visiveis.length) * 10) / 10,
          total: visiveis.length,
          pctNoPrazo: comPrazo.length ? Math.round((100 * comPrazo.filter((a) => a.no_prazo).length) / comPrazo.length) : null,
        }
      : null,
    avaliacoes: visiveis.slice(0, 20).map((a) => ({ id: a.id, nota: a.nota, no_prazo: a.no_prazo, comentario: a.comentario, resposta: a.resposta, criado_em: a.criado_em })),
  };
}

const podeAparecer = (bruta: any, global: boolean) =>
  !!bruta && bruta.ativa === true && bruta.pagina_publica === true && (!bruta.pais || bruta.pais === 'EE') && (global || !!bruta.profile?.conta_teste);

/** Pagina publica da loja pelo numero; null = 404. `cache`: metadata + pagina buscam 1 vez. */
export const carregarLojaPublica = cache(async (numero: number): Promise<LojaPublica | null> => {
  if (!Number.isSafeInteger(numero) || numero <= 0) return null;
  const [{ data: bruta, error }, global] = await Promise.all([
    supabaseAdmin.from('lojas_pecas').select(CAMPOS).eq('numero', numero).maybeSingle(),
    paginaPublicaGlobal(),
  ]);
  if (error || !podeAparecer(bruta, global)) return null;
  const { data: avs } = await supabaseAdmin.from('fornecedores_avaliacoes')
    .select('id, nota, no_prazo, comentario, resposta, criado_em')
    .eq('fornecedor_tipo', 'loja').eq('fornecedor_id', (bruta as any).id).eq('oculta', false)
    .order('criado_em', { ascending: false });
  return montar(bruta, avs || []);
});

/** Lojas com pagina (para a lista e o sitemap), em ordem alfabetica. */
export const listarLojasPublicas = cache(async (): Promise<LojaPublica[]> => {
  const global = await paginaPublicaGlobal();
  const { data, error } = await supabaseAdmin.from('lojas_pecas').select(CAMPOS).eq('ativa', true).eq('pagina_publica', true);
  if (error || !data) return [];
  const lojas = (data as any[]).filter((b) => podeAparecer(b, global));
  if (!lojas.length) return [];
  const { data: avs } = await supabaseAdmin.from('fornecedores_avaliacoes')
    .select('id, nota, no_prazo, comentario, resposta, criado_em, fornecedor_id')
    .eq('fornecedor_tipo', 'loja').eq('oculta', false).in('fornecedor_id', lojas.map((l) => l.id))
    .order('criado_em', { ascending: false });
  return lojas.map((b) => montar(b, (avs || []).filter((a: any) => a.fornecedor_id === b.id)))
    .sort((a, b) => a.nome_fantasia.localeCompare(b.nome_fantasia, 'et'));
});

/** Estado da pagina para o perfil da loja (dona logada). */
export async function estadoPaginaDaLoja(profileId: string): Promise<{ liberada: boolean; existe: boolean; teste: boolean; indexavel: boolean; faltando: ItemFaltando[]; segmento: string | null; numero: number | null } | null> {
  const { data: bruta } = await supabaseAdmin.from('lojas_pecas').select(CAMPOS).eq('profile_id', profileId).maybeSingle();
  if (!bruta) return null;
  const global = await paginaPublicaGlobal();
  const b = bruta as any;
  const liberada = (global || !!b.profile?.conta_teste) && (!b.pais || b.pais === 'EE');
  const faltando = faltandoParaIndexar(b);
  return {
    liberada,
    existe: podeAparecer(b, global),
    teste: !!b.profile?.conta_teste,
    indexavel: podeAparecer(b, global) && !b.profile?.conta_teste && faltando.length === 0,
    faltando,
    segmento: segmentoLoja(b.nome_fantasia, b.numero),
    numero: Number(b.numero),
  };
}
