import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Confere que quem esta chamando uma rota /api/admin/* e de fato um admin
 * logado e ativo. As rotas /api/admin/* usam a service role key (ignora
 * RLS) e o middleware.ts NAO cobre /api/* (so paginas) - sem essa checagem
 * qualquer um na internet, sem login nenhum, consegue chamar essas rotas
 * direto. Usar sempre assim no topo de cada handler:
 *
 *   const auth = await requireAdmin();
 *   if (!auth.ok) return auth.response;
 */
export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
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
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tipo, ativo')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.tipo !== 'admin' || profile.ativo === false) {
    return { ok: false, response: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };
  }

  return { ok: true };
}
