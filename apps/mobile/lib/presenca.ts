import { useEffect } from 'react';
import { AppState } from 'react-native';
import { apiFetch } from './api';

// Sinal de presenca para o admin ver "online agora / visto ha X" (dono 19/11).
// So com login: ao abrir, a cada 60 s com o app em primeiro plano e ao voltar
// para ele. Manda so a sessao; o servidor grava so a hora (migracao 101).
const INTERVALO_MS = 60 * 1000;

export function usePresenca(userId: string | undefined | null) {
  useEffect(() => {
    if (!userId) return;
    const sinal = () => { if (AppState.currentState === 'active') apiFetch('/api/presenca', { method: 'POST' }).catch(() => {}); };
    sinal();
    const i = setInterval(sinal, INTERVALO_MS);
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') sinal(); });
    return () => { clearInterval(i); sub.remove(); };
  }, [userId]);
}
