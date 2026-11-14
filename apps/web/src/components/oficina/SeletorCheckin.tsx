'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { INTL_LOCALE } from '@/lib/utils';
import InfoI from '@/components/ui/InfoI';
import MiniCalendario from '@/components/oficina/MiniCalendario';
import AvisoHorarioSlot, { useAvisoJanela } from '@/components/oficina/AvisoHorarioSlot';
import {
  faixasValidas, formatarJanela, hojeLocal, opcoesOutroHorario, primeiroDiaComFaixa, somarDias, diaDoCalendario,
  type ContextoOficina, type Janela,
} from '@/lib/turnos';

// Seletor das datas de check-in (check-in v2, decisoes finais 14/11 noite). Usado no formulario do
// orcamento, na resposta a "novas datas" (079) e na mudanca de data do orcamento aceito (077):
//  - comeca VAZIO; "+ Lisa check-ini aeg" abre a folha (embaixo no celular, centro no computador) com o
//    mini calendario (dias passados/fechados desativados) e, escolhido o dia, as faixas do perfil
//    (recepcao ou grade de 2 h pulando o almoco) + "Outro horario" opcional (30 em 30 min);
//  - tocar numa faixa adiciona a linha e fecha a folha; a mesma faixa no mesmo dia nao repete;
//  - o tempo de execucao NAO limita nada (D2).
export type LinhaCheckin = { data: string; hora_inicio: string; hora_fim: string; previsao?: string };
const chave = (l: { data: string; hora_inicio: string; hora_fim: string }) => `${l.data}|${l.hora_inicio}|${l.hora_fim}`;
const mesDe = (ymd: string) => ymd.slice(0, 7);
const tid = (h: string) => h.replace(':', '');

