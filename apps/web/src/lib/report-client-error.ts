'use client';

// Compartilhado por ErrorReporter.tsx (erros JS globais/promises) e pelos
// error boundaries do Next.js (error.tsx, global-error.tsx - erros que o
// React capturou durante render/effect e por isso NUNCA chegam em
// window.onerror). Ver docs/PROGRESSO_2026-09-08.md rodada 9: um crash real
// so foi descoberto porque o usuario colou o erro do console a mao - sem
// os error boundaries reportando tambem, esse tipo de erro fica invisivel
// pro /admin/monitoramento.
export function reportClientError(mensagem: string, stack?: string) {
  try {
    const url = typeof window !== 'undefined' ? window.location.href : undefined;
    const payload = JSON.stringify({ mensagem, stack, url });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/log-error', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Nunca deixar o proprio report quebrar a pagina
  }
}
