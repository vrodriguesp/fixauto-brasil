import { createClient } from '@supabase/supabase-js';
import { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { slugCidade } from '@/lib/seo-utils';

const BASE_URL = 'https://bipfix.com';

// Sem isso, o sitemap fica congelado com os dados de quando a build rodou -
// oficinas novas so apareceriam apos o proximo deploy manual.
export const revalidate = 3600;

function localizedUrl(locale: string, path: string): string {
  return locale === routing.defaultLocale ? `${BASE_URL}${path}` : `${BASE_URL}/${locale}${path}`;
}

// hreflang: cada variante de idioma de uma pagina lista todas as outras
// (incluindo "x-default" apontando pro locale padrao, sem prefixo) - assim
// o Google sabe que sao a mesma pagina em idiomas diferentes, nao conteudo
// duplicado.
function alternateLanguages(path: string): Record<string, string> {
  const languages: Record<string, string> = { 'x-default': localizedUrl(routing.defaultLocale, path) };
  for (const locale of routing.locales) {
    languages[locale] = localizedUrl(locale, path);
  }
  return languages;
}

function localizedEntries(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified?: Date }
): MetadataRoute.Sitemap {
  const languages = alternateLanguages(path);
  return routing.locales.map((locale) => ({
    url: localizedUrl(locale, path),
    lastModified: opts.lastModified || new Date(),
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Paginas estaticas, uma entrada por idioma (com hreflang cruzado)
  const staticPages: MetadataRoute.Sitemap = [
    ...localizedEntries('/', { changeFrequency: 'daily', priority: 1 }),
    ...localizedEntries('/login', { changeFrequency: 'monthly', priority: 0.5 }),
    ...localizedEntries('/cadastro', { changeFrequency: 'monthly', priority: 0.7 }),
    ...localizedEntries('/emergencia', { changeFrequency: 'monthly', priority: 0.8 }),
    ...localizedEntries('/para-oficinas', { changeFrequency: 'monthly', priority: 0.9 }),
    ...localizedEntries('/seja-parceiro', { changeFrequency: 'monthly', priority: 0.9 }),
    ...localizedEntries('/termos', { changeFrequency: 'yearly', priority: 0.3 }),
    ...localizedEntries('/privacidade', { changeFrequency: 'yearly', priority: 0.3 }),
    ...localizedEntries('/docs', { changeFrequency: 'monthly', priority: 0.6 }),
    ...localizedEntries('/docs/cliente', { changeFrequency: 'monthly', priority: 0.5 }),
    ...localizedEntries('/docs/oficina', { changeFrequency: 'monthly', priority: 0.5 }),
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
  const cidadeSlugs = Array.from(new Set((oficinas || []).map((o) => slugCidade(o.cidade || '')).filter(Boolean)));
  const listagemPages: MetadataRoute.Sitemap =
    (oficinas || []).length > 0
      ? [
          ...localizedEntries('/oficinas', { changeFrequency: 'daily', priority: 0.9 }),
          ...cidadeSlugs.flatMap((slug) =>
            localizedEntries(`/oficinas?cidade=${slug}`, { changeFrequency: 'daily', priority: 0.8 })
          ),
        ]
      : [];

  return [...staticPages, ...listagemPages, ...oficinasPages];
}
