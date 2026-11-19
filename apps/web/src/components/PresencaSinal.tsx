'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

// Sinal de presenca para o admin ver "online agora / visto ha X" (dono 19/11).
// So com login: manda POST /api/presenca ao entrar, a cada 60 s com a aba visivel e
// ao voltar para a aba. Visitante sem login: nada (nem uma chamada). Nao manda
// nenhum dado alem da sessao - o servidor grava so a hora (migracao 101).
const INTERVALO_MS = 60 * 1000;

export default function PresencaSinal() {
  const { user, loading } = useAuth();
  const ligado = !loading && !!user && user.tipo !== 'admin';
  useEffect(() => {
    if (!ligado) return;
    const sinal = () => { if (document.visibilityState === 'visible') fetch('/api/presenca', { method: 'POST', keepalive: true }).catch(() => {}); };
    sinal();
    const i = setInterval(sinal, INTERVALO_MS);
    document.addEventListener('visibilitychange', sinal);
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', sinal); };
  }, [ligado]);
  return null;
}
