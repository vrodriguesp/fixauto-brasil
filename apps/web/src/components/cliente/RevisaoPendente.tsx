'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { textoErroApi } from '@/lib/erro-api';

interface Revisao {
  id: string;
  valor_anterior: number;
  valor_novo: number;
  prazo_dias_novo: number | null;
  motivo: string;
  itens: { descricao: string; quantidade: number; valor_total: number }[];
  oficina: { nome_fantasia: string; pais: string | null } | null;
}

// Proposta de revisao de um orcamento JA ACEITO (migracao 049). Nada muda sem
// a decisao do cliente: aprovar | recusar (encerra o servico e o cliente
// retira o carro; com confirmacao). Mesmo padrao de mercado (ClickMechanic:
// trabalho adicional so com aprovacao do cliente).
export default function RevisaoPendente({ solicitacaoId, aoDecidir }: { solicitacaoId: string; aoDecidir?: () => void }) {
  const t = useTranslations('revisaoOrcamento');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const [rev, setRev] = useState<Revisao | null>(null);
  const [confirmarRetirada, setConfirmarRetirada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('orcamento_revisoes')
      .select('id, valor_anterior, valor_novo, prazo_dias_novo, motivo, itens, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('status', 'pendente').maybeSingle()
      .then(({ data }) => setRev((data as any) || null));
  }, [solicitacaoId]);

  if (feito) return <p role="status" className="card mb-6 bg-green-50 text-green-800">{feito}</p>;
  if (!rev) return null;
  const moeda = currencyForCountry(rev.oficina?.pais);
  const fmt = (v: number) => formatCurrency(Number(v), moeda, locale);
  const subiu = Number(rev.valor_novo) > Number(rev.valor_anterior);
  const pct = Number(rev.valor_anterior) > 0 ? Math.round(((Number(rev.valor_novo) - Number(rev.valor_anterior)) / Number(rev.valor_anterior)) * 100) : 0;

  const decidir = async (decisao: 'aprovar' | 'recusar') => {
    setEnviando(true); setErro('');
    const res = await fetch('/api/orcamento-revisao/decidir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisaoId: rev.id, decisao }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!res?.ok) { setErro(textoErroApi(tErr, res?.status || 500, d)); return; }
    setFeito(t(`feito_${decisao}`));
    aoDecidir?.();
  };

  return (
    <section className="card mb-6 border-2 border-amber-400 bg-amber-50" aria-labelledby="revisao-titulo">
      <h2 id="revisao-titulo" className="text-lg font-semibold text-gray-900">{t('titulo', { oficina: rev.oficina?.nome_fantasia || '' })}</h2>
      <p className="mt-2 text-gray-800">
        <span className="line-through text-gray-500">{fmt(rev.valor_anterior)}</span>{' → '}
        <span className="font-bold text-xl">{fmt(rev.valor_novo)}</span>
        {pct !== 0 && <span className={`ml-2 text-sm font-semibold ${subiu ? 'text-red-700' : 'text-green-700'}`}>({subiu ? '+' : ''}{pct}%)</span>}
      </p>
      {rev.prazo_dias_novo ? <p className="text-sm text-gray-700">{t('novoPrazo', { dias: rev.prazo_dias_novo })}</p> : null}
      <p className="mt-3 text-sm text-gray-800"><span className="font-medium">{t('motivo')}:</span> {rev.motivo}</p>
      {rev.itens?.length > 0 && (
        <ul className="mt-3 text-sm divide-y divide-amber-200 border-t border-amber-200">
          {rev.itens.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">{it.quantidade > 1 ? `${it.quantidade}× ` : ''}{it.descricao}</span>
              <span className="whitespace-nowrap">{fmt(it.valor_total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-600">{t('explicacao')}</p>
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
      {confirmarRetirada ? (
        <div role="alertdialog" className="mt-4 rounded-lg border border-red-300 bg-white p-3">
          <p className="text-sm text-gray-900 mb-3">{t('retirarConfirma')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={enviando} onClick={() => decidir('recusar')} className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">{t('retirarSim')}</button>
            <button type="button" onClick={() => setConfirmarRetirada(false)} className="btn-secondary">{t('voltar')}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <button type="button" disabled={enviando} onClick={() => decidir('aprovar')} className="btn-success disabled:opacity-50">{t('aprovar')}</button>
          <button type="button" disabled={enviando} onClick={() => setConfirmarRetirada(true)} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-medium hover:bg-red-50">{t('recusar')}</button>
        </div>
      )}
    </section>
  );
}