export default function SeletorCheckin({
  linhas, aoMudar, ctx, pais, prazoDias, max = 5, erro = false, testid = 'ck', mostrarPrevisao = true, rotuloAdicionar, aoAdicionar, extraLinha,
}: {
  linhas: LinhaCheckin[];
  aoMudar: (linhas: LinhaCheckin[]) => void;
  ctx: ContextoOficina | null | undefined;
  pais: string | null | undefined;
  prazoDias?: number;
  max?: number;
  erro?: boolean;
  testid?: string;
  mostrarPrevisao?: boolean;
  rotuloAdicionar?: string;
  aoAdicionar?: (l: LinhaCheckin) => void;
  /** conteudo extra embaixo de cada linha (ex.: previsao de entrega editavel no 079) */
  extraLinha?: (l: LinhaCheckin, i: number) => React.ReactNode;
}) {
  const t = useTranslations('seletorCheckin');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [outro, setOutro] = useState(false);
  const [oIni, setOIni] = useState('');
  const [oFim, setOFim] = useState('');
  const botaoAbrir = useRef<HTMLButtonElement>(null);
  const folha = useRef<HTMLDivElement>(null);
  const avisoJanela = useAvisoJanela(ctx?.horario, pais);
  const hoje = hojeLocal(new Date(), pais ?? null);
  const ultima = linhas.map((l) => l.data).filter(Boolean).sort().at(-1);
  // realce: proximo dia aberto (depois da ultima data escolhida, para a 2a data abrir no dia seguinte)
  const realce = useMemo(() => primeiroDiaComFaixa(new Date(), pais ?? null, ctx, ultima), [pais, ctx, ultima]);
  const minMes = mesDe(hoje), maxMes = mesDe(somarDias(hoje, 119));
  const temRecepcao = !!(ctx?.recepcao_inicio && ctx?.recepcao_fim);
  const usadas = new Set(linhas.map(chave));
  const faixas: Janela[] = dia ? faixasValidas(dia, ctx, new Date(), pais ?? null) : [];
  const outras = dia ? opcoesOutroHorario(dia, ctx, new Date(), pais ?? null) : { inicios: [], fins: () => [] as string[] };
  const finsOutro = oIni ? outras.fins(oIni) : [];
  const previsaoDe = (d: string) => (d && prazoDias != null ? somarDias(d, Math.max(0, prazoDias)) : '');

  const abrir = () => {
    setDia(''); setOutro(false); setOIni(''); setOFim('');
    setMes(mesDe(realce < hoje ? hoje : realce));
    setAberto(true);
  };
  const fechar = () => { setAberto(false); setTimeout(() => botaoAbrir.current?.focus(), 0); };
  const adicionar = (j: Janela) => {
    if (!dia) return;
    const nova: LinhaCheckin = { data: dia, hora_inicio: j.inicio, hora_fim: j.fim, ...(prazoDias != null ? { previsao: previsaoDe(dia) } : {}) };
    if (usadas.has(chave(nova))) return;
    const novas = [...linhas, nova].sort((a, b) => chave(a).localeCompare(chave(b)));
    aoMudar(novas);
    aoAdicionar?.(nova);
    fechar();
  };
  // folha aberta: Esc fecha, foco no primeiro controle, rolagem da pagina presa (celular)
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => folha.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus(), 0);
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = antes; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- so ao abrir/fechar
  }, [aberto]);

  const tituloDia = dia ? diaDoCalendario(dia, intl, { weekday: 'short', day: 'numeric', month: 'short' }) : '';

  return (
    <div data-testid={`${testid}-seletor`}>
      {linhas.length > 0 && (
        <ul className="mb-2 space-y-2" data-testid={`${testid}-linhas`}>
          {linhas.map((l, i) => {
            const av = avisoJanela(l.data, { inicio: l.hora_inicio, fim: l.hora_fim });
            return (
              <li key={chave(l)} className={`rounded-lg border bg-white p-2.5 ${av?.tipo === 'fechado' ? 'border-red-300' : 'border-gray-200'}`} data-testid={`${testid}-linha-${i}`}
                data-data={l.data} data-inicio={l.hora_inicio} data-fim={l.hora_fim}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900" data-testid={`${testid}-linha-${i}-texto`}>
                    {diaDoCalendario(l.data, intl, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatarJanela({ inicio: l.hora_inicio, fim: l.hora_fim })}
                  </span>
                  {mostrarPrevisao && prazoDias != null && l.data && (
                    <span className="text-xs text-gray-500">{t('valmimine', { data: diaDoCalendario(previsaoDe(l.data), intl, { day: '2-digit', month: '2-digit' }) })}</span>
                  )}
                  <button type="button" onClick={() => aoMudar(linhas.filter((_, j) => j !== i))} data-testid={`${testid}-remover-${i}`}
                    aria-label={t('remover', { quando: `${diaDoCalendario(l.data, intl)} ${formatarJanela({ inicio: l.hora_inicio, fim: l.hora_fim })}` })}
                    className="-m-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-red-500 hover:bg-red-50 hover:text-red-700">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <AvisoHorarioSlot aviso={av} id={`${testid}-aviso-${i}`} testid={`${testid}-aviso-${i}`} testidLink={`${testid}-link-horario-${i}`} />
                {extraLinha?.(l, i)}
              </li>
            );
          })}
        </ul>
      )}

      {linhas.length < max && (
        <div className="flex flex-wrap items-center gap-2">
          <button ref={botaoAbrir} type="button" onClick={abrir} data-testid={`${testid}-adicionar`} aria-haspopup="dialog" aria-invalid={erro || undefined}
            className={`min-h-[48px] flex-1 rounded-lg border-2 border-dashed px-3 py-2.5 text-left text-sm font-semibold transition-colors ${erro ? 'border-red-400 bg-red-50 text-red-800' : 'border-primary-300 text-primary-700 hover:border-primary-500 hover:bg-primary-50'}`}>
            {rotuloAdicionar || (linhas.length ? t('adicionarOutro') : t('adicionar'))}
          </button>
          <InfoI rotulo={t('infoAdicionarRotulo')} texto={t('infoAdicionar')} testid={`${testid}-info-adicionar`} />
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={fechar} data-testid={`${testid}-folha-fundo`}>
          <div ref={folha} role="dialog" aria-modal="true" aria-labelledby={`${testid}-folha-titulo`} onClick={(e) => e.stopPropagation()} data-testid={`${testid}-folha`}
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 id={`${testid}-folha-titulo`} className="text-base font-semibold text-gray-900">{t('tituloFolha')}</h3>
              <button type="button" onClick={fechar} aria-label={t('fechar')} data-testid={`${testid}-fechar`} data-foco-inicial
                className="-m-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-2 text-sm font-medium text-gray-700">{t('valiPaev')}</p>
            <MiniCalendario mes={mes} aoMudarMes={setMes} escolhido={dia} realce={realce} ctx={ctx} pais={pais} minMes={minMes} maxMes={maxMes} testid={testid}
              aoEscolher={(d) => { setDia(d); setOutro(false); setOIni(''); setOFim(''); }} />
            <p className="mt-2 text-xs text-gray-500">
              {t('legenda')}{' '}
              <Link href="/oficina/perfil#horario-funcionamento" target="_blank" rel="noopener" className="font-medium text-primary-700 underline" data-testid={`${testid}-link-perfil`}>{t('linkPerfil')} ↗</Link>
            </p>

            {dia && (
              <div className="mt-4 border-t border-gray-100 pt-3" data-testid={`${testid}-faixas`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-700">{t('valiAeg', { dia: tituloDia })}</p>
                  <InfoI rotulo={t('infoValiAegRotulo')} texto={temRecepcao ? t('infoValiAegRecepcao') : t('infoValiAegGrade')} testid={`${testid}-info-faixas`} />
                </div>
                {faixas.length === 0 && <p className="text-sm text-gray-600">{t('semFaixa')}</p>}
                <div className="flex flex-wrap gap-2">
                  {faixas.map((j) => {
                    const usada = usadas.has(chave({ data: dia, hora_inicio: j.inicio, hora_fim: j.fim }));
                    return (
                      <button key={`${j.inicio}-${j.fim}`} type="button" disabled={usada} onClick={() => adicionar(j)} title={usada ? t('jaEscolhida') : undefined}
                        data-testid={`${testid}-faixa-${tid(j.inicio)}-${tid(j.fim)}`}
                        className="min-h-[44px] rounded-full border border-primary-300 bg-white px-4 text-sm font-semibold tabular-nums text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400">
                        {formatarJanela(j)}{usada ? ' ✓' : ''}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => setOutro((o) => !o)} aria-expanded={outro} data-testid={`${testid}-outro`}
                    className="min-h-[44px] rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    {t('outroHorario')} {outro ? '▴' : '▾'}
                  </button>
                </div>
                {!temRecepcao && <p className="mt-2 text-xs text-gray-500" data-testid={`${testid}-dica-perfil`}>{t('dicaPerfil')}</p>}
                {outro && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3" data-testid={`${testid}-outro-painel`}>
                    <label className="text-xs text-gray-600">{t('outroInicio')}
                      <select className="input-field mt-0.5 !w-28" value={oIni} data-testid={`${testid}-outro-inicio`}
                        onChange={(e) => { setOIni(e.target.value); const fs = outras.fins(e.target.value); setOFim(fs[0] || ''); }}>
                        <option value="">—</option>
                        {outras.inicios.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-gray-600">{t('outroFim')}
                      <select className="input-field mt-0.5 !w-28" value={oFim} disabled={!oIni} data-testid={`${testid}-outro-fim`} onChange={(e) => setOFim(e.target.value)}>
                        {finsOutro.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={!oIni || !oFim || usadas.has(chave({ data: dia, hora_inicio: oIni, hora_fim: oFim }))} onClick={() => adicionar({ inicio: oIni, fim: oFim })}
                      data-testid={`${testid}-outro-adicionar`} className="btn-primary min-h-[44px] !py-2 text-sm disabled:opacity-50">{t('outroAdicionar')}</button>
                    <p className="basis-full text-xs text-gray-500">{t('outroAjuda')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
