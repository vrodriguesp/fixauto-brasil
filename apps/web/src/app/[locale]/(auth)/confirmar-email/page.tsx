'use client';

import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase';

// Link do e-mail de confirmacao (/api/cadastro): ?token_hash=... de uso
// unico, 1 h. verifyOtp confirma o e-mail e ja devolve a sessao - a pessoa
// cai no painel dela. Link vencido/usado: pede o e-mail e manda outro.
const PAINEL: Record<string, string> = { cliente: '/cliente/dashboard', oficina: '/oficina/dashboard', loja_pecas: '/loja/dashboard' };

export default function ConfirmarEmailPage() {
  const t = useTranslations('confirmarEmail');
  const locale = useLocale();
  const router = useRouter();
  const [estado, setEstado] = useState<'verificando' | 'invalido' | 'ok'>('verificando');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const iniciado = useRef(false); // o token e de uso unico: verifica uma vez so

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    const tokenHash = new URLSearchParams(window.location.search).get('token_hash');
    window.history.replaceState(null, '', window.location.pathname);
    if (!tokenHash) {
      setEstado('invalido');
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' }).then(async ({ data, error }) => {
      if (error || !data.user) {
        setEstado('invalido');
        return;
      }
      setEstado('ok');
      const { data: perfil } = await supabase.from('profiles').select('tipo').eq('id', data.user.id).maybeSingle();
      router.replace(PAINEL[perfil?.tipo || ''] || '/');
      router.refresh();
    });
  }, [router]);

  const reenviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setEnviando(true);
    await fetch('/api/cadastro/reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, idioma: locale }),
    }).catch(() => {});
    setEnviando(false);
    setReenviado(true);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('titulo')}</h1>
        {estado !== 'invalido' ? (
          <p className="text-gray-600" role="status">{estado === 'ok' ? t('sucesso') : t('verificando')}</p>
        ) : (
          <div className="card text-left">
            <p className="font-semibold text-gray-900">{t('invalidoTitulo')}</p>
            <p className="text-sm text-gray-600 mt-1 mb-4">{t('invalidoTexto')}</p>
            {reenviado ? (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3" role="status">{t('reenviado')}</p>
            ) : (
              <form onSubmit={reenviar} className="space-y-3">
                <label className="block text-sm font-medium text-gray-700" htmlFor="email-confirmar">{t('labelEmail')}</label>
                <input id="email-confirmar" type="email" required autoComplete="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button type="submit" className="btn-primary w-full" disabled={enviando}>{t('reenviar')}</button>
              </form>
            )}
            <p className="text-center text-sm mt-4">
              <Link href="/login" className="text-primary-600 font-medium hover:underline">{t('irLogin')}</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
