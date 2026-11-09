import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from 'react';

// Padrao UNICO das conversas do site (dono 09/11, itens 32/33/41/42/46): cliente <-> oficina
// (os dois lados), suporte e acidente. Mesmo comportamento do WhatsApp/Messenger:
//  - celular: a conversa fica presa a area visivel (visualViewport) - cabecalho em cima,
//    mensagens no meio, caixa de escrever embaixo/acima do teclado; a pagina de tras nao rola
//    e o menu de baixo e o botao do chat somem (body.em-conversa). No computador nada muda;
//  - abre na ultima mensagem; mensagem nova so desce a lista se a pessoa ja esta no fim (ou se
//    a mensagem e dela) - lendo mensagens antigas aparece o aviso "nova mensagem";
//  - tocar ou arrastar a lista fecha o teclado; ao fechar, tudo volta ao tamanho cheio.
// A 1a versao (08/11) so prendia a tela quando o teclado "parecia aberto" e no iPhone isso
// nem sempre vale - por isso aqui a conversa fica presa o tempo todo no celular.
export function useConversaCelular({ conversa, lista, quantidade, ultimaMinha, ativo = true, fixar = true, larguraMax = 1024 }: {
  conversa: RefObject<HTMLElement>;
  lista: RefObject<HTMLElement>;
  /** quantas mensagens a lista tem (muda quando chega/sai uma) */
  quantidade: number;
  /** a ultima mensagem e de quem esta usando a tela (enviou agora): sempre desce */
  ultimaMinha: boolean;
  /** conversa aberta (o suporte abre e fecha) */
  ativo?: boolean;
  /** prender a conversa a area visivel no celular (falso: conversa dentro de uma pagina) */
  fixar?: boolean;
  /** abaixo desta largura conta como celular */
  larguraMax?: number;
}) {
  const [novaMensagem, setNovaMensagem] = useState(false);
  const alturaAnterior = useRef(0);
  const jaAbriu = useRef(false);

  const irParaFim = useCallback((suave = true) => {
    const l = lista.current;
    if (!l) return;
    if (suave) l.scrollTo({ top: l.scrollHeight, behavior: 'smooth' }); else l.scrollTop = l.scrollHeight;
    setNovaMensagem(false);
  }, [lista]);

  // celular: presa a area visivel, pagina de tras travada
  useEffect(() => {
    const v = window.visualViewport;
    if (!ativo || !fixar || !v || window.innerWidth >= larguraMax) return;
    const b = document.body.style;
    const y = window.scrollY;
    const antes = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    b.position = 'fixed'; b.top = `-${y}px`; b.width = '100%'; b.overflow = 'hidden';
    document.body.classList.add('em-conversa');
    let alturaVisivel = v.height;
    const medir = () => {
      const el = conversa.current;
      if (!el) return;
      Object.assign(el.style, { position: 'fixed', top: `${v.offsetTop}px`, left: '0', right: '0', bottom: 'auto', height: `${v.height}px`, zIndex: '60', maxWidth: 'none' });
      window.scrollTo(0, 0);
      // teclado aberto: a caixa de escrever nao precisa da margem do iPhone embaixo
      document.body.classList.toggle('teclado-aberto', v.height < window.innerHeight - 120);
      // teclado abriu (area visivel encolheu): quem estava no fim continua vendo a ultima mensagem
      const l = lista.current;
      if (l && v.height < alturaVisivel && l.scrollHeight - l.scrollTop - l.clientHeight < 160) l.scrollTop = l.scrollHeight;
      alturaVisivel = v.height;
    };
    medir();
    v.addEventListener('resize', medir);
    v.addEventListener('scroll', medir);
    return () => {
      v.removeEventListener('resize', medir);
      v.removeEventListener('scroll', medir);
      const el = conversa.current;
      if (el) for (const p of ['position', 'top', 'left', 'right', 'bottom', 'height', 'zIndex', 'maxWidth'] as const) el.style[p] = '';
      document.body.classList.remove('em-conversa', 'teclado-aberto');
      Object.assign(b, antes);
      window.scrollTo(0, y);
    };
  }, [ativo, fixar, larguraMax, conversa, lista]);

  // mensagem nova: abre no fim; depois so desce se a pessoa estava no fim ou se a mensagem e dela
  useEffect(() => {
    const l = lista.current;
    if (!ativo || !l) { jaAbriu.current = false; return; }
    if (quantidade === 0) { alturaAnterior.current = l.scrollHeight; return; }
    if (!jaAbriu.current) {
      jaAbriu.current = true;
      l.scrollTop = l.scrollHeight;
      // audios/imagens podem crescer depois de carregar: confirma o fim no proximo quadro
      requestAnimationFrame(() => { l.scrollTop = l.scrollHeight; });
    } else {
      const estavaNoFim = l.scrollTop + l.clientHeight >= alturaAnterior.current - 120;
      if (ultimaMinha || estavaNoFim) irParaFim(true);
      else setNovaMensagem(true);
    }
    alturaAnterior.current = l.scrollHeight;
  }, [quantidade, ultimaMinha, ativo, lista, irParaFim]);

  // props da lista: chegou ao fim -> some o aviso; tocar/arrastar a lista fecha o teclado
  const fecharTeclado = useCallback(() => {
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && conversa.current?.contains(a)) a.blur();
  }, [conversa]);
  const propsLista = {
    onScroll: (e: UIEvent<HTMLElement>) => {
      const l = e.currentTarget;
      if (l.scrollHeight - l.scrollTop - l.clientHeight < 40) setNovaMensagem(false);
    },
    onTouchMove: fecharTeclado,
    onClick: fecharTeclado,
  };

  return { novaMensagem, irParaFim, propsLista };
}
