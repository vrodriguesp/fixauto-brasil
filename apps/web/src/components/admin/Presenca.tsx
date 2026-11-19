'use client';

import { useEffect, useState } from 'react';
import { timeAgo } from '@/lib/utils';

// "Online agora" / "visto ha X" nas telas do admin (dono 19/11). Os dados vem de
// /api/admin/presenca (migracao 101); o hook consulta a cada 30 s com a aba visivel.
// Bolinha verde = sinal nos ultimos 2 min (lib/presenca.ts); cinza = visto ha X;
// sem bolinha = nunca entrou com esta versao do site/app.

const ONLINE_MS = 2 * 60 * 1000;
export const estaOnline = (vistoEm: string | null | undefined) => !!vistoEm && Date.now() - Date.parse(vistoEm) < ONLINE_MS;

export function Presenca({ vistoEm, curto = false, className = '' }: { vistoEm: string | null | undefined; curto?: boolean; className?: string }) {
  const online = estaOnline(vistoEm);
  const texto = online ? 'online agora' : vistoEm ? `visto ${timeAgo(vistoEm, 'pt')}` : 'sem sinal';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${online ? 'text-emerald-400' : 'text-slate-400'} ${className}`} data-testid="presenca" data-online={online ? '1' : '0'} title={vistoEm ? `Último sinal: ${new Date(vistoEm).toLocaleString('pt-BR')}` : 'Nunca mandou sinal (site/app antigo ou nunca entrou)'}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-400' : vistoEm ? 'bg-slate-500' : 'bg-slate-700'}`} aria-hidden="true" />
      {!curto && texto}
      {curto && online && <span className="sr-only">online agora</span>}
    </span>
  );
}

/** presenca de varias contas/oficinas: devolve { profiles: {id: visto_em}, oficinas: {id: visto_em} } */
export function usePresenca(profiles: string[], oficinas: string[] = []) {
  const [dados, setDados] = useState<{ profiles: Record<string, string>; oficinas: Record<string, string> }>({ profiles: {}, oficinas: {} });
  const chaveP = profiles.filter(Boolean).sort().join(',');
  const chaveO = oficinas.filter(Boolean).sort().join(',');
  useEffect(() => {
    if (!chaveP && !chaveO) return;
    let vivo = true;
    const ler = async () => {
      if (document.visibilityState !== 'visible') return;
      const q = new URLSearchParams();
      if (chaveP) q.set('profiles', chaveP);
      if (chaveO) q.set('oficinas', chaveO);
      const r = await fetch(`/api/admin/presenca?${q}`).catch(() => null);
      if (!r?.ok || !vivo) return;
      const d = await r.json();
      setDados({ profiles: d.profiles || {}, oficinas: d.oficinas || {} });
    };
    ler();
    const i = setInterval(ler, 30000);
    return () => { vivo = false; clearInterval(i); };
  }, [chaveP, chaveO]);
  return dados;
}
