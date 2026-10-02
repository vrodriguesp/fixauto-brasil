import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Cookie de sessao com Secure (em HTTPS) e SameSite=Lax - OWASP Session
// Management. Precisa ser legivel pelo JS (desenho do Supabase). O
// @supabase/ssr atual grava e apaga todos os pedacos do cookie juntos (a
// versao 0.1.0 deixava pedacos do login anterior ao trocar de conta).
export const supabase =
  typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: { path: '/', sameSite: 'lax', secure: window.location.protocol === 'https:' },
      })
    : createBrowserClient(supabaseUrl, supabaseAnonKey, {
        // no servidor (pre-render de componente cliente) nao ha sessao
        cookies: { getAll: () => [], setAll: () => {} },
      });

// Check if Supabase is properly configured
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co';
