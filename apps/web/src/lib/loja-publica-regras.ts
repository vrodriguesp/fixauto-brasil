// Regras da pagina publica da loja de pecas (lote 4, 18/11; migracao 097, era 094).
// Sem nada de servidor: usado tambem pelo perfil da loja (lista do que falta).
// Mapa: Documentos/Analises/Pecas_lote4_2026-11-18/Mapa_lote4.md

/** Lojas so existem na Estonia: a pagina publica so responde nestes idiomas. */
export const LOCALES_LOJA = ['et', 'ru', 'en'] as const;
export const ehLocaleLoja = (l: string): l is (typeof LOCALES_LOJA)[number] => (LOCALES_LOJA as readonly string[]).includes(l);

/** D-2: avaliacoes de fornecedor so vao a visitantes a partir de 3 visiveis (mesma regra do fornecedor_resumo). */
export const MIN_AVALIACOES_PUBLICAS = 3;
export const MIN_DESCRICAO_INDEXAR = 80;
export const MAX_DESCRICAO = 600;
export const MAX_MARCAS = 30;

/** Lista fechada (o texto de cada uma vem das mensagens: lojaPublica.categoria.<chave>). */
export const CATEGORIAS_LOJA = [
  'motor', 'transmissao', 'freios', 'suspensao', 'eletrica', 'iluminacao',
  'arrefecimento', 'escape', 'carroceria', 'filtros_oleo', 'pneus_rodas', 'usadas',
] as const;
export type CategoriaLoja = (typeof CATEGORIAS_LOJA)[number];

export const DIAS_LOJA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const;
export type HorarioLoja = Partial<Record<(typeof DIAS_LOJA)[number], { aberto: boolean; inicio: string; fim: string }>>;

/** "Kiili Autoosad OÜ" -> "kiili-autoosad-ou" (sem acento, so a-z0-9 e hifen; vazio -> "loja"). */
export function slugLoja(nome: string): string {
  const s = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'loja';
}

/** Segmento da URL: "<slug>-<numero>". */
export const segmentoLoja = (nome: string, numero: number | string) => `${slugLoja(nome)}-${numero}`;

/** C-1 (Fable 18/11): o Next ja entrega o parametro descodificado; um segundo decodeURIComponent de "50%-1001"
 * lanca URIError (pagina 500). Descodifica se der, senao usa como veio. */
export function segmentoDaUrl(slug: string): string {
  try { return decodeURIComponent(String(slug ?? '')); } catch { return String(slug ?? ''); }
}

/** Numero da loja no fim do segmento ("kiili-autoosad-1004" -> 1004; so numero tambem vale). */
export function numeroDoSegmento(seg: string): number | null {
  const m = String(seg || '').match(/(?:^|-)(\d{1,12})$/);
  return m ? Number(m[1]) : null;
}

export interface CamposPerfilPublico {
  descricao: string | null;
  categorias: string[] | null;
  horario_funcionamento: HorarioLoja | null;
  latitude: number | null;
  longitude: number | null;
  cidade: string | null;
  endereco: string | null;
}

export type ItemFaltando = 'descricao' | 'categorias' | 'horario' | 'endereco';

/** O que falta para a pagina ir ao Google (sem isso ela existe, mas com noindex e fora do sitemap). */
export function faltandoParaIndexar(l: CamposPerfilPublico): ItemFaltando[] {
  const f: ItemFaltando[] = [];
  if ((l.descricao || '').trim().length < MIN_DESCRICAO_INDEXAR) f.push('descricao');
  if (!(l.categorias || []).some((c) => (CATEGORIAS_LOJA as readonly string[]).includes(c))) f.push('categorias');
  const h = l.horario_funcionamento || {};
  if (!DIAS_LOJA.some((d) => h[d]?.aberto && h[d]?.inicio && h[d]?.fim)) f.push('horario');
  if (l.latitude == null || l.longitude == null || !(l.cidade || '').trim() || !(l.endereco || '').trim()) f.push('endereco');
  return f;
}

/** C-3: "HH:MM" (00:00-23:59), o que o input type=time manda e o que vai para opens/closes do JSON-LD. */
export const HORA_LOJA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_MARCA = 40;

/** C-3: horario limpo (so seg..dom, horas validas; dia aberto sem as 2 horas validas conta como fechado).
 * Mesma regra do CHECK lojas_pecas_horario_ok (097); usado ao gravar (perfil) e ao ler (pagina/JSON-LD). */
export function limparHorario(h: unknown): HorarioLoja | null {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const out: HorarioLoja = {};
  for (const d of DIAS_LOJA) {
    const x = (h as Record<string, any>)[d];
    if (!x || typeof x !== 'object') continue;
    const ini = typeof x.inicio === 'string' && HORA_LOJA.test(x.inicio) ? x.inicio : '';
    const fim = typeof x.fim === 'string' && HORA_LOJA.test(x.fim) ? x.fim : '';
    out[d] = { aberto: x.aberto === true && !!ini && !!fim, inicio: ini, fim };
  }
  return out;
}

/** C-3: marcas lidas do banco (no maximo MAX_MARCAS, cada uma ate MAX_MARCA caracteres, sem vazias). */
export function limparMarcas(m: unknown): string[] {
  if (!Array.isArray(m)) return [];
  return m.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, MAX_MARCA)).slice(0, MAX_MARCAS);
}

/** Marcas digitadas ("VW, Audi; Škoda") -> lista limpa, sem repetidas, no maximo MAX_MARCAS. */
export function lerMarcas(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const parte of String(texto || '').split(/[,;\n]/)) {
    const m = parte.trim().replace(/\s+/g, ' ').slice(0, MAX_MARCA);
    if (!m || vistos.has(m.toLowerCase())) continue;
    vistos.add(m.toLowerCase()); out.push(m);
    if (out.length >= MAX_MARCAS) break;
  }
  return out;
}
