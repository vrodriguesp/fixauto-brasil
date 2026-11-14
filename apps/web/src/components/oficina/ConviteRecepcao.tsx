'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';

// Convite no login (check-in v2, decisao 6): banner em "Pedidos", so dono/admin da oficina, ate a oficina
// responder. [Preencher] leva ao perfil (#recepcao); [O horario de funcionamento serve] grava
// recepcao_confirmada_em e nao aparece mais; ✕ adia 7 dias (no aparelho). Some sozinho quando o perfil
// ja tem recepcao de carros. Banner, nao modal: a oficina entre dois carros vai direto ao pedido.
const CHAVE = 'bipfix_convite_recepcao_ate';
const SETE_DIAS = 7 * 24 * 3600e3;

export default function ConviteRecepcao() {
  const t = useTranslations('conviteRecepcao');
  const { oficina, funcionario, refreshProfile } = useAuth();
  const [adiado, setAdiado] = useState(true);
  const [some, setSome] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    try { setAdiado(Number(localStorage.getItem(CHAVE) || 0) > Date.now()); } catch { setAdiado(false); }
  }, []);
  const o = oficina as any;
  const podeVer = !!oficina && (!funcionario || funcionario.cargo === 'admin');
  if (!podeVer || adiado || some || o?.recepcao_inicio || o?.recepcao_confirmada_em) return null;

  const adiar = () => { try { localStorage.setItem(CHAVE, String(Date.now() + SETE_DIAS)); } catch { /* so nesta visita */ } setSome(true); };
  const serve = async () => {
    if (enviando) return;
    setEnviando(true); setErro(false);
    const r = await fetch('/api/oficina/recepcao-confirmada', { method: 'POST' }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) { setErro(true); return; }
    setSome(true);
    refreshProfile?.();
  };

  return (
    <section className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4" data-testid="convite-recepcao" aria-labelledby="convite-recepcao-titulo">
      <div className="flex items-start justify-between gap-2">
        <h2 id="convite-recepcao-titulo" className="text-base font-semibold text-blue-950">🚗 {t('titulo')}</h2>
        <button type="button" onClick={adiar} aria-label={t('fechar')} title={t('fechar')} data-testid="convite-recepcao-fechar"
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-800 hover:bg-blue-100">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <p className="mt-1 text-sm text-blue-900">{t('texto')}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Link href="/oficina/perfil#recepcao" className="btn-primary min-h-[44px] !py-2 text-center text-sm" data-testid="convite-recepcao-preencher">{t('preencher')}</Link>
        <button type="button" onClick={serve} disabled={enviando} className="btn-secondary min-h-[44px] !py-2 text-sm disabled:opacity-60" data-testid="convite-recepcao-serve">{t('serve')}</button>
      </div>
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{t('erro')}</p>}
    </section>
  );
}
