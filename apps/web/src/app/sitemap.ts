import { createClient } from '@supabase/supabase-js';
import { MetadataRoute } from 'next';

const BASE_URL = 'https://fixauto-brasil.vercel.app';

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
  ];

  // Paginas dinamicas de oficinas ativas
  const { data: oficinas } = await supabase
    .from('oficinas')
    .select('id, updated_at')
    .order('updated_at', { ascending: false });

  const oficinasPages: MetadataRoute.Sitemap = (oficinas || []).map((oficina) => ({
    url: `${BASE_URL}/oficinas/${oficina.id}`,
    lastModified: oficina.updated_at ? new Date(oficina.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...oficinasPages];
}
