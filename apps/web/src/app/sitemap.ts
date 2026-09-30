import { createClient } from '@supabase/supabase-js';
import { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { hreflangAlternates, localizedUrl, slugCidade } from '@/lib/seo-utils';
import { alternatesDoGuia, caminhoDoGuia, todosOsGuias } from '@/lib/guias';


// Sem isso, o sitemap fica congelado com os dados de quando a build rodou -
// oficinas novas so apareceriam apos o proximo deploy manual.
export const revalidate = 3600;

function localizedEntries(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified: Date }
): MetadataRoute.Sitemap {
  const { languages } = hreflangAlternates(routing.defaultLocale, path);
  return routing.locales.map((locale) => ({
    url: localizedUrl(locale, path),
    lastModified: opts.lastModified,
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
    alternates: { languages },
  }));
}

// Data real da ultima mudanca de conteudo de cada pagina estatica. Antes era
// new Date() (a hora do pedido) em todas: o Google passa a ignorar lastmod que
// muda a cada leitura. ATUALIZE a data da pagina quando mudar o texto dela.
const MUDOU = {
  paginas: new Date('2026-09-29'), // home, emergencia, para-oficinas, seja-parceiro, docs (SEO/i18n de 29/09)
  legal: new Date('2026-09-28'), // termos e privacidade
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Paginas estaticas, uma entrada por idioma (com hreflang cruzado)
  const staticPages: MetadataRoute.Sitemap = [
    // '' e nao '/': a home de cada idioma e https://bipfix.com/it (sem barra),
    // como declara o canonical; /it/ redireciona.
    ...localizedEntries('', { changeFrequency: 'weekly', priority: 1, lastModified: MUDOU.paginas }),
    ...localizedEntries('/emergencia', { changeFrequency: 'monthly', priority: 0.8, lastModified: MUDOU.paginas }),
    ...localizedEntries('/para-oficinas', { changeFrequency: 'monthly', priority: 0.9, lastModified: MUDOU.paginas }),
    ...localizedEntries('/seja-parceiro', { changeFrequency: 'monthly', priority: 0.9, lastModified: MUDOU.paginas }),
    ...localizedEntries('/sobre', { changeFrequency: 'monthly', priority: 0.6, lastModified: MUDOU.paginas }),
    ...localizedEntries('/termos', { changeFrequency: 'yearly', priority: 0.3, lastModified: MUDOU.legal }),
    ...localizedEntries('/privacidade', { changeFrequency: 'yearly', priority: 0.3, lastModified: MUDOU.legal }),
    ...localizedEntries('/docs', { changeFrequency: 'monthly', priority: 0.6, lastModified: MUDOU.paginas }),
    ...localizedEntries('/docs/cliente', { changeFrequency: 'monthly', priority: 0.5, lastModified: MUDOU.paginas }),
    ...localizedEntries('/docs/oficina', { changeFrequency: 'monthly', priority: 0.5, lastModified: MUDOU.paginas }),
  ];

  // Paginas dinamicas de oficinas ativas.
  // Cuidado: a tabela "oficinas" nao tem coluna "updated_at" (so
  // "created_at") - selecionar/ordenar por "updated_at" fazia essa query
  // falhar silenciosamente (o erro era descartado no destructuring) e o
  // sitemap nunca listava nenhuma oficina, mesmo com oficinas ativas no banco.
  const { data: oficinas } = await supabase
    .from('oficinas')
    .select('id, cidade, created_at')
    .eq('ativa', true)
    .order('created_at', { ascending: false });

  const oficinasPages: MetadataRoute.Sitemap = (oficinas || []).flatMap((oficina) =>
    localizedEntries(`/oficinas/${oficina.id}`, {
      changeFrequency: 'weekly',
      priority: 0.8,
      lastModified: oficina.created_at ? new Date(oficina.created_at) : new Date(),
    })
  );

  // Listagem /oficinas (e uma pagina por cidade) so entra no sitemap quando
  // ha oficina ativa - vazia ela sai com noindex (ver oficinas/page.tsx).
  // A lista muda quando entra uma oficina: data da mais recente (consulta ja
  // vem ordenada por created_at desc).
  const oficinaMaisRecente = oficinas?.[0]?.created_at ? new Date(oficinas[0].created_at) : MUDOU.paginas;
  const cidadeSlugs = Array.from(new Set((oficinas || []).map((o) => slugCidade(o.cidade || '')).filter(Boolean)));
  const listagemPages: MetadataRoute.Sitemap =
    (oficinas || []).length > 0
      ? [
          ...localizedEntries('/oficinas', { changeFrequency: 'daily', priority: 0.9, lastModified: oficinaMaisRecente }),
          ...cidadeSlugs.flatMap((slug) =>
            localizedEntries(`/oficinas?cidade=${slug}`, { changeFrequency: 'daily', priority: 0.8, lastModified: oficinaMaisRecente })
          ),
        ]
      : [];

  // Guias: cada guia so nos idiomas em que existe, com hreflang so entre eles
  // (mesma regra da pagina - ver lib/guias.ts). O indice /guias entra so nos
  // idiomas que tem pelo menos um guia (vazio ele sai com noindex).
  const guias = todosOsGuias();
  const guiasPages: MetadataRoute.Sitemap = guias.flatMap((guia) => {
    const { languages } = alternatesDoGuia(guia, routing.defaultLocale);
    return routing.locales
      .filter((l) => guia.versoes[l])
      .map((l) => ({
        url: localizedUrl(l, caminhoDoGuia(guia, l)),
        lastModified: new Date(guia.atualizado),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
        alternates: { languages },
      }));
  });
  const idiomasComGuia = routing.locales.filter((l) => guias.some((g) => g.versoes[l]));
  const guiasIndex: MetadataRoute.Sitemap = idiomasComGuia.map((l) => ({
    url: localizedUrl(l, '/guias'),
    lastModified: new Date(guias.filter((g) => g.versoes[l]).map((g) => g.atualizado).sort().pop()!),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...listagemPages, ...guiasIndex, ...guiasPages, ...oficinasPages];
}
