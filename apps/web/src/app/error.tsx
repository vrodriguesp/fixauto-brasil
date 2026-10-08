'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/report-client-error';
import { textosErro, ehVersaoAntiga, recarregarUmaVez, idiomaDoEndereco } from '@/lib/erro-pagina';

// Error boundary das paginas (nao cobre o layout raiz - ver global-error.tsx
// pra isso). Reporta pra /api/log-error igual o ErrorReporter global, so que
// pra erros de render/effect que o React intercepta antes de chegar em
// window.onerror. Texto no idioma do endereco; pagina de uma versao antiga
// do site (depois de uma publicacao) recarrega sozinha.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [tx, setTx] = useState<ReturnType<typeof textosErro> | null>(null);
  const [recarregando, setRecarregando] = useState(false);
  useEffect(() => {
    setTx(textosErro());
    if (ehVersaoAntiga(error) && recarregarUmaVez()) { setRecarregando(true); return; }
    reportClientError(error.message || 'Erro na página', error.stack);
  }, [error]);

  if (!tx || recarregando) {
    return <div className="max-w-md mx-auto px-4 py-24 text-center text-sm text-gray-500">{tx?.atualizando || ''}</div>;
  }
  const pre = { pt: 'pt-br', 'pt-PT': 'pt-pt' }[idiomaDoEndereco() as 'pt' | 'pt-PT'] || idiomaDoEndereco();
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">⚠️</span>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">{tx.titulo}</h1>
      <p className="text-sm text-gray-500 mb-6">{tx.texto}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => (ehVersaoAntiga(error) ? window.location.reload() : reset())} className="btn-primary">{tx.tentar}</button>
        <Link href={`/${pre}`} className="btn-secondary">{tx.inicio}</Link>
      </div>
    </div>
  );
}
