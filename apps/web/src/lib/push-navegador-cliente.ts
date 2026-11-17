'use client';

// Lado do navegador do Web Push (lote 3c de pecas). O service worker /sw-avisos.js tem escopo estreito
// (/sw-avisos/): nao controla as paginas nem guarda cache, so recebe o aviso.
export const ESCOPO_AVISOS = '/sw-avisos/';

export const pushSuportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iPhone/iPad fora da PWA instalada: o Safari so entrega aviso para o app na tela de inicio (iOS 16.4+) */
export const iosSemPwa = () => {
  if (typeof window === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pwa = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !pwa;
};

export async function inscricaoAtual(): Promise<PushSubscription | null> {
  if (!pushSuportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration(ESCOPO_AVISOS).catch(() => undefined);
  return (await reg?.pushManager.getSubscription().catch(() => null)) || null;
}

const chaveBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** pede a permissao (so por clique), inscreve e grava no servidor */
export async function ligarAvisos(publicKey: string): Promise<'ok' | 'negado' | 'erro'> {
  if (!pushSuportado() || !publicKey) return 'erro';
  const perm = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
  if (perm !== 'granted') return 'negado';
  try {
    const reg = await navigator.serviceWorker.register('/sw-avisos.js', { scope: ESCOPO_AVISOS });
    await navigator.serviceWorker.ready.catch(() => null);
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(publicKey) }));
    const j = sub.toJSON();
    const r = await fetch('/api/push/navegador', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
    return r.ok ? 'ok' : 'erro';
  } catch { return 'erro'; }
}

/** tira a inscricao deste navegador (desligar ou sair da conta); nunca lanca */
export async function desligarAvisos(): Promise<void> {
  try {
    const sub = await inscricaoAtual();
    if (!sub) return;
    await fetch('/api/push/navegador', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }), signal: AbortSignal.timeout?.(4000) }).catch(() => null);
    await sub.unsubscribe().catch(() => false);
  } catch { /* sair da conta nunca depende disto */ }
}
