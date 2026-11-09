'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Caixa de escrever das conversas do site (padrao unico, dono 09/11 - itens 33/42/46):
//  - letra de 16 px (com menos o Safari do iPhone da zoom);
//  - cresce ate ~5 linhas e depois rola por dentro; ao enviar volta a 1 linha (mesma altura);
//  - enviar NAO tira o foco do campo: o teclado fica aberto e a tela nao pula;
//  - botao enviar e microfone trocam no mesmo lugar, do mesmo tamanho.
const ALTURA_MAX = 128;

const CampoConversa = forwardRef<HTMLTextAreaElement, {
  valor: string;
  aoMudar: (v: string) => void;
  aoEnviar: () => void;
  placeholder: string;
  rotuloEnviar: string;
  /** sem microfone: o botao enviar fica sempre (desativado sem texto) */
  aoGravar?: () => void;
  rotuloGravar?: string;
  id?: string;
  testIdEnviar?: string;
  maxLength?: number;
}>(function CampoConversa({ valor, aoMudar, aoEnviar, placeholder, rotuloEnviar, aoGravar, rotuloGravar, id, testIdEnviar, maxLength = 2000 }, ref) {
  const campo = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => campo.current as HTMLTextAreaElement);

  // altura acompanha o texto (1 a ~5 linhas)
  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${Math.min(c.scrollHeight, ALTURA_MAX)}px`;
    c.style.overflowY = c.scrollHeight > ALTURA_MAX ? 'auto' : 'hidden';
  }, [valor]);

  const enviar = () => {
    if (!valor.trim()) return;
    aoEnviar();
    campo.current?.focus();
  };
  const temTexto = !!valor.trim();

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={campo}
        id={id}
        rows={1}
        value={valor}
        maxLength={maxLength}
        onChange={(e) => aoMudar(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); } }}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="send"
        data-campo-conversa=""
        className="flex-1 resize-none border border-gray-300 rounded-3xl px-4 py-2.5 text-[16px] leading-6 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      />
      {temTexto || !aoGravar ? (
        <button
          type="button"
          // o toque nao tira o foco do campo: o teclado continua aberto
          onMouseDown={(e) => e.preventDefault()}
          onClick={enviar}
          disabled={!temTexto}
          aria-label={rotuloEnviar}
          title={rotuloEnviar}
          data-testid={testIdEnviar}
          className="w-11 h-11 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={aoGravar}
          aria-label={rotuloGravar}
          title={rotuloGravar}
          className="w-11 h-11 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default CampoConversa;

/** Aviso "nova mensagem" quando a pessoa esta lendo mensagens antigas (nao a puxa para baixo). */
export function AvisoNovaMensagem({ visivel, aoTocar, texto }: { visivel: boolean; aoTocar: () => void; texto: string }) {
  if (!visivel) return null;
  return (
    <button type="button" onClick={aoTocar} data-testid="nova-mensagem"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      ↓ {texto}
    </button>
  );
}
