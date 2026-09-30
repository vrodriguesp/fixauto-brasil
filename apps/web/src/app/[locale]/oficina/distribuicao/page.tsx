'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useAgenda } from '@/hooks/use-agenda';
import { supabase } from '@/lib/supabase';
import { CARGOS_FUNCIONARIO } from '@fixauto/shared';
import { Link } from '@/i18n/navigation';
import { INTL_LOCALE } from '@/lib/utils';

interface FuncionarioLeve {
  id: string;
  nome: string;
  cargo: string;
  capacidade_maxima: number | null;
}

export default function DistribuicaoTrabalhoPage() {
  const t = useTranslations('oficinaDistribuicao');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const { oficina } = useAuth();
  const { eventos, loading, refresh } = useAgenda();
  const [funcionarios, setFuncionarios] = useState<FuncionarioLeve[]>([]);
  const [loadingFunc, setLoadingFunc] = useState(true);
  const [movendoId, setMovendoId] = useState<string | null>(null);

  useMemo(() => {
    if (!oficina) return;
    supabase
      .from('funcionarios')
      .select('id, cargo, capacidade_maxima, ativo, profile:profiles(nome)')
      .eq('oficina_id', oficina.id)
      .eq('ativo', true)
      .then(({ data }) => {
        setFuncionarios(
          ((data as any[]) || []).map((f) => ({
            id: f.id,
            nome: f.profile?.nome || t('semNome'),
            cargo: f.cargo,
            capacidade_maxima: f.capacidade_maxima,
          }))
        );
        setLoadingFunc(false);
      });
  }, [oficina]);

  const pendentes = useMemo(() => {
    return eventos
      .filter((e) => !['concluido', 'cancelado'].includes(e.status))
      .sort((a, b) => new Date(a.data_inicio).getTime() - new Date(b.data_inicio).getTime());
  }, [eventos]);

  const colunas = useMemo(() => {
    const porFuncionario = new Map<string, typeof pendentes>();
    const semAtribuicao: typeof pendentes = [];
    for (const ev of pendentes) {
      if (ev.funcionario_id) {
        if (!porFuncionario.has(ev.funcionario_id)) porFuncionario.set(ev.funcionario_id, []);
        porFuncionario.get(ev.funcionario_id)!.push(ev);
      } else {
        semAtribuicao.push(ev);
      }
    }
    return { porFuncionario, semAtribuicao };
  }, [pendentes]);

  const handleMudarResponsavel = async (eventoId: string, funcionarioId: string) => {
    setMovendoId(eventoId);
    await supabase.from('agenda').update({ funcionario_id: funcionarioId || null }).eq('id', eventoId);
    await refresh();
    setMovendoId(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);
    const mesmodia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    const dataStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    const intlLocale = INTL_LOCALE[locale] || 'en-GB';
    if (mesmodia(d, hoje)) return t('hoje', { hora: d.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' }) });
    if (mesmodia(d, amanha)) return t('amanha', { hora: d.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' }) });
    return dataStr;
  };

  const renderCard = (ev: any) => {
    const v = ev.solicitacao?.veiculo;
    const c = ev.solicitacao?.cliente;
    const nome = v ? `${v.fipe_marca} ${v.fipe_modelo}` : ev.titulo;
    const jaChegou = ev.status === 'em_andamento';
    const opcoes = [
      { id: '', label: t('naoAtribuido') },
      ...funcionarios.map((f) => ({ id: f.id, label: f.nome })),
    ];
    return (
      <div key={ev.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${jaChegou ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
            {jaChegou ? t('emServico') : t('agendado')}
          </span>
          <span className="text-[11px] text-gray-400">{formatDate(ev.data_inicio)}</span>
        </div>
        <p className="text-sm font-medium text-gray-900 truncate">
          {nome} {v?.placa && <span className="text-gray-400 font-normal">· {v.placa}</span>}
        </p>
        {c?.nome && <p className="text-xs text-gray-500 truncate">{c.nome}</p>}
        <select
          className="input-field !py-1 !px-2 text-xs mt-2 w-full"
          value={ev.funcionario_id || ''}
          disabled={movendoId === ev.id}
          onChange={(e) => handleMudarResponsavel(ev.id, e.target.value)}
        >
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  };

  if (loading || loadingFunc || !oficina) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
        <p className="text-gray-600 mt-1">
          {t('subtitulo')}
        </p>
      </div>

      {funcionarios.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-2">{t('nenhumFuncionario')}</p>
          <p className="text-sm text-gray-400">
            {t('telaParaDistribuir')}{' '}
            <Link href="/oficina/equipe" className="text-primary-600 hover:underline">{t('equipe')}</Link> {t('quandoTiver')}
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {/* Coluna: nao atribuido */}
          <div className="flex-shrink-0 w-72">
            <div className="bg-gray-100 rounded-t-xl px-3 py-2.5 border border-gray-200">
              <p className="text-sm font-semibold text-gray-700">{t('naoAtribuido')}</p>
              <p className="text-xs text-gray-500">{t('veiculosCount', { count: colunas.semAtribuicao.length })}</p>
            </div>
            <div className="bg-gray-50 border border-t-0 border-gray-200 rounded-b-xl p-2 space-y-2 min-h-[120px]">
              {colunas.semAtribuicao.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">{t('tudoDistribuido')}</p>
              ) : (
                colunas.semAtribuicao.map(renderCard)
              )}
            </div>
          </div>

          {/* Uma coluna por funcionario */}
          {funcionarios.map((f) => {
            const cards = colunas.porFuncionario.get(f.id) || [];
            const emAndamento = cards.filter((c) => c.status === 'em_andamento').length;
            const limite = f.capacidade_maxima;
            const sobrecarga = limite != null && emAndamento >= limite;
            return (
              <div key={f.id} className="flex-shrink-0 w-72">
                <div className={`rounded-t-xl px-3 py-2.5 border ${sobrecarga ? 'bg-red-50 border-red-200' : 'bg-primary-50 border-primary-100'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">{f.nome}</p>
                    <span className="text-[10px] uppercase tracking-wide text-gray-400">
                      {CARGOS_FUNCIONARIO[f.cargo as keyof typeof CARGOS_FUNCIONARIO] ? tc(`cargosFuncionario.${f.cargo}`) : f.cargo}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${sobrecarga ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {t('emServicoAgora', { atual: emAndamento, limite: limite != null ? ` / ${limite}` : '' })} · {t('noTotal', { count: cards.length })}{sobrecarga && ` ${t('noLimite')}`}
                  </p>
                </div>
                <div className="bg-gray-50 border border-t-0 border-gray-200 rounded-b-xl p-2 space-y-2 min-h-[120px]">
                  {cards.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">{t('nadaAtribuido')}</p>
                  ) : (
                    cards.map(renderCard)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        {t('mostraVeiculos')}{' '}
        <Link href="/oficina/capacidade" className="text-primary-600 hover:underline">{t('capacidade')}</Link>.
      </p>
    </div>
  );
}
