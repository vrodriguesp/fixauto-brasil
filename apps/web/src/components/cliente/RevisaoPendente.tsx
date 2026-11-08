'use client';

import TextoTraduzido from '@/components/ui/TextoTraduzido';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { formatCurrency, INTL_LOCALE } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { textoErroApi } from '@/lib/erro-api';
import { fusoDoPais } from '@/lib/fuso';

interface Revisao {
  id: string;
  valor_anterior: number;
  valor_novo: number;
  prazo_dias_novo: number | null;
  motivo: string;
  itens: { descricao: string; quantidade: number; valor_total: number }[];
  oficina: { nome_fantasia: string; pais: string | null } | null;
  // 076: proposta de nova data de entrega (antes do check-in)
  tipo?: 'valor' | 'data';
  nova_data_checkin?: string | null;
  novo_turno?: 'manha' | 'tarde' | null;
  nova_previsao_entrega?: string | null;
}

// O carro ja esta na oficina? (check-in feito, servico andando/feito ou o
// horario marcado ja passou). So entao recusar significa retirar o carro.
const carroNaOficina = (ags: { status: string; checkin_em: string | null; data_inicio: string | null }[]) =>
  ags.some((a) => !!a.checkin_em || a.status === 'em_andamento' || a.status === 'concluido' || (!!a.data_inicio && new Date(a.data_inicio).getTime() <= Date.now()));

