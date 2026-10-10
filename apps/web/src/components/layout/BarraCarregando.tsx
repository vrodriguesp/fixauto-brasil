'use client';

import { useEffect, useRef, useState } from 'react';

// Barrinha no topo enquanto a proxima pagina carrega (dono 10/10: "o clique as
// vezes parece nao funcionar"). Sem ela, no celular ou na primeira visita a
// pagina levava 1-2 s sem nenhum sinal, e a pessoa clicava de novo.
// Aparece no clique de um link interno e some quando o endereco muda.
export default function BarraCarregando() {
  const [ativo, setAtivo] = useState(false);
  const espera = useRef<ReturnType<typeof setInterval> | null>(null);
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const parar = () => {
      setAtivo(false);
      if (espera.current) clearInterval(espera.current);
      if (limite.current) clearTimeout(limite.current);
    };
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || /^(mailto|tel|sms):/i.test(href)) return;
      let destino: URL;
      try { destino = new URL(a.href, window.location.href); } catch { return; }
      if (destino.origin !== window.location.origin || destino.href === window.location.href) return;
      const antes = window.location.href;
      // usado se a pagina nova nao carregar por ser de uma versao anterior do site (lib/erro-pagina)
      (window as any).__bipfixDestino = { href: destino.href, em: Date.now() };
      parar();
      setAtivo(true);
      // some quando o endereco muda (ou no maximo em 10 s)
      espera.current = setInterval(() => { if (window.location.href !== antes) setTimeout(parar, 150); }, 80);
      limite.current = setTimeout(parar, 10000);
    };
    document.addEventListener('click', aoClicar, true);
    window.addEventListener('popstate', parar);
    return () => { document.removeEventListener('click', aoClicar, true); window.removeEventListener('popstate', parar); parar(); };
  }, []);

  if (!ativo) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary-100" role="progressbar" aria-label="…" data-testid="barra-carregando">
      <div className="h-full w-1/3 bg-primary-600 animate-[carregando_1s_ease-in-out_infinite]" />
      <style>{`@keyframes carregando { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
    </div>
  );
}
