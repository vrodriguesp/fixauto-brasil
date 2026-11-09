'use client';

import { useEffect } from 'react';

// Celular (item 47, dono 09/11): ao tocar num campo, o Safari as vezes deixa o campo meio escondido
// atras do teclado e a pessoa tem de arrastar a pagina. Quando o teclado abre (a area visivel
// encolhe) - ou quando o foco passa a outro campo com o teclado ja aberto - a pagina leva o campo
// para o meio da area visivel. So rola: nunca tira o foco. As conversas presas a tela
// ([data-conversa]) cuidam de si mesmas.
const ehCampo = (el: EventTarget | null): el is HTMLElement =>
  el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
    || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color', 'hidden'].includes((el as HTMLInputElement).type)));

export default function CampoNaVista() {
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    let alvo: HTMLElement | null = null;
    let alturaAntes = v.height;
    let tmr: ReturnType<typeof setTimeout> | undefined;
    const tecladoAberto = () => v.height < window.innerHeight - 120;
    const centralizar = () => {
      if (!alvo || document.activeElement !== alvo || window.innerWidth >= 1024 || alvo.closest('[data-conversa]')) return;
      const r = alvo.getBoundingClientRect();
      // a area visivel (acima do teclado) vai de offsetTop ate offsetTop + height
      const meio = v.offsetTop + v.height / 2;
      if (r.top >= v.offsetTop + 16 && r.bottom <= v.offsetTop + v.height - 16) return; // ja esta a vista
      window.scrollBy({ top: r.top + r.height / 2 - meio, behavior: 'smooth' });
    };
    const agendar = (ms: number) => { clearTimeout(tmr); tmr = setTimeout(centralizar, ms); };
    const entrou = (e: FocusEvent) => {
      if (!ehCampo(e.target)) return;
      alvo = e.target;
      if (tecladoAberto()) agendar(80); // teclado ja aberto: foco passou de um campo a outro
    };
    const mudou = () => {
      if (v.height < alturaAntes - 60) agendar(120); // teclado acabou de abrir
      alturaAntes = v.height;
    };
    document.addEventListener('focusin', entrou);
    v.addEventListener('resize', mudou);
    return () => { clearTimeout(tmr); document.removeEventListener('focusin', entrou); v.removeEventListener('resize', mudou); };
  }, []);
  return null;
}
