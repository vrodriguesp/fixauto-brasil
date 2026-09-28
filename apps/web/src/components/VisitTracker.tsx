'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// Registra as paginas de cada visita (uma "visita" = uma aba, via
// sessionStorage) e manda o percurso pra /api/visita quando a aba sai de
// foco. O servidor espera a visita "esfriar" e manda UM e-mail por visita
// pro dono do site (ver api/visita/route.ts).
//
// So funciona depois que o visitante clica em "Aceitar" no aviso de cookies
// (components/Analytics.tsx): sem esse consentimento nada e guardado no
// navegador nem enviado. Isso vale para o site todo (LGPD e GDPR).
//
// Pra este navegador nunca mais ser monitorado (o proprio dono navegando
// deslogado), basta abrir qualquer pagina com ?nao_monitorar=1 uma vez.

const CHAVE_VISITA = 'bipfix_visita';
const CHAVE_OPT_OUT = 'bipfix_nao_monitorar';
const CHAVE_CONSENTIMENTO = 'bipfix_cookie_consent';
const MAX_PAGINAS = 50;

interface Pagina {
  p: string;
  t: number;
}

interface Visita {
  sid: string;
  inicio: number;
  ref: string;
  paginas: Pagina[];
}

function lerVisita(): Visita | null {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_VISITA) || 'null');
  } catch {
    return null;
  }
}

function podeMonitorar(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('nao_monitorar') === '1') {
      localStorage.setItem(CHAVE_OPT_OUT, '1');
    }
    return localStorage.getItem(CHAVE_CONSENTIMENTO) === 'accepted' && localStorage.getItem(CHAVE_OPT_OUT) !== '1';
  } catch {
    return false;
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const { user } = useAuth();
  const visita = useRef<Visita | null>(null);
  const usuario = useRef(user);
  usuario.current = user;

  const registrarPagina = useCallback(() => {
    if (!pathname || pathname.startsWith('/admin') || !podeMonitorar()) return;

    const v: Visita = visita.current ||
      lerVisita() || {
        sid: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        inicio: Date.now(),
        ref: document.referrer.slice(0, 300),
        paginas: [],
      };

    const atual = (pathname + window.location.search).slice(0, 300);
    if (v.paginas[v.paginas.length - 1]?.p !== atual) {
      v.paginas.push({ p: atual, t: Date.now() });
      v.paginas = v.paginas.slice(-MAX_PAGINAS);
    }
    visita.current = v;
    try {
      sessionStorage.setItem(CHAVE_VISITA, JSON.stringify(v));
    } catch {}
  }, [pathname]);

  useEffect(() => {
    registrarPagina();
    // Aceitou os cookies no meio da visita: comeca a contar a partir desta pagina
    window.addEventListener('bipfix-consentimento', registrarPagina);
    return () => window.removeEventListener('bipfix-consentimento', registrarPagina);
  }, [registrarPagina]);

  useEffect(() => {
    const enviar = () => {
      const v = visita.current;
      const u = usuario.current;
      if (!v || !v.paginas.length || u?.tipo === 'admin' || !podeMonitorar()) return;

      const corpo = JSON.stringify({
        ...v,
        fim: Date.now(),
        idioma: navigator.language,
        tela: `${window.screen.width}x${window.screen.height}`,
        fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        usuario: u ? { tipo: u.tipo, nome: u.nome } : null,
      });
      try {
        navigator.sendBeacon('/api/visita', new Blob([corpo], { type: 'application/json' }));
      } catch {}
    };

    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') enviar();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('pagehide', enviar);
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('pagehide', enviar);
    };
  }, []);

  return null;
}
