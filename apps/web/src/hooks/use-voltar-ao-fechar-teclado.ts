import { useEffect } from 'react';

// Conversa com a altura exata da tela: no iPhone, ao abrir o teclado o Safari empurra
// a pagina para cima e, ao fechar (toque fora do campo), nao desce de volta - a caixa
// de escrever ficava no alto com um vazio embaixo (teste do dono 08/11). Quando o
// teclado fecha, a pagina volta para o lugar.
export function useVoltarAoFecharTeclado() {
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    let aberto = false;
    const medir = () => {
      const fechado = v.height >= window.innerHeight - 80;
      if (!fechado) aberto = true;
      else if (aberto) { aberto = false; window.scrollTo({ top: 0 }); }
    };
    v.addEventListener('resize', medir);
    return () => v.removeEventListener('resize', medir);
  }, []);
}
