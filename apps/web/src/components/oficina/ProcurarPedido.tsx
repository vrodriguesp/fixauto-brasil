'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';
import { Link, useRouter } from '@/i18n/navigation';
import { INTL_LOCALE, rotuloTipoPedido } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { fusoDoPais } from '@/lib/fuso';

// Procurar o carro/pedido (pedido do dono 10/10): o cliente chega no balcao e a
// oficina acha pela placa, pelo nome, pelo numero do pedido ou pelo codigo de
// cliente (placa nao e obrigatoria). Usa a funcao procurar_na_oficina
// (migracao 061), que respeita as permissoes de quem procura.
// compacto: caixa no topo de Hoje/Pedidos com ate 6 resultados; Enter abre a pagina.

export type Achado = {
  solicitacao_id: string | null; numero: number | null; pedido_status: string | null; tipo: string | null; criado_em: string;
  cliente_nome: string | null; cliente_codigo: number | null; telefone: string | null; placa: string | null; carro: string | null;
  agenda_id: string | null; agenda_status: string | null; data_inicio: string | null; titulo: string | null;
};

export default function ProcurarPedido({ compacto = false, inicial = '' }: { compacto?: boolean; inicial?: string }) {
  const t = useTranslations('oficinaProcurar');
  const tc = useTranslations('constants');
  const locale = useLocale();
  const router = useRouter();
  const { oficina } = useAuth();
  const fuso = fusoDoPais((oficina as any)?.pais ?? null);
  const [q, setQ] = useState(inicial);
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const pedidoAtual = useRef(0);

  useEffect(() => { setQ(inicial); }, [inicial]);
  useEffect(() => {
    const txt = q.trim();
    if (txt.length < 2) { setAchados(null); return; }
    const n = ++pedidoAtual.current;
    setCarregando(true);
    const espera = setTimeout(async () => {
      const { data } = await supabase.rpc('procurar_na_oficina', { p_q: txt });
      if (n !== pedidoAtual.current) return;
      setAchados((data as Achado[]) || []); setCarregando(false);
    }, 300);
    return () => clearTimeout(espera);
  }, [q]);

  const fmtDia = new Intl.DateTimeFormat(INTL_LOCALE[locale] || locale, { day: '2-digit', month: '2-digit', timeZone: fuso });
  const situacao = (a: Achado) => {
    if (a.agenda_status && ['agendado', 'em_andamento', 'concluido'].includes(a.agenda_status)) return t(`agenda_${a.agenda_status}`, { dia: a.data_inicio ? fmtDia.format(new Date(a.data_inicio)) : '' });
    if (a.pedido_status && tc.has(`statusSolicitacao.${a.pedido_status}`)) return tc(`statusSolicitacao.${a.pedido_status}`);
    return '';
  };
  const lista = compacto ? (achados || []).slice(0, 6) : achados || [];
  const abrirPagina = () => { if (q.trim().length >= 2) router.push(`/oficina/procurar?q=${encodeURIComponent(q.trim())}`); };

  return (
    <div className={compacto ? 'relative mb-4' : ''}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); if (compacto) abrirPagina(); }}>
        <label className="sr-only" htmlFor={compacto ? 'procurar-compacto' : 'procurar'}>{t('rotulo')}</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400" aria-hidden="true">🔍</span>
          <input id={compacto ? 'procurar-compacto' : 'procurar'} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!compacto}
            placeholder={t('placeholder')} autoComplete="off" data-testid="procurar-campo"
            className="input-field !pl-10 min-h-[48px]" />
        </div>
      </form>
      {!compacto && <p className="mt-2 text-sm text-gray-500">{t('dica')}</p>}

      {q.trim().length >= 2 && (
        <div className={compacto ? 'absolute inset-x-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg' : 'mt-4'} data-testid="procurar-resultados">
          {carregando && !achados ? <p className="p-3 text-sm text-gray-500">{t('procurando')}</p>
            : lista.length === 0 ? <p className="p-3 text-sm text-gray-600">{t('nada')}</p>
            : (
              <ul className={compacto ? 'divide-y divide-gray-100' : 'space-y-3'}>
                {lista.map((a) => (
                  <li key={`${a.agenda_id || ''}${a.solicitacao_id || ''}`} className={compacto ? 'p-2' : 'card !p-4'} data-testid="procurar-achado">
                    <p className="font-semibold text-gray-900">
                      {a.carro || a.titulo || '—'}
                      {a.placa && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono">{a.placa}</span>}
                      {a.numero && <span className="ml-1.5 text-sm font-normal text-gray-500">{tc('numeroPedido', { n: a.numero })}</span>}
                    </p>
                    <p className="text-sm text-gray-600">
                      {[a.cliente_nome, a.cliente_codigo ? tc('codigoCliente', { n: a.cliente_codigo }) : null, a.tipo ? rotuloTipoPedido(tc, a.tipo, null) : null, situacao(a)].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
                      {a.agenda_id && <Link href={`/oficina/hoje?ev=${a.agenda_id}`} className="text-primary-700 hover:underline">{t('abrirHoje')} ›</Link>}
                      {a.solicitacao_id && <Link href={`/oficina/pedidos/${a.solicitacao_id}`} className="text-primary-700 hover:underline">📄 {t('verPedido')}</Link>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          {compacto && (achados?.length || 0) > 6 && <button type="button" onClick={abrirPagina} className="w-full p-2 text-sm font-medium text-primary-700 hover:underline">{t('verTodos', { n: achados!.length })}</button>}
        </div>
      )}
    </div>
  );
}
