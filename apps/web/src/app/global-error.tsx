'use client';

import { useEffect, useState } from 'react';
import { reportClientError } from '@/lib/report-client-error';
import { textosErro, ehVersaoAntiga, recarregarUmaVez } from '@/lib/erro-pagina';

// Error boundary do LAYOUT RAIZ (app/layout.tsx) - cobre erros que
// acontecem no Navbar, AuthProvider, etc, fora do alcance de um
// app/error.tsx normal (que so cobre as paginas, nao o layout em si).
// Foi exatamente um erro no layout raiz (Navbar -> sino de notificacoes)
// que derrubou o login de clientes em 08/09/2026 sem aparecer em nenhum
// log ate o usuario colar o erro do console na mao - esse arquivo existe
// pra isso nunca mais passar despercebido.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // texto no idioma do endereco; versao antiga do site (apos publicacao) recarrega sozinha
  const [tx, setTx] = useState<ReturnType<typeof textosErro> | null>(null);
  useEffect(() => {
    setTx(textosErro());
    if (ehVersaoAntiga(error) && recarregarUmaVez()) return;
    reportClientError(error.message || 'Erro no layout raiz', error.stack);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 9999, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{tx?.titulo || ''}</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              {tx?.texto || ''}
            </p>
            <button
              onClick={() => (ehVersaoAntiga(error) ? window.location.reload() : reset())}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              {tx?.tentar || '↻'}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
