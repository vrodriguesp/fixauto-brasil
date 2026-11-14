'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { INTL_LOCALE } from '@/lib/utils';
import { diaEscolhivel, hojeLocal, somarDias, type ContextoOficina } from '@/lib/turnos';

// Mini calendario do check-in (check-in v2, D.5): mes no fuso da oficina, semana comecando na segunda;
// dias passados, dias fechados pelo perfil e dias sem nenhuma faixa (hoje ja acabou) ficam DESATIVADOS
// (disabled + aria-disabled, fora da ordem do Tab). O proximo dia aberto vem so REALCADO (borda), nunca
// escolhido sozinho (decisao 1: campo vazio). Sem biblioteca.
export default function MiniCalendario({ mes, aoMudarMes, escolhido, realce, aoEscolher, ctx, pais, minMes, maxMes, testid = 'ck' }: {
  mes: string; // 'YYYY-MM'
  aoMudarMes: (mes: string) => void;
  escolhido: string;
  realce?: string;
  aoEscolher: (ymd: string) => void;
  ctx: ContextoOficina | null | undefined;
  pais: string | null | undefined;
  minMes: string; maxMes: string;
  testid?: string;
}) {
  const t = useTranslations('seletorCheckin');
  const locale = useLocale();
  const intl = INTL_LOCALE[locale] || locale;
  const hoje = hojeLocal(new Date(), pais ?? null);
  const [ano, m] = mes.split('-').map(Number);
  const primeiro = `${mes}-01`;
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  // segunda = 0 ... domingo = 6
  const vazios = (new Date(`${primeiro}T12:00:00Z`).getUTCDay() + 6) % 7;
  const titulo = new Date(`${primeiro}T12:00:00Z`).toLocaleDateString(intl, { timeZone: 'UTC', month: 'long', year: 'numeric' });
  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(`${somarDias('2026-11-16', i)}T12:00:00Z`).toLocaleDateString(intl, { timeZone: 'UTC', weekday: 'short' })), [intl]);
  const outroMes = (n: number) => { const d = new Date(Date.UTC(ano, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const longo = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(intl, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div data-testid={`${testid}-calendario`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => aoMudarMes(outroMes(-1))} disabled={mes <= minMes} aria-label={t('mesAnterior')} data-testid={`${testid}-mes-anterior`}
          className="h-11 w-11 rounded-full text-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30">‹</button>
        <p className="text-base font-semibold capitalize text-gray-900" aria-live="polite" data-testid={`${testid}-mes`}>{titulo}</p>
        <button type="button" onClick={() => aoMudarMes(outroMes(1))} disabled={mes >= maxMes} aria-label={t('mesSeguinte')} data-testid={`${testid}-mes-seguinte`}
          className="h-11 w-11 rounded-full text-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label={titulo}>
        {semana.map((d, i) => <div key={i} className="pb-1 text-[11px] font-medium uppercase text-gray-500" aria-hidden="true">{d.replace('.', '')}</div>)}
        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} aria-hidden="true" />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const ymd = `${mes}-${String(i + 1).padStart(2, '0')}`;
          const pode = diaEscolhivel(ymd, ctx, new Date(), pais ?? null);
          const sel = ymd === escolhido;
          const ehHoje = ymd === hoje;
          const ehRealce = !sel && pode && ymd === realce;
          return (
            <button key={ymd} type="button" disabled={!pode} aria-disabled={!pode || undefined} aria-pressed={sel}
              aria-label={`${longo(ymd)}${ehHoje ? ` (${t('hoje')})` : ''}${!pode ? ` – ${t('diaIndisponivel')}` : ehRealce ? ` – ${t('proximoAberto')}` : ''}`}
              onClick={() => aoEscolher(ymd)} data-testid={`${testid}-dia-${ymd}`} data-estado={!pode ? 'desativado' : sel ? 'escolhido' : ehRealce ? 'realce' : 'livre'}
              className={`relative h-11 rounded-lg text-sm tabular-nums transition-colors ${
                sel ? 'bg-primary-600 font-semibold text-white'
                  : !pode ? 'cursor-not-allowed bg-transparent text-gray-300 line-through decoration-gray-300'
                    : ehRealce ? 'border-2 border-primary-500 font-semibold text-primary-800 hover:bg-primary-50'
                      : 'text-gray-900 hover:bg-primary-50'}`}>
              {i + 1}
              {ehHoje && <span aria-hidden="true" className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${sel ? 'bg-white' : 'bg-primary-500'}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
