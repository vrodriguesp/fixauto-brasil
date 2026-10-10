'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { Link } from '@/i18n/navigation';
import { INTL_LOCALE, formatCurrency } from '@/lib/utils';
import { currencyForCountry } from '@/lib/currency';
import { diaNaOficina } from '@/lib/fuso';
import { carregarDesempenho, type Desempenho, type Periodo } from '@/lib/desempenho';
import { Barras, BarrasHorizontais, Linha } from '@/components/graficos/Graficos';

// "Desempenho": como a oficina esta indo (auditoria do painel 10/10, secao E).
// Cada bloco = uma pergunta, um numero grande, um grafico simples e uma frase
// dizendo o que fazer com ele. Oficina nova ve um cartao do que fazer primeiro.

const PERIODOS: Periodo[] = ['4s', '3m', '12m'];
const COR = { recebidos: '#94a3b8', respondidos: '#0284c7', ganhos: '#059669' };

export default function DesempenhoPage() {
  const t = useTranslations('oficinaDesempenho');
  const te = useTranslations('oficinaHoje');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const { user, oficina, funcionario } = useAuth();
  const pais = (oficina as any)?.pais ?? null;
  const moeda = currencyForCountry(pais);
  const [periodo, setPeriodo] = useState<Periodo>('4s');
  const [d, setD] = useState<Desempenho | null>(null);
  // ver um grafico so (pedido do dono 10/10)
  const [so, setSo] = useState<string>('tudo');
  const ve = (id: string) => so === 'tudo' || so === id;

  useEffect(() => {
    if (!oficina || !user || funcionario?.cargo === 'mecanico') return;
    setD(null);
    carregarDesempenho({ oficinaId: oficina.id, donoProfileId: oficina.profile_id || user.id, pais, periodo, hoje: diaNaOficina(new Date(), pais), intl }).then(setD).catch(() => setD(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oficina?.id, user?.id, periodo, intl]);

  const duracao = (min: number | null) => {
    if (min == null) return '—';
    const m = Math.round(min);
    if (m < 60) return t('min', { n: m });
    const h = Math.floor(m / 60);
    return h < 24 ? (m % 60 ? t('horasMin', { h, m: m % 60 }) : t('horas', { h })) : t('dias', { d: Math.round(h / 24) });
  };
  const corResposta = (min: number | null) => (min == null ? 'bg-gray-100 text-gray-700' : min < 60 ? 'bg-emerald-100 text-emerald-800' : min <= 240 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800');
  const rotulos = useMemo(() => d?.faixas.map((f) => f.rotulo) || [], [d]);
  const dinheiro = (v: number) => formatCurrency(v, moeda, locale);
  // etiqueta do grafico: dinheiro curto e sem centavos (21 mil €), para caber em cima da barra
  const dinheiroCurto = (v: number) => { try { return new Intl.NumberFormat(intl, { style: 'currency', currency: moeda, notation: 'compact', maximumFractionDigits: v >= 1000 ? 1 : 0 }).format(v); } catch { return dinheiro(v); } };

  const Bloco = ({ titulo, numero, sub, frase, children, testid }: { titulo: string; numero?: React.ReactNode; sub?: React.ReactNode; frase: string; children?: React.ReactNode; testid?: string }) => (
    <section className="card" data-testid={testid}>
      <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
      {numero != null && <p className="mt-1 text-3xl font-bold text-gray-900">{numero}</p>}
      {sub && <p className="text-sm text-gray-600">{sub}</p>}
      {children && <div className="mt-3">{children}</div>}
      <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">💡 {frase}</p>
    </section>
  );

  if (funcionario?.cargo === 'mecanico') return <div className="max-w-3xl mx-auto px-4 py-10 text-center text-gray-600">{t('soDono')}</div>;

  const taxa = d && d.totais.recebidos ? Math.round((10 * d.totais.respondidos) / d.totais.recebidos) : null;
  const ganhoDe10 = d && d.totais.recebidos ? Math.round((10 * d.totais.ganhos) / d.totais.recebidos) : null;
  const diff = (agora: number, antes: number) => (antes === 0 && agora === 0 ? '' : agora >= antes ? t('maisQueAntes', { n: agora - antes }) : t('menosQueAntes', { n: antes - agora }));
  // grafico sempre que houver algum dado no periodo (antes sumia com menos de 3 periodos - teste do dono 10/10)
  const temSerie = !!d && (d.recebidos.some((x) => x > 0) || d.respondidos.some((x) => x > 0));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
      <p className="text-gray-600 mb-4">{t('subtitulo')}</p>
      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1" role="group" aria-label={t('periodo')}>
        {PERIODOS.map((p) => (
          <button key={p} type="button" aria-pressed={periodo === p} onClick={() => setPeriodo(p)}
            className={`min-h-[44px] rounded-lg text-sm font-medium ${periodo === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>{t(`periodo_${p}`)}</button>
        ))}
      </div>

      {!d ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : !d.temDados ? (
        <div className="card text-center py-10" data-testid="desempenho-vazio">
          <p className="text-4xl mb-3" aria-hidden="true">📈</p>
          <p className="text-gray-700 mb-4">{t('vazio')}</p>
          <Link href="/oficina/pedidos" className="btn-primary">{t('verPedidos')}</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label={t('filtrar')}>
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {['tudo', 'pedidos', 'resposta', 'receita', 'nota', 'prazo', ...(d.porEtapa.length ? ['etapas'] : []), ...(d.naoVieram ? ['naoVieram'] : [])].map((id) => (
                <button key={id} type="button" onClick={() => setSo(id)} aria-pressed={so === id} data-testid={`filtro-${id}`}
                  className={`min-h-[40px] whitespace-nowrap rounded-full border px-3 text-sm font-medium ${so === id ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{t(`f_${id}`)}</button>
              ))}
            </div>
          </div>
          {ve('pedidos') && <Bloco testid="bloco-pedidos" titulo={t('q_pedidos')} numero={t('nPedidos', { recebidos: d.totais.recebidos, respondidos: d.totais.respondidos, ganhos: d.totais.ganhos })} sub={diff(d.totais.recebidos, d.totais.recebidosAntes) ? `${t('recebidosLegenda')}: ${diff(d.totais.recebidos, d.totais.recebidosAntes)}` : undefined}
            frase={taxa != null && ganhoDe10 != null ? t('frasePedidos', { respondeu: taxa, ganhou: ganhoDe10 }) : t('frasePedidosSemRecebidos')}>
            {temSerie && <Barras titulo={t('q_pedidos')} rotulos={rotulos} series={[{ nome: t('recebidosLegenda'), cor: COR.recebidos, valores: d.recebidos }, { nome: t('respondidosLegenda'), cor: COR.respondidos, valores: d.respondidos }, { nome: t('ganhosLegenda'), cor: COR.ganhos, valores: d.ganhos }]} />}
          </Bloco>}

          {ve('resposta') && <Bloco testid="bloco-resposta" titulo={t('q_resposta')} numero={<span className={`inline-block rounded-lg px-2 ${corResposta(d.respostaMedianaMin)}`}>{duracao(d.respostaMedianaMin)}</span>} sub={t('respostaSub')} frase={t('fraseResposta')}>
            {temSerie && <Linha titulo={t('q_resposta')} rotulos={rotulos} valores={d.respostaPorFaixa.map((v) => (v == null ? null : Math.round(v)))} formatar={(n) => duracao(n)} />}
          </Bloco>}

          {ve('receita') && <Bloco testid="bloco-receita" titulo={t('q_receita')} numero={dinheiro(d.receitaTotal)} sub={t('receitaSub', { entregue: dinheiro(d.receitaEntregue) })} frase={t('fraseReceita')}>
            {temSerie && d.receitaTotal > 0 && <Barras titulo={t('q_receita')} rotulos={rotulos} series={[{ nome: t('q_receita'), cor: COR.ganhos, valores: d.receita.map((v) => Math.round(v)) }]} formatar={(n) => dinheiro(n)} etiqueta={dinheiroCurto} />}
          </Bloco>}

          {ve('nota') && <Bloco testid="bloco-nota" titulo={t('q_nota')} numero={d.nota != null ? `${d.nota.toFixed(1)} ★` : '—'} sub={t('notaSub', { n: d.totalAvaliacoes })} frase={t('fraseNota')}>
            {d.ultimasAvaliacoes.length > 0 && (
              <ul className="space-y-2">
                {d.ultimasAvaliacoes.map((a, i) => <li key={i} className="text-sm"><span className="text-amber-500" aria-label={`${a.nota}/5`}>{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</span> <span className="text-gray-700">{a.comentario}</span></li>)}
              </ul>
            )}
          </Bloco>}

          {ve('prazo') && <Bloco testid="bloco-prazo" titulo={t('q_prazo')} numero={d.entregues ? t('nDeN', { a: d.noPrazo, b: d.entregues }) : '—'} frase={t('frasePrazo')}>
            {d.entregues > 0 && (
              <div className="h-4 rounded-full bg-red-100" aria-hidden="true"><div className="h-4 rounded-full bg-emerald-500" style={{ width: `${(100 * d.noPrazo) / d.entregues}%` }} /></div>
            )}
          </Bloco>}

          {ve('etapas') && d.porEtapa.length > 0 && (
            <Bloco testid="bloco-etapas" titulo={t('q_etapas')} frase={t('fraseEtapas')}>
              <BarrasHorizontais titulo={t('q_etapas')} itens={d.porEtapa.map((e) => ({ rotulo: te(`etapa_${e.status}`), valor: Math.round(e.horas * 10) / 10 }))} formatar={(h) => duracao(h * 60)} />
            </Bloco>
          )}

          {ve('naoVieram') && d.naoVieram > 0 && (
            <Bloco testid="bloco-naovieram" titulo={t('q_naoVieram')} numero={d.naoVieram} frase={t('fraseNaoVieram')} />
          )}
        </div>
      )}
    </div>
  );
}
