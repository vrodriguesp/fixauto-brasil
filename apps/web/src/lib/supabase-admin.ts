import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente com a service role (ignora RLS) - SO no servidor e SO depois de
// verificar quem esta chamando. Antes, 40 rotas faziam
// `SERVICE_ROLE_KEY || ANON_KEY`: sem a variavel, rodavam em silencio com a
// chave publica. Aqui, sem a chave, falha alto.
let cliente: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL ausentes no servidor');
  cliente = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

// Proxy para manter o uso `supabaseAdmin.from(...)` nas rotas existentes,
// criando o cliente so na primeira chamada (o build nao precisa da chave).
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_alvo, prop) {
    const c = getSupabaseAdmin() as any;
    const v = c[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  },
});
