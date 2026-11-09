import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { fetchSemCache } from './fetch-sem-cache';

export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { fetch: fetchSemCache },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(lista) {
          // em Server Component nao da para gravar cookie (o middleware renova)
          try {
            lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch { /* somente leitura */ }
        },
      },
    }
  );
}
