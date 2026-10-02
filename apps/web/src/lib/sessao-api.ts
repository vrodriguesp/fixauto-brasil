import { supabase } from './supabase';

// "Sessao expirada" ao aceitar orcamento/enviar no celular: o login (token de
// 1 h) e renovado em segundo plano, mas o iPhone pausa a pagina parada - ao
// voltar, a chamada saia com o token vencido no cookie. Aqui, toda chamada do
// navegador as rotas do proprio site (/api/...) pede antes o login atual
// (getSession renova se venceu) e o envia no cabecalho Authorization, que o
// servidor ja aceita (lib/api-auth.ts, lib/admin-auth.ts).
let instalado = false;
export function instalarSessaoNasApis() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const mesmoSite = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
      const headers = new Headers(init?.headers || (entrada instanceof Request ? entrada.headers : undefined));
      if (mesmoSite && !headers.has('authorization')) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.set('authorization', `Bearer ${session.access_token}`);
          const res = await original(entrada, { ...init, headers });
          if (res.status !== 401) return res;
          // login recusado pelo servidor (encerrado em outro aparelho ou o
          // token local ficou para tras): renova uma vez e tenta de novo
          const { data: novo } = await supabase.auth.refreshSession();
          if (!novo.session?.access_token) return res;
          headers.set('authorization', `Bearer ${novo.session.access_token}`);
          return original(entrada, { ...init, headers });
        }
      }
    } catch { /* segue sem o cabecalho */ }
    return original(entrada, init);
  };
}
