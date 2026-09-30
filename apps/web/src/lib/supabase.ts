import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

// Cookie de sessao com Secure (em HTTPS) e SameSite=Lax - OWASP Session
// Management. Precisa ser legivel pelo JS (desenho do Supabase), mas nao
// precisa trafegar em HTTP. O @supabase/ssr 0.1.0 so aplica atributos
// proprios se o leitor/gravador de cookies for informado, por isso ele
// esta aqui explicito (e so no navegador: no servidor nao ha document).
type OpcoesCookie = { maxAge?: number; expires?: Date; path?: string; domain?: string; sameSite?: string | boolean };

function gravarCookie(nome: string, valor: string, o: OpcoesCookie = {}) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, `Path=${o.path || '/'}`, 'SameSite=Lax'];
  if (o.maxAge !== undefined) partes.push(`Max-Age=${o.maxAge}`);
  if (o.expires) partes.push(`Expires=${o.expires.toUTCString()}`);
  if (o.domain) partes.push(`Domain=${o.domain}`);
  if (window.location.protocol === 'https:') partes.push('Secure');
  document.cookie = partes.join('; ');
}

function lerCookie(nome: string): string | undefined {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${nome}=`));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : undefined;
}

export const supabase =
  typeof window !== 'undefined'
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get: lerCookie,
          set: (nome: string, valor: string, opcoes: OpcoesCookie) => gravarCookie(nome, valor, opcoes),
          remove: (nome: string, opcoes: OpcoesCookie) => gravarCookie(nome, '', { ...opcoes, maxAge: 0 }),
        },
      })
    : createBrowserClient(supabaseUrl, supabaseAnonKey);

// Check if Supabase is properly configured
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co';
