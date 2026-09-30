'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const t = useTranslations('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [confirmacaoReenviada, setConfirmacaoReenviada] = useState(false);
  const locale = useLocale();
  const { signIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('desativado') === '1') {
      setError(t('erroDesativado'));
    } else if (params.get('sessao_expirada') === '1') {
      setError(t('erroSessaoExpirada'));
    }
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('erroPreenchaCampos'));
      return;
    }
    setError('');
    setLoading(true);

    setNaoConfirmado(false);
    const { error: authError } = await signIn(email, password);
    setLoading(false);

    if (authError) {
      // conta criada mas e-mail ainda nao confirmado: oferece novo link
      if (authError === 'email_not_confirmed') {
        setNaoConfirmado(true);
        setError(t('erroNaoConfirmado'));
      } else if (authError === 'conta_desativada') {
        setError(t('erroDesativado'));
      } else if (authError === 'over_request_rate_limit' || authError === 'over_email_send_rate_limit') {
        setError(t('erroMuitasTentativas'));
      } else {
        setError(t('erroCredenciais'));
      }
      return;
    }

    router.refresh();
    router.push('/');
  };

  const reenviarConfirmacao = async () => {
    setLoading(true);
    await fetch('/api/cadastro/reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idioma: locale }),
    }).catch(() => {});
    setLoading(false);
    setConfirmacaoReenviada(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError(t('erroPreenchaEmail'));
      return;
    }
    setError('');
    setLoading(true);

    const res = await fetch('/api/esqueci-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);

    if (!res.ok) {
      setError(t('erroEnviar'));
      return;
    }

    setResetSent(true);
  };

  if (resetSent) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('senhaEnviadaTitulo')}</h1>
          <p className="text-gray-600 mb-6">
            {t('senhaEnviadaTexto1')} <strong>{email}</strong>.
            {' '}{t('senhaEnviadaTexto2')}
          </p>
          <button
            onClick={() => { setForgotMode(false); setResetSent(false); }}
            className="btn-primary"
          >
            {t('voltarLogin')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            {forgotMode ? t('recuperarSenhaTitulo') : t('entrarTitulo')}
          </h1>
          <p className="text-gray-600 mt-2">
            {forgotMode ? t('recuperarSenhaSubtitulo') : t('entrarSubtitulo')}
          </p>
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
              {naoConfirmado && !forgotMode && (
                confirmacaoReenviada ? (
                  <p className="text-sm text-green-700 mt-2" role="status">{t('confirmacaoReenviada')}</p>
                ) : (
                  <button type="button" onClick={reenviarConfirmacao} disabled={loading} className="mt-2 text-sm font-medium text-primary-700 underline">
                    {t('reenviarConfirmacao')}
                  </button>
                )
              )}
            </div>
          )}

          {forgotMode ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="c0862-1" className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
                <input id="c0862-1"
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? t('enviando') : t('enviarLinkRecuperacao')}
              </button>

              <button
                type="button"
                onClick={() => { setForgotMode(false); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                {t('voltarLogin')}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="c0862-2" className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
                  <input id="c0862-2"
                    type="email"
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="login-senha" className="block text-sm font-medium text-gray-700">{t('labelSenha')}</label>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setError(''); }}
                      className="text-sm py-2 -my-2 text-primary-600 hover:text-primary-700"
                    >
                      {t('esqueciSenha')}
                    </button>
                  </div>
                  <input
                    id="login-senha"
                    type="password"
                    className="input-field"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? t('entrando') : t('entrarTitulo')}
                </button>
              </form>

              <p className="text-center text-sm text-gray-600 mt-6">
                {t('naoTemConta')}{' '}
                <Link href="/cadastro" className="text-primary-600 font-medium hover:text-primary-700">
                  {t('cadastreSe')}
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
