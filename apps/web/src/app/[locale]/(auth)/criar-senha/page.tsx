'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter as useRouterNext } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter, rota } from '@/i18n/navigation';
import { LOCALE_PREFIX } from '@/i18n/routing';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { rolarAteAqui } from '@/hooks/use-mostrar-alerta';

// "Crie a sua senha" (dono 12/11): tela cheia logo depois de entrar sem senha
// (codigo do pedido, codigo de login ou link do e-mail) enquanto a conta nao tem
// senha (profiles.senha_definida = false, migracao 080). "Agora nao" pula e segue
// para a pagina pedida (?voltar=); a tela volta no proximo login, nunca a cada
// pagina. Salvar: o banco marca senha_definida=true sozinho (trigger no auth.users).
export default function CriarSenhaPage() {
  const t = useTranslations('criarSenha');
  const tErr = useTranslations('erros');
  const router = useRouter();
  const routerNext = useRouterNext();
  const { user, authUser, loading: carregandoLogin, refreshProfile } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salva, setSalva] = useState(false);
  const saiu = useRef(false);

  // para onde ir depois: ?voltar= (caminho interno '/cliente/...' ou ja com o idioma
  // '/ee/et/cliente/...', como a tela de login manda); so endereco do proprio site
  const destino = (): string => {
    const v = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('voltar') : null;
    return v && v.startsWith('/') && !v.startsWith('//') ? v : '/cliente/dashboard';
  };
  const irEmbora = () => {
    if (saiu.current) return;
    saiu.current = true;
    const v = destino();
    const comIdioma = Object.values(LOCALE_PREFIX).some((p) => v === p || v.startsWith(`${p}/`));
    if (comIdioma) routerNext.replace(v); else router.replace(v);
    router.refresh();
  };

  useEffect(() => {
    if (carregandoLogin) return;
    // sem login: entra primeiro e volta para ca (confere direto no Supabase: logo depois do
    // verifyOtp o contexto pode ainda nao ter recebido a sessao)
    if (!authUser) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) router.replace(rota('/login', undefined, { voltar: window.location.pathname + window.location.search }));
      });
      return;
    }
    // ja tem senha (recarregou a pagina depois de salvar, ou chegou aqui por engano): segue
    if (user && user.senha_definida !== false && !salvando && !salva) irEmbora();
  }, [carregandoLogin, authUser, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (senha.length < 8) { setErro(t('erroSenhaCurta')); return; }
    if (senha !== confirmar) { setErro(t('erroSenhasNaoCoincidem')); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      setErro(tErr((error as { code?: string }).code === 'weak_password' ? 'SENHA_CURTA' : 'GENERICO'));
      return;
    }
    setSalva(true);
    await refreshProfile();
    setSalvando(false);
    setTimeout(irEmbora, 1200);
  };

  if (carregandoLogin || !authUser || (user && user.senha_definida !== false && !salva)) {
    return <div className="min-h-[60vh] flex items-center justify-center"><div className="animate-pulse text-gray-400">…</div></div>;
  }

  if (salva) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4" data-testid="criar-senha-ok">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('salvaTitulo')}</h1>
          <p className="text-gray-600">{t('salvaTexto')}</p>
        </div>
      </div>
    );
  }

  return (
    // celular: comeca no alto (o menu de cima e o de baixo ja ocupam espaco; dono 09/11)
    <div className="flex justify-center bg-gray-50 px-4 py-6 sm:min-h-[calc(100dvh-4rem)] sm:items-center sm:py-12" data-testid="criar-senha">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <img src="/logo-80.webp" alt="BipFix" width={188} height={40} className="hidden sm:block h-10 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">{t('titulo')}</h1>
          <p className="text-gray-600 mt-2">{t('texto')}</p>
        </div>

        <form onSubmit={salvar} className="card space-y-4">
          {erro && (
            <div ref={rolarAteAqui} role="alert" className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{erro}</p>
            </div>
          )}
          <div>
            <label htmlFor="criar-senha-senha" className="block text-sm font-medium text-gray-700 mb-1">{t('labelSenha')}</label>
            <div className="relative">
              <input id="criar-senha-senha" type={verSenha ? 'text' : 'password'} className="input-field pr-20" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                placeholder={t('placeholderSenha')} minLength={8} maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} required />
              <button type="button" onClick={() => setVerSenha((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-primary-700 px-2 py-1">{verSenha ? t('ocultar') : t('mostrar')}</button>
            </div>
          </div>
          <div>
            <label htmlFor="criar-senha-confirmar" className="block text-sm font-medium text-gray-700 mb-1">{t('labelConfirmar')}</label>
            <input id="criar-senha-confirmar" type={verSenha ? 'text' : 'password'} className="input-field" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder={t('placeholderConfirmar')} minLength={8} maxLength={72} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
          </div>
          <button type="submit" disabled={salvando || !senha || !confirmar} className="btn-primary w-full disabled:opacity-50" data-testid="criar-senha-salvar">
            {salvando ? t('salvando') : t('salvar')}
          </button>
          <button type="button" onClick={irEmbora} disabled={salvando} className="w-full min-h-[44px] text-sm text-gray-600 underline" data-testid="criar-senha-agora-nao">
            {t('agoraNao')}
          </button>
          <p className="text-xs text-gray-500 text-center">{t('dica')}</p>
        </form>
      </div>
    </div>
  );
}
