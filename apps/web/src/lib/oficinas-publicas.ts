import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

// Quantas oficinas aparecem na lista publica. Enquanto for zero, menus e
// botoes nao mandam ninguem (nem o Google) para uma lista vazia e noindex
// (auditoria SEO de 08/10, A4).
export const contarOficinasPublicas = unstable_cache(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  const { count } = await sb.from('oficinas').select('id', { count: 'exact', head: true }).eq('ativa', true);
  return count || 0;
}, ['oficinas-publicas'], { revalidate: 600 });
