'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-client-error';

// Error boundary das paginas (nao cobre o layout raiz - ver global-error.tsx
// pra isso). Reporta pra /api/log-error igual o ErrorReporter global, so que
// pra erros de render/effect que o React intercepta antes de chegar em
// window.onerror.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error.message || 'Erro na página', error.stack);
  }, [error]);

  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Algo deu errado nesta página</h1>
      <p className="text-sm text-gray-500 mb-6">A equipe já foi avisada automaticamente. Tente novamente ou volte ao início.</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => reset()} className="btn-primary">Tentar novamente</button>
        <Link href="/" className="btn-secondary">Ir para o início</Link>
      </div>
    </div>
  );
}
