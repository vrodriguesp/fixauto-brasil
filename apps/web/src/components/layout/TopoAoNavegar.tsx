'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Pagina nova abre no alto. Com o cabecalho fixo, o Next as vezes mantinha a rolagem
// da pagina anterior (lista de pedidos -> pedido abria 542 px para baixo, teste do
// dono 08/11). Voltar/avancar do navegador continua no lugar onde a pessoa estava.
export default function TopoAoNavegar() {
  const caminho = usePathname();
  const primeiro = useRef(true);
  const voltando = useRef(false);
  useEffect(() => {
    // tambem avisa as paginas (ex.: o pedido sem conta) que a chegada foi pelo "voltar"
    const marcar = () => { voltando.current = true; (window as any).__bipfixVoltou = Date.now(); };
    window.addEventListener('popstate', marcar);
    return () => window.removeEventListener('popstate', marcar);
  }, []);
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    if (voltando.current) { voltando.current = false; return; }
    if (window.location.hash) return;
    window.scrollTo({ top: 0 });
  }, [caminho]);
  return null;
}
