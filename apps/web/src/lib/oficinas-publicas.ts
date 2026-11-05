import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { perfisDeTeste } from '@/lib/oficinas-teste';

// Quantas oficinas aparecem na lista publica. Enquanto for zero, menus e
// botoes nao mandam ninguem (nem o Google) para uma lista vazia e noindex
// (auditoria SEO de 08/10, A4). Oficina de conta de teste nao conta (05/11).
export const contarOficinasPublicas = unstable_cache(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  const [{ data }, teste] = await Promise.all([
    sb.from('oficinas').select('profile_id').eq('ativa', true),
    perfisDeTeste().catch(() => null),
  ]);
  const ativas = (data || []) as { profile_id: string }[];
  return teste ? ativas.filter((o) => !teste.has(o.profile_id)).length : ativas.length;
}, ['oficinas-publicas'], { revalidate: 600 });
