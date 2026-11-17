'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

// Lote 1 de pecas (17/11): a tela nova vale para esta sessao? (GET /api/pecas-v3 =
// interruptor global OU conta de teste - lib/pecas-v3.ts). null enquanto nao sabe:
// as telas esperam a resposta antes de desenhar o formulario e os cartoes, para
// nao mostrar a tela de hoje por meio segundo e trocar. Erro de rede = tela de hoje.
// Lote 2 (veredito do lote 1): a rota travada vira "tela de hoje" em 8 s (antes, esqueleto eterno).
// Lote 3 (item 3 do Fable, lote 2): PecasV3Provider nos layouts da oficina e da loja - 1 GET por sessao,
// LAZY (so no 1o usePecasV3 de uma pagina que precisa; o painel inicial nao pergunta). Sem o provider
// (outras areas) cada pagina pergunta como antes.
const ESPERA_MAXIMA_MS = 8000;
const sinalComPrazo = (ms: number): AbortSignal | undefined => {
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') return (AbortSignal as any).timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

/** pergunta ao servidor (com o prazo de 8 s); erro ou demora = false (tela de hoje) */
function perguntar(): Promise<boolean> {
  return new Promise((resolve) => {
    let feito = false;
    const fim = (v: boolean) => { if (!feito) { feito = true; resolve(v); } };
    // garantia extra: mesmo que o navegador ignore o sinal, a tela de hoje aparece no prazo
    setTimeout(() => fim(false), ESPERA_MAXIMA_MS + 200);
    fetch('/api/pecas-v3', { cache: 'no-store', signal: sinalComPrazo(ESPERA_MAXIMA_MS) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => fim(j?.ativo === true))
      .catch(() => fim(false));
  });
}

// o menu (fora dos layouts) mostra os links novos quando ja se sabe que a tela nova vale
const ouvintes = new Set<(v: boolean) => void>();
let conhecidoAtivo = false;
function anunciar(v: boolean) { conhecidoAtivo = v; ouvintes.forEach((f) => f(v)); }
export function usePecasV3Conhecido(): boolean {
  const [v, setV] = useState(conhecidoAtivo);
  useEffect(() => { ouvintes.add(setV); return () => { ouvintes.delete(setV); }; }, []);
  return v;
}

type Ctx = { ativo: boolean | null; pedir: () => void };
const PecasV3Contexto = createContext<Ctx | null>(null);

export function PecasV3Provider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ativo, setAtivo] = useState<boolean | null>(null);
  // usuario para quem ja perguntou (null = ainda nao perguntou; '' = antes do login carregar na tela:
  // a rota responde pela sessao do cookie, entao vale para quem chegar)
  const pedido = useRef<string | null>(null);
  const rodada = useRef(0);
  const usuario = user?.id || '';
  useEffect(() => {
    if (!usuario || pedido.current === null) return;
    if (pedido.current === '') { pedido.current = usuario; return; }
    // troca de conta na mesma aba: pergunta de novo
    if (pedido.current !== usuario) { pedido.current = null; rodada.current++; setAtivo(null); }
  }, [usuario]);
  const pedir = useCallback(() => {
    if (pedido.current !== null) return;
    pedido.current = usuario;
    const minha = ++rodada.current;
    perguntar().then((v) => { if (rodada.current === minha) { setAtivo(v); anunciar(v); } });
  }, [usuario]);
  return createElement(PecasV3Contexto.Provider, { value: { ativo, pedir } }, children);
}

export function usePecasV3(): boolean | null {
  const ctx = useContext(PecasV3Contexto);
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    if (ctx) { ctx.pedir(); return; }
    let vivo = true;
    perguntar().then((v) => { if (vivo) setLocal((a) => (a === null ? v : a)); });
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.pedir]);
  return ctx ? ctx.ativo : local;
}

// Placa das cotacoes que o FORNECEDOR ve (loja e aba "Vender"): so pela rota do servidor,
// que decide ao vivo (enviar_placa, status, ativa, pais, paridade teste/real). 404 = sem placa.
// Cada cotacao e pedida uma vez por pagina aberta (o tempo real recarrega a lista toda hora).
export function usePlacasDoFornecedor(
  cotacoes: { id: string; tipo?: string | null; enviar_placa?: boolean | null }[],
  ativo: boolean | null
): Record<string, string> {
  const [placas, setPlacas] = useState<Record<string, string>>({});
  const pedidas = useRef(new Set<string>());
  useEffect(() => {
    if (!ativo) return;
    const novas = cotacoes.filter((c) => c.tipo !== 'sem_carro' && c.enviar_placa !== false && !pedidas.current.has(c.id)).slice(0, 40);
    if (!novas.length) return;
    novas.forEach((c) => pedidas.current.add(c.id));
    // sem cancelar na troca da lista: a cotacao ja foi marcada como pedida e a resposta tem de chegar
    Promise.all(novas.map(async (c) => {
      const r = await fetch(`/api/cotacao-peca/placa?cotacao=${encodeURIComponent(c.id)}`, { cache: 'no-store' }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => null) : null;
      return [c.id, typeof j?.placa === 'string' ? j.placa : ''] as const;
    })).then((lista) => {
      const achadas = lista.filter(([, p]) => p);
      if (achadas.length) setPlacas((antes) => ({ ...antes, ...Object.fromEntries(achadas) }));
    });
  }, [cotacoes, ativo]);
  return placas;
}
