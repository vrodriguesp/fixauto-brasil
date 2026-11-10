'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { apagarFotosPedido } from '@/lib/rascunho-pedido-fotos';

// Pagina do link do e-mail de lembrete (dono 06/11; api/pedido-sem-conta/retomar):
// mostra o pedido guardado e deixa confirmar (vai para as oficinas e a pessoa ja
// entra logada) ou cancelar (apaga na hora). Nada acontece so por abrir o link.
type Resumo = { tipo: string; descricao: string; endereco: string; carro: string; fotos: number; expiraEm: string };
const FUSO: Record<string, string> = { it: 'Europe/Rome', 'pt-PT': 'Europe/Lisbon', pt: 'America/Sao_Paulo' };

export default function RetomarPedido({ id, token, cancelar }: { id: string; token: string; cancelar: boolean }) {
  const t = useTranslations('pedidoSemConta');
  const tc = useTranslations('constants');
  const te = useTranslations('erros');
  const locale = useLocale();
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'pedido' | 'perguntaCancelar' | 'cancelado' | 'invalido'>('carregando');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const chamar = (acao: string) => fetch('/api/pedido-sem-conta/retomar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, t: token, acao }),
  }).then(async (r) => ({ r, d: await r.json().catch(() => ({})) }), () => ({ r: null as Response | null, d: {} as any }));

  useEffect(() => {
    // o link fica fora da barra de endereco (nao vai para historico/compartilhamento)
    window.history.replaceState(null, '', window.location.pathname);
    chamar('ver').then(({ r, d }) => {
      if (!r?.ok) { setEstado('invalido'); return; }
      setResumo(d);
      setEstado(cancelar ? 'perguntaCancelar' : 'pedido');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const { r, d } = await chamar('confirmar');
    if (!r?.ok) {
      setEnviando(false);
      if (r?.status === 410) { setEstado('invalido'); return; }
      setErro(textoErroApi(te, r?.status || 500, d));
      return;
    }
    try { localStorage.removeItem('bipfix_pedido_rascunho'); sessionStorage.removeItem('bipfix_pedido_rascunho'); } catch { /* ignora */ }
    apagarFotosPedido();
    // o link prova o e-mail: entra na conta e abre o pedido
    if (d.tokenHash) await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: 'email' }).catch(() => null);
    router.replace(`/cliente/orcamentos/${d.solicitacaoId}`);
    router.refresh();
  };

  const confirmarCancelamento = async () => {
    if (enviando) return;
    setEnviando(true); setErro('');
    const { r, d } = await chamar('cancelar');
    setEnviando(false);
    if (!r?.ok) {
      if (r?.status === 410) { setEstado('invalido'); return; }
      setErro(textoErroApi(te, r?.status || 500, d));
      return;
    }
    try { localStorage.removeItem('bipfix_pedido_rascunho'); sessionStorage.removeItem('bipfix_pedido_rascunho'); } catch { /* ignora */ }
    apagarFotosPedido();
    setEstado('cancelado');
  };

  const ate = resumo ? new Date(resumo.expiraEm).toLocaleString(locale === 'pt' ? 'pt-BR' : locale, {
    timeZone: FUSO[locale] || 'Europe/Tallinn', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }) : '';

  return (
    <div className="max-w-xl mx-auto px-4 py-10" data-testid="retomar-pedido">
      {estado === 'carregando' && <p className="text-center text-gray-500 py-16" role="status">…</p>}

      {(estado === 'pedido' || estado === 'perguntaCancelar') && resumo && (
        <div className="card">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{t('retomarTitulo')}</h1>
          <p className="text-gray-600 mb-5">{t('retomarTexto')}</p>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-1 mb-3" data-testid="retomar-resumo">
            <p className="font-semibold text-gray-900">{tc(`tiposServico.${resumo.tipo}`)}</p>
            {resumo.carro && <p className="text-gray-700">{resumo.carro}</p>}
            {resumo.descricao && <p className="text-gray-700 break-words">{resumo.descricao}</p>}
            {resumo.endereco && <p className="text-sm text-gray-500 break-words">{resumo.endereco}</p>}
            {resumo.fotos > 0 && <p className="text-sm text-gray-500">{t('retomarFotos', { n: resumo.fotos })}</p>}
          </div>
          <p className="text-sm text-gray-500 mb-6">{t('retomarAte', { h: ate })}</p>
          {erro && <p role="alert" className="mb-4 text-sm text-red-700">{erro}</p>}

          {estado === 'pedido' ? (
            <div className="flex flex-col gap-3">
              <button type="button" onClick={confirmar} disabled={enviando} aria-busy={enviando} className="btn-success w-full disabled:opacity-50" data-testid="retomar-confirmar">
                {enviando ? t('enviando') : t('retomarConfirmar')}
              </button>
              <button type="button" onClick={() => { setErro(''); setEstado('perguntaCancelar'); }} className="w-full min-h-[44px] text-sm text-gray-600 underline" data-testid="retomar-cancelar">
                {t('retomarCancelar')}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-red-200 p-4" data-testid="retomar-pergunta-cancelar">
              <p className="text-gray-900 mb-4">{t('retomarCancelarPergunta')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={confirmarCancelamento} disabled={enviando} className="btn-danger flex-1 disabled:opacity-50" data-testid="retomar-cancelar-sim">{t('retomarCancelarSim')}</button>
                <button type="button" onClick={() => setEstado('pedido')} className="btn-secondary flex-1">{t('retomarVoltar')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {estado === 'cancelado' && (
        <div className="text-center py-10" data-testid="retomar-cancelado">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('retomarCancelado')}</h1>
          <p className="text-gray-600 mb-6">{t('retomarCanceladoTexto')}</p>
          <Link href="/pedido" className="btn-primary inline-block">{t('retomarNovo')}</Link>
        </div>
      )}

      {estado === 'invalido' && (
        <div className="text-center py-10" data-testid="retomar-invalido">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('retomarInvalido')}</h1>
          <p className="text-gray-600 mb-6">{t('retomarInvalidoTexto')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/pedido" className="btn-primary inline-block">{t('retomarNovo')}</Link>
            <Link href="/login" className="btn-secondary inline-block">{t('entrar')}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
