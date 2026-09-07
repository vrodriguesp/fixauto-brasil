'use client';

import { useEffect } from 'react';

function report(mensagem: string, stack?: string) {
  try {
    navigator.sendBeacon?.(
      '/api/log-error',
      new Blob([JSON.stringify({ mensagem, stack, url: window.location.href })], { type: 'application/json' })
    ) || fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, stack, url: window.location.href }),
      keepalive: true,
    });
  } catch {
    // Never let error-reporting itself throw
  }
}

// Mounted once in the root layout - catches uncaught JS errors and unhandled
// promise rejections across every page, feeding /admin/monitoramento.
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report(event.message, event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
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
