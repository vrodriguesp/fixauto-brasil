import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Cookie de sessao com Secure (em HTTPS) e SameSite=Lax - OWASP Session
// Management. Precisa ser legivel pelo JS (desenho do Supabase). O
// @supabase/ssr atual grava e apaga todos os pedacos do cookie juntos (a
// versao 0.1.0 deixava pedacos do login anterior ao trocar de conta).
import { fetchSemCache } from './fetch-sem-cache';

// Nunca usar o cache HTTP do navegador nas chamadas ao banco (25/11): o PostgREST responde 300 a um
// embed ambiguo e o Chrome guarda 300 como "fresco para sempre" - depois da 116 as oficinas ficaram
// presas na lista vazia mesmo com o banco ja corrigido (117). Os dados mudam a todo momento; nada aqui
// deve vir do cache.

export const supabase =
  typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: { path: '/', sameSite: 'lax', secure: window.location.protocol === 'https:' },
        global: { fetch: fetchSemCache },
      })
    : createBrowserClient(supabaseUrl, supabaseAnonKey, {
        // no servidor (pre-render de componente cliente) nao ha sessao
        cookies: { getAll: () => [], setAll: () => {} },
      });

// Check if Supabase is properly configured
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co';
