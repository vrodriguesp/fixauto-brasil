'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';

// "Nao tenho interesse" no pedido (migracao 070; feedback de oficina 04/11):
// a oficina diz o motivo e o pedido sai de "Para responder". O cliente nao e
// avisado; o admin ve quantas oficinas dispensaram e por que.
export const MOTIVOS_DISPENSA = ['nao_faz', 'faz_parte', 'sem_agenda', 'longe', 'outro'] as const;
export type Dispensa = { solicitacao_id: string; motivo: string; comentario: string | null; created_at: string };

// o menu "Pedidos" (Navbar) recarrega o contador quando a oficina dispensa ou desfaz
import { EVENTO_DISPENSA } from '@/lib/eventos';
export { EVENTO_DISPENSA };

export default function DispensarPedido({ solicitacaoId, oficinaId, dispensa, aoMudar, compacto, aoLado }: {
  solicitacaoId: string;
  oficinaId: string;
  dispensa?: Dispensa | null;
  aoMudar: () => void;
  compacto?: boolean;
  aoLado?: boolean; // na lista fica ao lado de "Fazer orcamento" (sm+)
}) {
  const t = useTranslations('oficinaPedidos');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  // ref estavel: com ref inline o React chamava focus() a cada letra digitada e o
  // comentario perdia o foco depois de 1 caractere (relato de oficina 04/11)
  const focarForm = useCallback((el: HTMLFieldSetElement | null) => { el?.focus(); }, []);

  const salvar = async () => {
    if (!motivo) return;
    setSalvando(true); setErro(false);
    const { error } = await supabase.from('pedido_dispensas').upsert(
      { solicitacao_id: solicitacaoId, oficina_id: oficinaId, motivo, comentario: comentario.trim().slice(0, 500) || null },
      { onConflict: 'solicitacao_id,oficina_id' },
    );
    setSalvando(false);
    if (error) { setErro(true); return; }
    setAberto(false); setMotivo(''); setComentario('');
    window.dispatchEvent(new Event(EVENTO_DISPENSA));
    aoMudar();
  };
  const desfazer = async () => {
    setSalvando(true); setErro(false);
    const { error } = await supabase.from('pedido_dispensas').delete().eq('solicitacao_id', solicitacaoId).eq('oficina_id', oficinaId);
    setSalvando(false);
    if (error) { setErro(true); return; }
    window.dispatchEvent(new Event(EVENTO_DISPENSA));
    aoMudar();
  };

  if (dispensa) {
    return (
      <div className={compacto ? 'mt-3' : 'card'} data-testid="dispensa-feita">
        {!compacto && <p className="text-sm text-gray-700">{t('voceDispensou', { motivo: t(`motivo_${dispensa.motivo}`) })}</p>}
        {!compacto && dispensa.comentario && <p className="mt-1 text-sm text-gray-500 break-words">“{dispensa.comentario}”</p>}
        <button type="button" onClick={desfazer} disabled={salvando} className="btn-secondary mt-2 inline-flex min-h-[44px] items-center" data-testid="desfazer-dispensa">
          {t('desfazerDispensa')} ›
        </button>
        {erro && <p role="alert" className="mt-2 text-sm text-red-700">{t('erroDispensa')}</p>}
      </div>
    );
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} data-testid="nao-tenho-interesse"
        className={`mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 text-sm font-medium text-gray-600 underline-offset-2 hover:bg-gray-50 hover:underline sm:w-auto ${aoLado ? 'sm:ml-2' : ''}`}>
        {t('naoTenhoInteresse')}
      </button>
    );
  }

  return (
    <fieldset ref={focarForm} tabIndex={-1} className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 outline-none" data-testid="dispensar-form">
      <legend className="sr-only">{t('dispensarTitulo')}</legend>
      <p className="font-medium text-gray-900" aria-hidden="true">{t('dispensarTitulo')}</p>
      <p className="mt-1 text-sm text-gray-600">{t('dispensarAjuda')}</p>
      <div className="mt-3 space-y-1">
        {MOTIVOS_DISPENSA.map((m) => (
          <label key={m} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-white">
            <input type="radio" name={`motivo-${solicitacaoId}`} value={m} checked={motivo === m} onChange={() => setMotivo(m)} className="h-5 w-5" data-testid={`motivo-${m}`} />
            <span className="text-sm text-gray-800">{t(`motivo_${m}`)}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 block text-sm text-gray-700">
        {t('comentarioOpcional')}
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={2}
          placeholder={t('comentarioDica')} className="input-field mt-1" data-testid="dispensa-comentario" />
      </label>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{t('erroDispensa')}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={salvar} disabled={!motivo || salvando} className="btn-primary min-h-[44px] disabled:opacity-50" data-testid="confirmar-dispensa">
          {t('confirmarDispensa')}
        </button>
        <button type="button" onClick={() => { setAberto(false); setErro(false); }} className="btn-secondary min-h-[44px]">
          {t('cancelarDispensa')}
        </button>
      </div>
    </fieldset>
  );
}
