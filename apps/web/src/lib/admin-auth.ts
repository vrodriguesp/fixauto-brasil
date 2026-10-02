import { cookies, headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';


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
export async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // so le: rota de API nao renova o login (quem renova e o navegador/middleware)
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  // getUser() valida o token no servidor de autenticacao (getSession() so le
  // o cookie e aceitaria um token forjado - docs do Supabase).
  // cabecalho Authorization (enviado pelo navegador com o login renovado,
  // lib/sessao-api.ts) vale antes do cookie, que pode estar vencido
  const bearer = headers().get('authorization');
  const { data: { user } } = bearer?.startsWith('Bearer ')
    ? await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).auth.getUser(bearer.slice(7))
    : await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tipo, ativo')
    .eq('id', user.id)
    .single();

  if (!profile || profile.tipo !== 'admin' || profile.ativo === false) {
    return { ok: false, response: NextResponse.json({ error: 'Acesso negado' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}
