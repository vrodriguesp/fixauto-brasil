'use client';

import { useEffect, useId, useRef, useState } from 'react';

// Icone (i) com explicacao curta (check-in v2, decisao 5: em todos os campos necessarios do orcamento).
// Acessivel e de toque: e um <button> (nao tooltip de hover), aria-expanded/aria-controls, fecha com Esc ou
// tocando fora. O texto abre EMBAIXO, na linha inteira (basis-full no pai flex-wrap), empurrando o resto:
// nunca fica por cima de outro campo, nem no celular.
// Area de toque 44x44 (QA D14) sem aumentar o icone (24 px) nem mexer no layout: ::after invisivel. Ela e
// ASSIMETRICA (16 px acima, 4 abaixo, 8 a esquerda, 12 a direita da borda; no CSS +1 px porque o ::after se mede
// da caixa SEM a borda de 1 px - com -inset-2.5 a area real era 42x42) porque o (i) fica numa linha de rotulo com o
// campo 4 px abaixo (mb-1) e, no seletor de check-in, 8 px depois do botao "+" (gap-2): centrada (10 px de cada
// lado) ela cobria a borda de cima do campo e a do botao. Acima e a direita so ha texto/margem.
export default function InfoI({ texto, rotulo, testid, className = '' }: { texto: React.ReactNode; rotulo: string; testid?: string; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const caixa = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: Event) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !botao.current?.contains(alvo)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return (
    <>
      <button ref={botao} type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-controls={id} aria-label={rotulo}
        data-testid={testid}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-300 bg-white text-xs font-bold italic leading-none text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 relative after:absolute after:-left-[9px] after:-right-[13px] after:-top-[17px] after:-bottom-[5px] after:content-[''] ${className}`}>
        i
      </button>
      <span ref={caixa} id={id} role="note" hidden={!aberto} data-testid={testid ? `${testid}-texto` : undefined}
        className="basis-full w-full rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-sm font-normal text-blue-900 break-words">
        {texto}
      </span>
    </>
  );
}
