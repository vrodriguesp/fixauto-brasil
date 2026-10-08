'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function PerfilClientePage() {
  const t = useTranslations('clientePerfil');
  const tErr = useTranslations('erros');
  const tx = useTranslations('excluirConta');
  const { user, loading, refreshProfile } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Sync state when user data loads
  useEffect(() => {
    if (user) {
      setNome(user.nome || '');
      setEmail(user.email || '');
      setTelefone(user.telefone || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    setSuccess(false);

    const { error: profError } = await supabase
      .from('profiles')
      .update({ nome, telefone })
      .eq('id', user.id);

    if (profError) {
      console.error(profError); setError(tErr((profError as { code?: string }).code === 'weak_password' ? 'SENHA_CURTA' : 'GENERICO'));
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (loading || !user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse text-gray-400">{t('loadingProfile')}</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{t('title')}</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-6">
          <p className="text-sm text-green-800">{t('savedSuccess')}</p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-700 font-bold text-2xl">
              {nome?.charAt(0) || 'U'}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{nome}</h2>
            <p className="text-gray-500">{t('roleLabel')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="c31d9-1" className="block text-sm font-medium text-gray-700 mb-1">{t('nameLabel')}</label>
            <input id="c31d9-1" type="text" className="input-field" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label htmlFor="c31d9-2" className="block text-sm font-medium text-gray-700 mb-1">{t('emailLabel')}</label>
            <input id="c31d9-2" type="email" className="input-field bg-gray-50" value={email} disabled />
          </div>
          <div>
            <label htmlFor="c31d9-3" className="block text-sm font-medium text-gray-700 mb-1">{t('phoneLabel')}</label>
            <input id="c31d9-3" type="tel" className="input-field" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? t('saving') : t('saveChanges')}
          </button>
        </div>
        <div className="mt-10 pt-6 border-t border-gray-200 text-right">
          <Link href="/excluir-conta" className="text-sm text-red-700 hover:underline">{tx('link')}</Link>
        </div>
      </div>
    </div>
  );
}
