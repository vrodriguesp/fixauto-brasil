import { useEffect, useRef } from 'react';

// Fluxo em passos na mesma pagina: cada passo novo comeca no alto. Sem isso o
// passo seguinte abria na altura do botao do anterior e a pessoa via so o fim
// (teste do dono 07/11: cadastro da oficina depois de e-mail e senha).
export function useTopoAoMudar(passo: unknown) {
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    window.scrollTo({ top: 0 });
  }, [passo]);
}
