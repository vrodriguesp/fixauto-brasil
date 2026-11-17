'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { usePecasV3 } from '@/hooks/use-pecas-v3';
import { AvaliacoesDoFornecedor, ResumoProprio, lerResumo, type ResumoFornecedor } from '@/components/pecas/ConfiancaV3';

// Lote 3 de pecas (L3.3, D-3): avaliacoes da loja - media, % no prazo, lista com o nome da oficina
// autora (D-1), responder uma vez e pedir revisao ao admin. So com a tela nova (conta de teste ou o
// global); a loja real com o interruptor desligado ve so o titulo (nada novo).
export default function LojaAvaliacoesPage() {
  const tp = useTranslations('pecas');
  const { loja } = useAuth();
  const v3 = usePecasV3();
  const [resumo, setResumo] = useState<ResumoFornecedor | null>(null);
  useEffect(() => { if (v3 && loja) lerResumo('loja', loja.id).then(setResumo); }, [v3, loja]);

  if (!loja || v3 === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-32 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{tp('lojaAvaliacoes.titulo')}</h1>
      {v3 && (
        <>
          <div className="card mb-6"><ResumoProprio resumo={resumo} testid="loja-avaliacoes-resumo" /></div>
          <AvaliacoesDoFornecedor tipo="loja" id={loja.id} testidItem="loja-avaliacoes-item" testidVazio="loja-avaliacoes-vazio" aoMudar={() => lerResumo('loja', loja.id).then(setResumo)} />
        </>
      )}
    </div>
  );
}
