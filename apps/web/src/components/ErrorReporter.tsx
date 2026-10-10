'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { ehVersaoAntiga, recarregarUmaVez } from '@/lib/erro-pagina';

// Mounted once in the root layout - catches uncaught JS errors and unhandled
// promise rejections across every page, feeding /admin/monitoramento.
// NAO cobre erros de render/effect que o React intercepta com um Error
// Boundary (a tela "Application error: a client-side exception has
// occurred") - esses sao reportados por app/error.tsx e
// app/global-error.tsx, que usam o mesmo reportClientError.
export default function ErrorReporter() {
  useEffect(() => {
    // site publicado de novo com a pagina aberta: o codigo da proxima pagina nao
    // existe mais e o clique nao fazia nada. Recarrega (uma vez) no destino.
    const versaoAntiga = (e: any) => !!e && ehVersaoAntiga({ name: String(e.name || ''), message: String(e.message || e) } as Error);
    const onError = (event: ErrorEvent) => {
      reportClientError(event.message, event.error?.stack);
      if (versaoAntiga(event.error || { message: event.message })) recarregarUmaVez();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError(
        reason?.message ? String(reason.message) : String(reason),
        reason?.stack
      );
      if (versaoAntiga(reason)) recarregarUmaVez();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
