'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AnaliseDano } from '@fixauto/shared';

// `idioma` = lingua da tela: a analise nova vem escrita nela (os outros leitores
// veem traduzido). Com analise ja guardada, o hook pergunta a rota em segundo
// plano: ela devolve a mesma (sem custo) ou refaz se o formato e antigo ou se o
// pedido mudou (foto nova, texto editado) - a tela mostra a antiga enquanto isso.
export function useAnaliseDano(solicitacaoId: string | undefined, idioma?: string) {
  const [analise, setAnalise] = useState<AnaliseDano | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = useCallback(async () => {
    const res = await fetch('/api/analisar-dano', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solicitacao_id: solicitacaoId, idioma }),
    });
    return res.json().catch(() => ({}));
  }, [solicitacaoId, idioma]);

  useEffect(() => {
    if (!solicitacaoId) return;
    let vivo = true;
    setLoading(true);
    supabase
      .from('analise_dano')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!vivo) return;
        setLoading(false);
        if (!data) return;
        setAnalise(data as AnaliseDano);
        setAtualizando(true);
        const r = await pedir().catch(() => null);
        if (!vivo) return;
        if (r?.analise) setAnalise(r.analise as AnaliseDano);
        setAtualizando(false);
      });
    return () => { vivo = false; };
  }, [solicitacaoId, pedir]);

  const analisar = async () => {
    if (!solicitacaoId || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const data = await pedir();
      if (data.analise) {
        setAnalise(data.analise as AnaliseDano);
      } else {
        // codigo estavel; a tela mostra o texto traduzido
        setError(data.codigo || 'ERRO');
      }
    } catch {
      setError('ERRO');
    }
    setAnalyzing(false);
  };

  return { analise, loading, analyzing, atualizando, error, analisar };
}
