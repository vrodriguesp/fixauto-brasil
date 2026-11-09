import { useEffect, type RefObject } from 'react';
import { Platform } from 'react-native';

// Conversa na versao web do app (Safari/Chrome do celular): o navegador empurrava a pagina ao
// abrir o teclado e o cabecalho (nome da oficina) sumia (dono 09/11, iPhone e Android). Mesmo
// metodo dos chats do site: a conversa fica presa a area visivel (visualViewport) - cabecalho
// em cima, so a lista rola, caixa de escrever embaixo/acima do teclado - e a pagina nao rola.
// No app instalado nada muda (KeyboardAvoidingView).
// ativo: so depois que a tela da conversa (com o ref) esta desenhada.
export function usePresoNaAreaVisivel(ref: RefObject<unknown>, ativo: boolean) {
  useEffect(() => {
    if (!ativo || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const v = window.visualViewport;
    const el = ref.current as HTMLElement | null;
    if (!v || !el || !el.style) return;
    const html = document.documentElement.style;
    const b = document.body.style;
    const antes = { hOverflow: html.overflow, bOverflow: b.overflow, bPosition: b.position, bWidth: b.width, bTop: b.top };
    const y = window.scrollY;
    html.overflow = 'hidden'; b.overflow = 'hidden'; b.position = 'fixed'; b.width = '100%'; b.top = `-${y}px`;
    const medir = () => {
      Object.assign(el.style, { position: 'fixed', top: `${v.offsetTop}px`, left: '0px', right: '0px', height: `${v.height}px`, zIndex: '50' });
      window.scrollTo(0, 0);
    };
    medir();
    v.addEventListener('resize', medir);
    v.addEventListener('scroll', medir);
    return () => {
      v.removeEventListener('resize', medir);
      v.removeEventListener('scroll', medir);
      for (const p of ['position', 'top', 'left', 'right', 'height', 'zIndex'] as const) el.style[p] = '';
      html.overflow = antes.hOverflow; b.overflow = antes.bOverflow; b.position = antes.bPosition; b.width = antes.bWidth; b.top = antes.bTop;
      window.scrollTo(0, y);
    };
  }, [ativo]); // eslint-disable-line react-hooks/exhaustive-deps
}
