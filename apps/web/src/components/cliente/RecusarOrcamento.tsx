'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';
import { MOTIVOS_RECUSA, type MotivoRecusa } from '@/lib/recusa';

// "Recusar" com motivo em 1 toque (migracao 114, dono 21/11): preco | data | distancia | ja resolvi | outro,
// opcional, gravado em orcamentos.recusado_motivo e mostrado a oficina em palavras simples. Substitui o
// confirm() do navegador por uma folha. Com "a data nao serve" a folha oferece "pedir outra data" em vez de recusar.
// aoRecusado(outrosAtivos): a pagina decide o que vem depois (recarregar / perguntar se cancela o pedido).
const ICONE: Record<MotivoRecusa, string> = { preco: '💶', data: '📅', distancia: '📍', resolvido: '✅', outro: '💬' };

export default function RecusarOrcamento({ orcamentoId, emAndamento = false, podePedirData = false, aoPedirData, aoRecusado, discreto = true }: {
  orcamentoId: string; emAndamento?: boolean; podePedirData?: boolean; aoPedirData?: () => void; aoRecusado: (outrosAtivos: number) => void | Promise<void>; discreto?: boolean;
}) {
  const t = useTranslations('recusaMotivo');
  const tErr = useTranslations('erros');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRecusa | ''>('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const botaoAbrir = useRef<HTMLButtonElement>(null);
  const folha = useRef<HTMLDivElement>(null);

  const fechar = () => { if (enviando) return; setAberto(false); setErro(''); setTimeout(() => botaoAbrir.current?.focus(), 0); };
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

  const recusar = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/orcamento/${orcamentoId}/recusar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: motivo || null }) });
      const c = await r.json().catch(() => ({}));
      // ja recusado/aceito em outra aba: a pagina recarrega do mesmo jeito
      if (!r.ok && c?.codigo !== 'ORCAMENTO_INDISPONIVEL') { setErro(textoErroApi(tErr, r.status, c)); return; }
      setAberto(false);
      await aoRecusado(Number(c?.outrosAtivos ?? 0));
    } catch {
      setErro(tErr('GENERICO'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button ref={botaoAbrir} type="button" onClick={() => { setMotivo(''); setErro(''); setAberto(true); }} data-testid="abrir-recusar"
        className={discreto ? 'min-h-[48px] w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-red-300 hover:text-red-700 transition-colors' : 'btn-secondary min-h-[48px] w-full'}>
        {t('botao')}
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={fechar} data-testid="folha-recusar">
          <div ref={folha} role="dialog" aria-modal="true" aria-labelledby="recusar-titulo" onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <h3 id="recusar-titulo" className="text-lg font-bold text-gray-900">{t('titulo')}</h3>
            <p className="mt-1 text-sm text-gray-600">{emAndamento ? t('textoEmAndamento') : t('texto')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('titulo')}>
              {MOTIVOS_RECUSA.map((m, i) => (
                <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => setMotivo(motivo === m ? '' : m)} data-testid={`motivo-${m}`} {...(i === 0 ? { 'data-foco-inicial': true } : {})}
                  className={`min-h-[48px] rounded-xl border-2 px-3 text-left text-sm font-semibold ${motivo === m ? 'border-primary-600 bg-primary-50 text-primary-900' : 'border-gray-300 bg-white text-gray-800'}`}>
                  <span aria-hidden="true" className="mr-1.5">{ICONE[m]}</span>{t(m)}
                </button>
              ))}
            </div>
            {motivo === 'data' && podePedirData && (
              <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm" data-testid="dica-pedir-data">
                <p className="text-primary-900">{t('dicaData')}</p>
                <button type="button" onClick={() => { setAberto(false); aoPedirData?.(); }} className="btn-primary mt-2 min-h-[48px] w-full" data-testid="recusar-pedir-data">📅 {t('pedirOutraData')}</button>
              </div>
            )}
            {erro && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" onClick={recusar} disabled={enviando} aria-busy={enviando} data-testid="confirmar-recusar"
                className="min-h-[48px] w-full rounded-lg bg-red-600 px-4 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {enviando ? t('recusando') : t('confirmar')}
              </button>
              <button type="button" onClick={fechar} disabled={enviando} className="btn-secondary min-h-[48px] w-full">{t('cancelar')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
