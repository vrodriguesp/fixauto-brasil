'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { INTL_LOCALE } from '@/lib/utils';

// Pausa dos avisos de pedido novo (migracao 101, dono 19/11 - P6): em vez de apagar a conta, a oficina para de
// receber sino/e-mail/push de pedidos novos por 7 ou 30 dias (profiles.avisos_pausados_ate; quem recebe e
// decidido em lib/avisar-oficinas-pedido.ts). Conta, pedidos e conversas ficam como estao. So para oficinas.
export default function PausarAvisos({ compacto = false }: { compacto?: boolean }) {
  const t = useTranslations('excluirConta');
  const locale = useLocale();
  const { user, refreshProfile } = useAuth() as any;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const ate: string | null = user?.avisos_pausados_ate || null;
  const pausado = !!ate && Date.parse(ate) > Date.now();
  if (user?.tipo !== 'oficina') return null;

  const gravar = async (dias: number | null) => {
    if (!user?.id) return;
    setSalvando(true); setErro(false);
    const valor = dias ? new Date(Date.now() + dias * 86400000).toISOString() : null;
    const { error } = await supabase.from('profiles').update({ avisos_pausados_ate: valor }).eq('id', user.id);
    setSalvando(false);
    if (error) { setErro(true); return; }
    await refreshProfile?.();
  };

  return (
    <div className={compacto ? '' : 'card'} data-testid="pausar-avisos">
      <h2 className="font-semibold text-gray-900">{t('pausarTitulo')}</h2>
      <p className="mt-1 text-sm text-gray-600">{t('pausarTexto')}</p>
      {pausado ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status" data-testid="avisos-pausados">
          <p>{t('pausadoAte', { data: new Intl.DateTimeFormat(INTL_LOCALE[locale] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ate as string)) })}</p>
          <button type="button" onClick={() => gravar(null)} disabled={salvando} className="btn-secondary mt-2 min-h-[44px] disabled:opacity-50" data-testid="retomar-avisos">{t('retomar')}</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => gravar(7)} disabled={salvando} className="btn-secondary min-h-[44px] disabled:opacity-50" data-testid="pausar-7">{t('pausar7')}</button>
          <button type="button" onClick={() => gravar(30)} disabled={salvando} className="btn-secondary min-h-[44px] disabled:opacity-50" data-testid="pausar-30">{t('pausar30')}</button>
        </div>
      )}
      {erro && <p role="alert" className="mt-2 text-sm text-red-700">{t('pausaErro')}</p>}
    </div>
  );
}
