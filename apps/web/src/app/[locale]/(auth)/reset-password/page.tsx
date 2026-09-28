'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const t = useTranslations('resetPassword');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [linkInvalido, setLinkInvalido] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Link do e-mail de /api/esqueci-senha: ?token_hash=...&type=recovery.
    // verifyOtp troca o token (uso unico, validade 1 h) por uma sessao - so
    // entao a pessoa pode definir a senha nova. O token sai da barra de
    // endereco logo em seguida, pra nao ficar no historico do navegador.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    if (tokenHash && params.get('type') === 'recovery') {
      window.history.replaceState(null, '', window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) setLinkInvalido(true);
        else setSessionReady(true);
      });
      return;
    }

    // Fluxo antigo do Supabase (link com #access_token / ?code)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });
    // Also check if we already have a session (e.g. page reload)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t('erroSenhaCurta'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('erroSenhasNaoCoincidem'));
      return;
    }
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/login'), 3000);
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('senhaAlteradaTitulo')}</h1>
          <p className="text-gray-600">{t('redirecionando')}</p>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          {!linkInvalido && <div className="animate-pulse text-gray-400 mb-4">{t('verificandoLink')}</div>}
          <p className="text-sm text-gray-500">
            {t('linkExpirado')}{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700">
              {t('solicitarNovo')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('titulo')}</h1>
          <p className="text-gray-600 mt-2">{t('subtitulo')}</p>
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelNovaSenha')}</label>
              <input
                type="password"
                className="input-field"
                placeholder={t('placeholderSenhaMinima')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('labelConfirmarSenha')}</label>
              <input
                type="password"
                className="input-field"
                placeholder={t('placeholderRepitaSenha')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? t('salvando') : t('salvarNovaSenha')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
