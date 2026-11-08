import { useEffect, type RefObject } from 'react';

// Aviso que aparece longe do botao (erro no alto de um formulario comprido):
// leva a tela ate ele. Sem isso a pessoa clicava em enviar la embaixo e nada
// parecia acontecer (teste do dono 07/11: "da o foco errado").
export function useMostrarAlerta(ativo: unknown, ref: RefObject<HTMLElement | null>, focar = false) {
  useEffect(() => {
    if (!ativo || !ref.current) return;
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (focar) ref.current.focus({ preventScroll: true });
  }, [ativo, ref, focar]);
}

// Versao "ref": no elemento do aviso, leva a tela ate ele quando aparece.
export function rolarAteAqui(el: HTMLElement | null) {
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
