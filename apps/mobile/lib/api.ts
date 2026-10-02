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

  let res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 && session) {
    // login recusado pelo servidor (encerrado em outro aparelho, ou o token
    // guardado ficou para tras): renova uma vez e tenta de novo; se nem assim,
    // sai so deste aparelho e a pessoa entra de novo
    const { data: novo } = await supabase.auth.refreshSession();
    if (novo.session?.access_token) {
      headers.set('Authorization', `Bearer ${novo.session.access_token}`);
      res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    } else {
      await supabase.auth.signOut({ scope: 'local' });
    }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErroApi(res.status, json.codigo);
  }
  return json;
}
