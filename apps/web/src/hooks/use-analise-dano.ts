'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { AnaliseDano } from '@fixauto/shared';

export function useAnaliseDano(solicitacaoId: string | undefined) {
  const [analise, setAnalise] = useState<AnaliseDano | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!solicitacaoId) return;
    setLoading(true);
    supabase
      .from('analise_dano')
      .select('*')
      .eq('solicitacao_id', solicitacaoId)
      .single()
      .then(({ data }) => {
        if (data) setAnalise(data as AnaliseDano);
        setLoading(false);
      });
  }, [solicitacaoId]);

  const analisar = async () => {
    if (!solicitacaoId || analyzing) return;
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analisar-dano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitacao_id: solicitacaoId }),
      });
      const data = await res.json();
      if (data.analise) setAnalise(data.analise as AnaliseDano);
    } catch { /* non-blocking */ }
    setAnalyzing(false);
  };

  return { analise, loading, analyzing, analisar };
}
