'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Botao de excluir (com confirmacao). Sem login: pede para entrar e volta aqui.
export default function ExcluirContaClient() {
  const t = useTranslations('excluirConta');
  const { user, loading } = useAuth() as any;
  const [confirmar, setConfirmar] = useState(false);
  const [estado, setEstado] = useState<'livre' | 'enviando' | 'feito' | 'emServico' | 'erro'>('livre');

  const excluir = async () => {
    setEstado('enviando');
    const res = await fetch('/api/conta/excluir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: true }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setEstado('feito');
      return;
    }
    setConfirmar(false);
    setEstado(d.codigo === 'CARRO_EM_SERVICO' ? 'emServico' : 'erro');
  };

  if (estado === 'feito') return <p role="status" className="card bg-green-50 text-green-800">{t('feito')}</p>;
  if (loading) return null;
  if (!user) {
    return (
      <div className="card">
        <p className="text-gray-700 mb-4">{t('entrar')}</p>
        <Link href={`/login?voltar=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`} className="btn-primary inline-block">{t('entrarBotao')}</Link>
      </div>
    );
  }
  return (
    <div className="card">
      <p className="text-sm text-gray-500 mb-4 break-all">{user.email}</p>
      {estado === 'emServico' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 mb-4">{t('emServico')}</p>}
      {estado === 'erro' && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3 mb-4">{t('erro')}</p>}
      {confirmar ? (
        <div role="alertdialog" className="border border-red-300 bg-red-50 rounded-lg p-4">
          <p className="text-gray-900 mb-3">{t('confirmar')}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={excluir} disabled={estado === 'enviando'} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50">
              {estado === 'enviando' ? '…' : t('sim')}
            </button>
            <button type="button" onClick={() => setConfirmar(false)} className="btn-secondary">{t('cancelar')}</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmar(true)} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-medium">{t('botao')}</button>
      )}
    </div>
  );
}
