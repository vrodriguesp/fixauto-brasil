'use client';

import { useEffect, useRef, useState } from 'react';

// Lote 1 de pecas (17/11): a tela nova vale para esta sessao? (GET /api/pecas-v3 =
// interruptor global OU conta de teste - lib/pecas-v3.ts). null enquanto nao sabe:
// as telas esperam a resposta antes de desenhar o formulario e os cartoes, para
// nao mostrar a tela de hoje por meio segundo e trocar. Erro de rede = tela de hoje.
export function usePecasV3(): boolean | null {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch('/api/pecas-v3', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setAtivo(j?.ativo === true); })
      .catch(() => { if (vivo) setAtivo(false); });
    return () => { vivo = false; };
  }, []);
  return ativo;
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
