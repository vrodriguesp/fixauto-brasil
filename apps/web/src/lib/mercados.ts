import { LOCALE_PREFIX, hrefNoIdioma } from '@/i18n/routing';

// Mercados onde a BipFix ainda nao opera para motoristas (decisao do dono,
// 23/10/2026): Italia, Portugal e Brasil ficam no ar so para RECRUTAR
// oficinas. Nos buscadores entram apenas as paginas para oficinas; as de
// motorista (home, acidente, guias, ajuda...) levam noindex, saem do sitemap
// e do hreflang - evita parecer "paginas-porta" (diretrizes do Bing).
// Quando um pais comecar a operar, e so tirar o idioma desta lista.
export const LOCALES_SO_RECRUTAMENTO: readonly string[] = ['it', 'pt-PT', 'pt'];

// Caminhos internos (sem prefixo, nome em portugues) indexados nesses mercados
const PAGINAS_RECRUTAMENTO = ['/para-oficinas', '/seja-parceiro', '/docs/oficina'];

const normaliza = (p: string) => (p === '' ? '/' : p.split('?')[0]);

/** A pagina `caminho` (interno) do idioma `locale` deve ir aos buscadores? */
export function indexavel(locale: string, caminho: string): boolean {
  if (!LOCALES_SO_RECRUTAMENTO.includes(locale)) return true;
  return PAGINAS_RECRUTAMENTO.includes(normaliza(caminho));
}

/** Mesma regra para o caminho PUBLICO (traduzido, sem o prefixo do pais), usada no middleware. */
export function indexavelPublico(locale: string, caminhoPublico: string): boolean {
  if (!LOCALES_SO_RECRUTAMENTO.includes(locale)) return true;
  const pedido = `${LOCALE_PREFIX[locale as keyof typeof LOCALE_PREFIX]}${normaliza(caminhoPublico) === '/' ? '' : normaliza(caminhoPublico)}`;
  return PAGINAS_RECRUTAMENTO.some((p) => hrefNoIdioma(locale as any, p) === pedido);
}
