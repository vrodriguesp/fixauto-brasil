'use client';

import { useState, useEffect } from 'react';
import { Link, useRouter, rota } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { textoErroApi } from '@/lib/erro-api';
import { rolarAteAqui } from '@/hooks/use-mostrar-alerta';
import { useTopoAoMudar } from '@/hooks/use-topo-ao-mudar';

// Entrar com e-mail + senha ou "receber um codigo por e-mail" (dono 12/11): o
// codigo entra em contas com ou sem senha (quem pediu orcamento sem senha). Quem
// ainda nao tem senha passa pela tela "crie a sua senha" (pode pular) antes de seguir.
export default function LoginPage() {
  const t = useTranslations('login');
  const te = useTranslations('erros');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  useTopoAoMudar(resetSent); // tela trocada inteira: abre no alto (dono 08/11)
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [confirmacaoReenviada, setConfirmacaoReenviada] = useState(false);
  // login por codigo: e-mail -> codigo de 6 digitos
  const [codigoMode, setCodigoMode] = useState(false);
  const [codigoId, setCodigoId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [esperaReenvio, setEsperaReenvio] = useState(0);
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
    // ?codigo=1: ja abre em "receber um codigo" (link do e-mail vencido, pedido enviado)
    if (params.get('codigo') === '1') setCodigoMode(true);
  }, [t]);
  useEffect(() => {
    if (esperaReenvio <= 0) return;
    const i = setTimeout(() => setEsperaReenvio((s) => s - 1), 1000);
    return () => clearTimeout(i);
  }, [esperaReenvio]);

  // ?voltar=/admin/leads-parceiros : volta para a pagina que pediu o login
  // (so endereco do proprio site; aceita ?filtro=... depois do caminho)
  const paginaDeVolta = (): string | null => {
    const voltar = new URLSearchParams(window.location.search).get('voltar');
    if (voltar && voltar.startsWith('/') && !voltar.startsWith('//')) {
      try {
        const destino = new URL(voltar, window.location.origin);
        if (destino.origin === window.location.origin) return destino.pathname + destino.search;
      } catch { /* endereco invalido: segue para o inicio */ }
    }
    return null;
  };
  const seguir = () => {
    const voltar = paginaDeVolta();
    if (voltar) { window.location.assign(voltar); return; }
    router.refresh();
    router.push('/');
  };

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
    seguir();
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

  // "receber um codigo por e-mail": a resposta e a mesma exista ou nao a conta
  const enviarCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email.trim()) { setError(t('erroPreenchaEmail')); return; }
    if (loading || esperaReenvio > 0) return;
    setError(''); setLoading(true);
    const res = await fetch('/api/conta/codigo-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), idioma: locale }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res || !res.ok) { setError(textoErroApi(te, res?.status || 500, d)); return; }
    setCodigoId(d.id); setCodigo(''); setEsperaReenvio(30);
  };

  const entrarComCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoId || codigo.length !== 6 || loading) return;
    setError(''); setLoading(true);
    const res = await fetch('/api/conta/codigo-login/confirmar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: codigoId, codigo }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setLoading(false);
      // 5 erros ou codigo vencido: volta ao e-mail para pedir outro
      if (d.codigo === 'CODIGO_TENTATIVAS' || d.codigo === 'CODIGO_EXPIRADO') { setCodigoId(null); setCodigo(''); setError(t('codigoVencido')); return; }
      setError(textoErroApi(te, res?.status || 500, d));
      return;
    }
    const { error: eSessao } = await supabase.auth.verifyOtp({ token_hash: d.tokenHash, type: 'email' });
    setLoading(false);
    if (eSessao) { setError(t('erroCredenciais')); return; }
    // ainda sem senha: tela "crie a sua senha" (pode pular) e depois a pagina pedida
    if (d.senhaDefinida === false) {
      const voltar = paginaDeVolta();
      router.replace(rota('/criar-senha', undefined, voltar ? { voltar } : undefined));
      router.refresh();
      return;
    }
    seguir();
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
            {forgotMode ? t('recuperarSenhaTitulo') : codigoMode ? t('codigoTitulo') : t('entrarTitulo')}
          </h1>
          <p className="text-gray-600 mt-2">
            {forgotMode ? t('recuperarSenhaSubtitulo') : codigoMode ? t('codigoSubtitulo') : t('entrarSubtitulo')}
          </p>
        </div>

        <div className="card">
          {error && (
            <div ref={rolarAteAqui} role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800">{error}</p>
              {naoConfirmado && !forgotMode && !codigoMode && (
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
          ) : codigoMode && !codigoId ? (
            <form onSubmit={enviarCodigo} className="space-y-4" data-testid="login-codigo-email">
              <div>
                <label htmlFor="login-codigo-email" className="block text-sm font-medium text-gray-700 mb-1">{t('labelEmail')}</label>
                <input id="login-codigo-email" type="email" className="input-field" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? t('enviando') : t('enviarCodigo')}</button>
              <button type="button" onClick={() => { setCodigoMode(false); setError(''); }} className="w-full min-h-[44px] text-sm text-gray-500 hover:text-gray-700">{t('entrarComSenha')}</button>
            </form>
          ) : codigoMode && codigoId ? (
            <form onSubmit={entrarComCodigo} className="space-y-4" data-testid="login-codigo-digitar">
              <p className="text-sm text-gray-700" role="status">{t('codigoEnviadoTexto', { email: email.trim() })}</p>
              <div>
                <label htmlFor="login-codigo" className="block text-sm font-medium text-gray-700 mb-1">{t('labelCodigo')}</label>
                <input id="login-codigo" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} autoFocus
                  className="input-field text-center text-2xl tracking-[0.5em] font-semibold" value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
              </div>
              <button type="submit" className="btn-primary w-full disabled:opacity-50" disabled={loading || codigo.length !== 6}>{loading ? t('entrando') : t('entrarComCodigo')}</button>
              <p className="text-xs text-gray-500">{t('codigoSpam')}</p>
              <button type="button" onClick={() => enviarCodigo()} disabled={esperaReenvio > 0 || loading} className="w-full min-h-[44px] text-sm text-primary-700 underline disabled:text-gray-400 disabled:no-underline">
                {esperaReenvio > 0 ? t('reenviarEm', { s: esperaReenvio }) : t('reenviarCodigo')}
              </button>
              <button type="button" onClick={() => { setCodigoId(null); setCodigo(''); setError(''); }} className="w-full min-h-[44px] text-sm text-gray-500 hover:text-gray-700">{t('outroEmail')}</button>
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

              {/* sem senha (pedido feito so com o e-mail) ou sem lembrar dela: codigo por e-mail */}
              <div className="flex items-center gap-3 my-5 text-xs text-gray-400"><span className="flex-1 border-t border-gray-200" />{t('ou')}<span className="flex-1 border-t border-gray-200" /></div>
              <button type="button" onClick={() => { setCodigoMode(true); setError(''); }} className="btn-secondary w-full" data-testid="login-receber-codigo">
                {t('receberCodigo')}
              </button>

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