// Proposta de revisao de um orcamento JA ACEITO (migracao 049). Nada muda sem
// a decisao do cliente: aprovar | recusar (encerra o servico e o cliente
// retira o carro; com confirmacao). Mesmo padrao de mercado (ClickMechanic:
// trabalho adicional so com aprovacao do cliente).
export default function RevisaoPendente({ solicitacaoId, aoDecidir }: { solicitacaoId: string; aoDecidir?: () => void }) {
  const t = useTranslations('revisaoOrcamento');
  const tMud = useTranslations('agendaMudanca');
  const tErr = useTranslations('erros');
  const locale = useLocale();
  const [rev, setRev] = useState<Revisao | null>(null);
  const [confirmarRetirada, setConfirmarRetirada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<string | null>(null);
  const [naOficina, setNaOficina] = useState(false);
  const [dataAtual, setDataAtual] = useState<string | null>(null);
  // itens do orcamento aceito (antes da revisao): destaca novo/alterado/removido (dono 07/11)
  const [itensAntes, setItensAntes] = useState<{ descricao: string; quantidade: number; valor_total: number }[]>([]);

  useEffect(() => {
    supabase.from('orcamento_revisoes')
      .select('id, orcamento_id, tipo, nova_data_checkin, novo_turno, nova_previsao_entrega, valor_anterior, valor_novo, prazo_dias_novo, motivo, itens, oficina:oficinas(nome_fantasia, pais)')
      .eq('solicitacao_id', solicitacaoId).eq('status', 'pendente').maybeSingle()
      .then(({ data }) => {
        setRev((data as any) || null);
        const orcId = (data as any)?.orcamento_id;
        if (orcId) supabase.from('orcamento_itens').select('descricao, quantidade, valor_total').eq('orcamento_id', orcId).then(({ data: its }) => setItensAntes((its as any) || []));
      });
    supabase.from('agenda').select('status, checkin_em, data_inicio').eq('solicitacao_id', solicitacaoId).neq('status', 'cancelado')
      .then(({ data }) => { setNaOficina(carroNaOficina((data as any) || [])); setDataAtual(((data as any) || []).find((a: any) => a.status === 'agendado')?.data_inicio || null); });
  }, [solicitacaoId]);

  if (feito) return <p role="status" className="card mb-6 bg-green-50 text-green-800">{feito}</p>;
  if (!rev) return null;
  const chave = (d: string) => (d || '').trim().toLowerCase();
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
    setFeito(rev.tipo === 'data' ? tMud(decisao === 'aprovar' ? 'feitoAceita' : 'feitoMantida') : t(decisao === 'recusar' && !naOficina ? 'feito_recusarSemCarro' : `feito_${decisao}`));
    aoDecidir?.();
  };

  if (rev.tipo === 'data') {
    // nova data: aceitar muda o agendamento; manter nao cancela nada
    const fuso = fusoDoPais(rev.oficina?.pais);
    const loc = INTL_LOCALE[locale] || 'en-GB';
    const nova = `${new Date(`${rev.nova_data_checkin}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}, ${tMud(rev.novo_turno === 'tarde' ? 'tarde' : 'manha')}`;
    return (
      <section className="card mb-6 border-2 border-blue-400 bg-blue-50" aria-labelledby="revisao-titulo" data-testid="proposta-nova-data">
        <h2 id="revisao-titulo" className="text-lg font-semibold text-gray-900">📅 {tMud('dataTitulo', { oficina: rev.oficina?.nome_fantasia || '' })}</h2>
        <dl className="mt-2 text-sm text-gray-800 space-y-1">
          {dataAtual && <div><dt className="inline text-gray-600">{tMud('dataDe')}: </dt><dd className="inline line-through">{new Date(dataAtual).toLocaleString(loc, { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</dd></div>}
          <div><dt className="inline text-gray-600">{tMud('dataPara')}: </dt><dd className="inline font-bold">{nova}</dd></div>
          {rev.nova_previsao_entrega && <div><dd>{tMud('previsaoNova', { data: new Date(`${rev.nova_previsao_entrega}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) })}</dd></div>}
        </dl>
        <p className="mt-3 text-sm text-gray-800"><span className="font-medium">{tMud('motivoOficina')}:</span> <TextoTraduzido compacto texto={rev.motivo} /></p>
        <p className="mt-3 text-xs text-gray-600">{tMud('dataExplicacao')}</p>
        {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <button type="button" disabled={enviando} onClick={() => decidir('aprovar')} className="btn-primary disabled:opacity-50">{tMud('aceitarData')}</button>
          <button type="button" disabled={enviando} onClick={() => decidir('recusar')} className="btn-secondary disabled:opacity-50">{tMud('manterData')}</button>
        </div>
      </section>
    );
  }

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
        <ul className="mt-3 text-sm divide-y divide-amber-200 border-t border-amber-200" data-testid="revisao-itens">
          {rev.itens.map((it, i) => {
            const antes = itensAntes.find((a) => chave(a.descricao) === chave(it.descricao));
            const estado = !itensAntes.length ? null : !antes ? 'novo' : (Number(antes.quantidade) !== Number(it.quantidade) || Number(antes.valor_total) !== Number(it.valor_total)) ? 'alterado' : null;
            return (
              <li key={i} className={`flex justify-between gap-3 py-1.5 ${estado ? 'font-medium' : ''}`} data-estado={estado || undefined}>
                <span className="min-w-0 break-words">
                  {estado && <span className={`mr-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${estado === 'novo' ? 'bg-green-100 text-green-800' : 'bg-amber-200 text-amber-900'}`}>{tMud(estado === 'novo' ? 'itemNovo' : 'itemAlterado')}</span>}
                  {it.quantidade > 1 ? `${it.quantidade}× ` : ''}<TextoTraduzido compacto texto={it.descricao} />
                </span>
                <span className="whitespace-nowrap text-right">
                  {fmt(it.valor_total)}
                  {estado === 'alterado' && antes && <span className="block text-xs font-normal text-gray-500 line-through">{fmt(antes.valor_total)}</span>}
                </span>
              </li>
            );
          })}
          {itensAntes.filter((a) => !rev.itens.some((it) => chave(it.descricao) === chave(a.descricao))).map((a, i) => (
            <li key={`r${i}`} className="flex justify-between gap-3 py-1.5 text-gray-500" data-estado="removido">
              <span className="min-w-0 break-words"><span className="mr-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">{tMud('itemRemovido')}</span><span className="line-through"><TextoTraduzido compacto texto={a.descricao} /></span></span>
              <span className="whitespace-nowrap line-through">{fmt(a.valor_total)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-gray-600">{t(naOficina ? 'explicacao' : 'explicacaoSemCarro')}</p>
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
      {confirmarRetirada ? (
        <div role="alertdialog" className="mt-4 rounded-lg border border-red-300 bg-white p-3">
          <p className="text-sm text-gray-900 mb-3">{t(naOficina ? 'retirarConfirma' : 'recusarSemCarroConfirma')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={enviando} onClick={() => decidir('recusar')} className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">{t(naOficina ? 'retirarSim' : 'recusarSemCarroSim')}</button>
            <button type="button" onClick={() => setConfirmarRetirada(false)} className="btn-secondary">{t('voltar')}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <button type="button" disabled={enviando} onClick={() => decidir('aprovar')} className="btn-success disabled:opacity-50">{t('aprovar')}</button>
          <button type="button" disabled={enviando} onClick={() => setConfirmarRetirada(true)} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-medium hover:bg-red-50">{t(naOficina ? 'recusar' : 'recusarSemCarro')}</button>
        </div>
      )}
    </section>
  );
}
