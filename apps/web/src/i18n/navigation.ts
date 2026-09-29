import { createNavigation } from 'next-intl/navigation';
import { routing, LOCALE_PREFIX } from './routing';

const nav = createNavigation(routing);

export const { Link, redirect, useRouter, getPathname } = nav;

// Caminho INTERNO da pagina atual, sem idioma (ex.: '/oficinas/[id]' - com
// pathnames localizados o next-intl devolve o modelo da rota; os valores dos
// parametros vem de useParams()).
// Paginas FORA da tabela PATHNAMES (areas logadas) voltam do next-intl com o
// prefixo do idioma ('/et/loja/perfil') - aqui ele e tirado, senao os links
// de idioma saiam duplicados ('/ru/et/loja/perfil').
export function usePathname(): string {
  const p = nav.usePathname() as unknown as string;
  for (const prefixo of Object.values(LOCALE_PREFIX)) {
    if (p === prefixo) return '/';
    if (p.startsWith(`${prefixo}/`)) return p.slice(prefixo.length);
  }
  return p;
}

// Link para pagina com nome traduzido e parametro/consulta: o next-intl monta
// o endereco no idioma atual (ex.: rota('/oficinas/[id]', { id }) ->
// /et/tookojad/<id>). Tipo solto porque a tabela PATHNAMES e parcial.
export function rota(pathname: string, params?: Record<string, string | null | undefined>, query?: Record<string, string>): any {
  const p = params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v ?? ""]));
  return { pathname, ...(p ? { params: p } : {}), ...(query ? { query } : {}) };
}
