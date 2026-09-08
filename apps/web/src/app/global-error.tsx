'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-client-error';

// Error boundary do LAYOUT RAIZ (app/layout.tsx) - cobre erros que
// acontecem no Navbar, AuthProvider, etc, fora do alcance de um
// app/error.tsx normal (que so cobre as paginas, nao o layout em si).
// Foi exatamente um erro no layout raiz (Navbar -> sino de notificacoes)
// que derrubou o login de clientes em 08/09/2026 sem aparecer em nenhum
// log ate o usuario colar o erro do console na mao - esse arquivo existe
// pra isso nunca mais passar despercebido.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error.message || 'Erro no layout raiz', error.stack);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 9999, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Algo deu errado</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
              A equipe já foi avisada automaticamente. Tente novamente.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
