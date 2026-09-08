import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Le a sessao do cookie (mesmo padrao do middleware.ts e de
 * lib/admin-auth.ts) dentro de uma rota de API. Retorna o id do
 * profile logado, ou null se ninguem estiver logado.
 *
 * Use isso em toda rota que usa a service role key (bypassa RLS) pra
 * confirmar quem esta chamando ANTES de confiar em qualquer id vindo do
 * corpo da requisicao - ver docs/AUDITORIA_SEGURANCA_API_2026-09-08.md
 * pro catalogo de rotas que tinham esse problema.
 */
export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}
