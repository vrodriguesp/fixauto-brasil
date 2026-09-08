'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-client-error';

// Mounted once in the root layout - catches uncaught JS errors and unhandled
// promise rejections across every page, feeding /admin/monitoramento.
// NAO cobre erros de render/effect que o React intercepta com um Error
// Boundary (a tela "Application error: a client-side exception has
// occurred") - esses sao reportados por app/error.tsx e
// app/global-error.tsx, que usam o mesmo reportClientError.
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError(event.message, event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportClientError(
        reason?.message ? String(reason.message) : String(reason),
        reason?.stack
      );
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
