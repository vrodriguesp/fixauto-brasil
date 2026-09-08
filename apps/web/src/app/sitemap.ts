import { createClient } from '@supabase/supabase-js';
import { MetadataRoute } from 'next';

const BASE_URL = 'https://bipfix.com';

// Sem isso, o sitemap fica congelado com os dados de quando a build rodou -
// oficinas novas so apareceriam apos o proximo deploy manual.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Paginas estaticas
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/cadastro`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/emergencia`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/para-oficinas`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/seja-parceiro`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/termos`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacidade`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  // Paginas dinamicas de oficinas ativas.
  // Cuidado: a tabela "oficinas" nao tem coluna "updated_at" (so
  // "created_at") - selecionar/ordenar por "updated_at" fazia essa query
  // falhar silenciosamente (o erro era descartado no destructuring) e o
  // sitemap nunca listava nenhuma oficina, mesmo com oficinas ativas no banco.
  const { data: oficinas } = await supabase
    .from('oficinas')
    .select('id, created_at')
    .eq('ativa', true)
    .order('created_at', { ascending: false });

  const oficinasPages: MetadataRoute.Sitemap = (oficinas || []).map((oficina) => ({
    url: `${BASE_URL}/oficinas/${oficina.id}`,
    lastModified: oficina.created_at ? new Date(oficina.created_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...oficinasPages];
}
