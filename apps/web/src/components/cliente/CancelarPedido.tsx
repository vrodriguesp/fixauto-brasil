'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { textoErroApi } from '@/lib/erro-api';

const MOTIVOS = ['resolvido', 'outra_oficina', 'desisti', 'outro'] as const;

// O cliente cancela o proprio pedido (dono 09/11, item 52): confirmacao na propria tela (nao o
// confirm do navegador) com motivo opcional. As oficinas com orcamento sao avisadas pelo servidor.
export function CancelarPedido({ solicitacaoId, aoCancelar }: { solicitacaoId: string; aoCancelar: () => void }) {
  const t = useTranslations('clienteOrcamentoDetalhe.cancelamento');
  const tErr = useTranslations('erros');
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const cancelar = async () => {
    setEnviando(true); setErro('');
    const r = await fetch(`/api/solicitacoes/${solicitacaoId}/cancelar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!r?.ok) { setErro(textoErroApi(tErr, r?.status || 500, d)); return; }
    setAberto(false);
    aoCancelar();
  };

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} data-testid="cancelar-pedido"
        className="min-h-[44px] text-sm text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-colors">
        {t('botao')}
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-labelledby="cancelar-pedido-titulo" className="w-full rounded-lg border border-red-300 bg-white p-4 shadow-sm" data-testid="confirmar-cancelamento">
      <p id="cancelar-pedido-titulo" className="font-semibold text-gray-900">{t('titulo')}</p>
      <p className="mt-1 text-sm text-gray-700">{t('texto')}</p>
      <p className="mt-3 text-sm font-medium text-gray-700">{t('motivoOpcional')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button key={m} type="button" onClick={() => setMotivo(motivo === m ? null : m)} aria-pressed={motivo === m} data-testid={`motivo-${m}`}
            className={`min-h-[40px] rounded-full border px-3 py-1.5 text-sm ${motivo === m ? 'border-red-500 bg-red-50 text-red-800 font-medium' : 'border-gray-300 text-gray-700'}`}>
            {t(`motivos.${m}`)}
          </button>
        ))}
      </div>
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={cancelar} disabled={enviando} data-testid="confirmar-cancelar-pedido"
          className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">
          {enviando ? t('cancelando') : t('confirmar')}
        </button>
        <button type="button" onClick={() => { setAberto(false); setErro(''); }} className="btn-secondary min-h-[44px]">{t('voltar')}</button>
      </div>
    </div>
  );
}

// Pedido cancelado pelo cliente: "Reabrir pedido" (os orcamentos ainda validos voltam).
export function ReabrirPedidoCancelado({ solicitacaoId, aoReabrir }: { solicitacaoId: string; aoReabrir: () => void }) {
  const t = useTranslations('clienteOrcamentoDetalhe.cancelamento');
  const tErr = useTranslations('erros');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const reabrir = async () => {
    setEnviando(true); setErro('');
    const r = await fetch(`/api/solicitacoes/${solicitacaoId}/reabrir`, { method: 'POST' }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setEnviando(false);
    if (!r?.ok) { setErro(textoErroApi(tErr, r?.status || 500, d)); return; }
    aoReabrir();
  };
  return (
    <>
      <button type="button" onClick={reabrir} disabled={enviando} data-testid="reabrir-pedido-cancelado"
        className="btn-primary mt-3 inline-flex min-h-[44px] items-center disabled:opacity-50">
        {enviando ? t('reabrindo') : t('reabrir')}
      </button>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
    </>
  );
}
