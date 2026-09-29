import fs from 'node:fs';
import path from 'node:path';
import { routing, X_DEFAULT_LOCALE, HREFLANG, type Locale } from '@/i18n/routing';
import { localizedUrl } from '@/lib/seo-utils';

// Guias praticos (conteudo para busca organica e para IAs). Cada guia e um
// arquivo content/guias/<slug>.json com as versoes de idioma que existirem -
// um guia sobre regras da Estonia pode existir so em et/en, por exemplo.
// Um idioma sem versao simplesmente nao lista o guia (sem pagina vazia,
// sem traducao automatica de baixa qualidade).

export interface GuiaSecao {
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
}

export interface GuiaVersao {
  titulo: string; // <h1> e base do <title>
  tituloSeo?: string; // <title> quando diferente do h1 (ate ~60 caracteres)
  descricao: string; // meta description (ate ~155 caracteres)
  resumo: string; // paragrafo de abertura
  secoes: GuiaSecao[];
  faq?: { pergunta: string; resposta: string }[];
  fontes?: { nome: string; url: string }[];
  cta?: 'pedido' | 'emergencia' | 'parceiro';
}

export interface Guia {
  slug: string;
  pais?: string; // ISO 3166-1 alpha-2 a que as regras se referem (ex: EE)
  publicado: string; // AAAA-MM-DD
  atualizado: string; // AAAA-MM-DD
  versoes: Partial<Record<Locale, GuiaVersao>>;
}

const DIR = path.join(process.cwd(), 'content', 'guias');

function lerTodos(): Guia[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as Guia)
    .sort((a, b) => b.atualizado.localeCompare(a.atualizado));
}

export function guiasDoIdioma(locale: string): { guia: Guia; versao: GuiaVersao }[] {
  return lerTodos()
    .filter((g) => g.versoes[locale as Locale])
    .map((g) => ({ guia: g, versao: g.versoes[locale as Locale]! }));
}

export function todosOsGuias(): Guia[] {
  return lerTodos();
}

export function guiaPorSlug(slug: string): Guia | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const f = path.join(DIR, `${slug}.json`);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Guia) : null;
}

// hreflang so entre os idiomas que o guia tem; x-default = ingles se existir.
export function alternatesDoGuia(guia: Guia, locale: string) {
  const caminho = `/guias/${guia.slug}`;
  const idiomas = routing.locales.filter((l) => guia.versoes[l]);
  const languages: Record<string, string> = {};
  for (const l of idiomas) languages[HREFLANG[l]] = localizedUrl(l, caminho);
  const padrao = guia.versoes[X_DEFAULT_LOCALE] ? X_DEFAULT_LOCALE : idiomas[0];
  if (padrao) languages['x-default'] = localizedUrl(padrao, caminho);
  return { canonical: localizedUrl(locale, caminho), languages };
}
