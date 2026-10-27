'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

interface Garantia {
  solicitacaoId: string;
  numero: number | null;
  carro: string;
  placa: string;
  cliente: string;
  dias: number;
  entregue: Date;
  fim: Date;
}

const DIA = 86400000;
// garantias encerradas continuam na lista por 90 dias (reclamacao tardia)
const MOSTRAR_VENCIDAS_DIAS = 90;

// Garantias dadas pela oficina (feedback do dono 27/10). Mesma regra do app do
// motorista (GarantiasAtivas): dias informados no orcamento aceito, contados da
// entrega (agenda concluida desta oficina).
export default function OficinaGarantiasPage() {
  const t = useTranslations('oficinaGarantias');
  const locale = useLocale();
  const { oficina } = useAuth();
  const [lista, setLista] = useState<Garantia[] | null>(null);

  useEffect(() => {
    if (!oficina?.id) return;
    (async () => {
      const { data } = await supabase.from('orcamentos')
        .select('solicitacao_id, garantia_dias, solicitacao:solicitacoes(id, numero, status, cliente:profiles!solicitacoes_cliente_id_fkey(nome), veiculo:veiculos!solicitacoes_veiculo_id_fkey(fipe_marca, fipe_modelo, placa))')
        .eq('oficina_id', oficina.id).eq('status', 'aceito').gt('garantia_dias', 0);
      const ids = (data || []).map((o: any) => o.solicitacao_id);
      const { data: ags } = ids.length
        ? await supabase.from('agenda').select('solicitacao_id, data_fim').eq('oficina_id', oficina.id).eq('status', 'concluido').in('solicitacao_id', ids)
        : { data: [] as any[] };
      const agora = Date.now();
      const out: Garantia[] = [];
      for (const o of (data || []) as any[]) {
        const s = o.solicitacao;
        const ent = (ags || []).find((a: any) => a.solicitacao_id === o.solicitacao_id && a.data_fim);
        if (!s || s.status !== 'concluida' || !ent) continue;
        const entregue = new Date(ent.data_fim);
        const fim = new Date(entregue.getTime() + o.garantia_dias * DIA);
        if (fim.getTime() < agora - MOSTRAR_VENCIDAS_DIAS * DIA) continue;
        out.push({
          solicitacaoId: s.id, numero: s.numero ?? null,
          carro: s.veiculo?.fipe_marca ? `${s.veiculo.fipe_marca} ${s.veiculo.fipe_modelo || ''}`.trim() : '',
          placa: s.veiculo?.placa || '', cliente: s.cliente?.nome || '',
          dias: Math.ceil((fim.getTime() - agora) / DIA), entregue, fim,
        });
      }
      setLista(out.sort((a, b) => a.fim.getTime() - b.fim.getTime()));
    })();
  }, [oficina?.id]);

  const ativas = (lista || []).filter((g) => g.dias > 0);
  const vencidas = (lista || []).filter((g) => g.dias <= 0).reverse();

  const Linha = ({ g, ativa }: { g: Garantia; ativa: boolean }) => (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{[g.carro, g.placa].filter(Boolean).join(' · ') || '—'}</p>
        <p className="text-xs text-gray-500 truncate">
          {[g.cliente, g.numero ? t('pedido', { n: g.numero }) : '', t('entregue', { data: formatDate(g.entregue.toISOString(), locale) })].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="sm:text-right">
        {ativa ? (
          <>
            <p className="font-semibold text-emerald-700">{t('diasRestantes', { dias: g.dias })}</p>
            <p className="text-xs text-gray-500">{t('ate', { data: formatDate(g.fim.toISOString(), locale) })}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">{t('encerrada', { data: formatDate(g.fim.toISOString(), locale) })}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Link href={`/oficina/pedidos/${g.solicitacaoId}`} className="btn-secondary text-sm !py-1.5">{t('verPedido')}</Link>
        <Link href={`/oficina/mensagens/${g.solicitacaoId}`} className="btn-primary text-sm !py-1.5">{t('conversa')}</Link>
      </div>
    </li>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('titulo')}</h1>
      <p className="text-gray-600 mb-6">{t('subtitulo')}</p>
      {lista === null ? (
        <p className="text-gray-500">{t('carregando')}</p>
      ) : lista.length === 0 ? (
        <p className="card text-gray-600">{t('vazio')}</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('ativas', { n: ativas.length })}</h2>
          {ativas.length ? (
            <ul className="card p-0 divide-y divide-gray-100 mb-8">{ativas.map((g) => <Linha key={g.solicitacaoId} g={g} ativa />)}</ul>
          ) : <p className="text-gray-500 mb-8">{t('nenhumaAtiva')}</p>}
          {vencidas.length > 0 && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('vencidas')}</h2>
              <ul className="card p-0 divide-y divide-gray-100">{vencidas.map((g) => <Linha key={g.solicitacaoId} g={g} ativa={false} />)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
