import { supabase } from './supabase';
import i18n from '../i18n';
import { ErroApi } from './erro';

// O app fala com as MESMAS rotas de API do site (apps/web/src/app/api) -
// nao existe um backend separado pro app. Rotas que usam a service_role key
// (bypassam RLS) exigem identificar quem esta chamando; como o app nao tem
// cookie de sessao do Next.js, manda o access token do Supabase no header
// Authorization (ver apps/web/src/lib/api-auth.ts).
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://bipfix.com';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroApi(res.status, json.codigo);
  }
  return json;
}
