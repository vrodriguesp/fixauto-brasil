import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '@fixauto/shared';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import i18n from '../i18n';
import { API_BASE_URL } from './api';
import { idiomaEscolhido } from './idiomas';

interface AuthContextType {
  user: Profile | null;
  authUser: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  signUp: (email: string, password: string, nome: string, telefone: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authUser: null,
  isLoggedIn: false,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

// App mobile e so pra clientes (motoristas) - diferente do web, que atende
// cliente/oficina/loja/admin no mesmo auth-context. Sem essa restricao,
// alguem com conta de oficina/loja poderia logar no app e nao ter nenhuma
// tela feita pra esse tipo de conta.
// codigos estaveis: a tela de login traduz (auth.tipoNaoSuportado, auth.contaDesativada)
const ERRO_TIPO_NAO_SUPORTADO = 'tipo_nao_suportado';
// ultimo perfil valido: abre o app sem rede (no local do acidente) sem cair no login
const CHAVE_PERFIL = 'bipfix_perfil_cache';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Unico lugar que decide se uma sessao autenticada vira um `user` valido
  // no app - tanto a checagem de tipo/ativo quanto o `setUser` acontecem
  // aqui dentro, nunca em dois lugares separados. Antes, o listener de
  // onAuthStateChange definia `user` (e liberava a navegacao) assim que
  // QUALQUER sessao existisse, e so DEPOIS o signIn() checava tipo/ativo e
  // deslogava se invalido - abrindo uma janela real onde uma conta de
  // oficina/loja/admin (ou desativada) entrava no app por um instante antes
  // de ser expulsa. Centralizando aqui, nenhum caminho consegue definir
  // `user` sem passar por essas duas checagens primeiro.
  const fetchProfile = useCallback(async (userId: string): Promise<{ profile: Profile | null; error: string | null }> => {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

    // Erro de leitura (RLS, rede, linha ainda nao visivel logo apos o
    // cadastro) tem que ser tratado como login INVALIDO (fail-closed) - a
    // versao anterior ignorava esse erro, o que fazia os dois `if (profile
    // && ...)` seguintes serem pulados e o login ser aceito como valido
    // mesmo sem nunca ter confirmado tipo/ativo.
    if (error || !profile) {
      // sem rede: usa o ultimo perfil valido desta mesma conta (ja conferido antes)
      const guardado = await AsyncStorage.getItem(CHAVE_PERFIL).catch(() => null);
      const cache = guardado ? JSON.parse(guardado) as Profile : null;
      if (cache && cache.id === userId && !/JSON|0 rows|PGRST116/i.test(error?.message || '')) {
        setUser(cache);
        return { profile: cache, error: null };
      }
      setUser(null);
      return { profile: null, error: 'perfil_nao_encontrado' };
    }
    if (profile.ativo === false) {
      await supabase.auth.signOut({ scope: 'local' });
      AsyncStorage.removeItem(CHAVE_PERFIL).catch(() => {});
      setUser(null);
      return { profile: null, error: 'conta_desativada' };
    }
    if (profile.tipo !== 'cliente') {
      await supabase.auth.signOut({ scope: 'local' });
      setUser(null);
      return { profile: null, error: ERRO_TIPO_NAO_SUPORTADO };
    }

    setUser(profile as Profile);
    AsyncStorage.setItem(CHAVE_PERFIL, JSON.stringify(profile)).catch(() => {});
    // Idioma: a escolha feita no app (tela de entrada ou Perfil) vale sobre a
    // da conta, e a conta passa a seguir essa escolha (e-mails no mesmo
    // idioma). Sem escolha salva, o app segue o idioma da conta.
    const escolhido = await idiomaEscolhido();
    if (escolhido && escolhido !== profile.idioma) {
      supabase.from('profiles').update({ idioma: escolhido }).eq('id', userId).then(() => {});
      if (i18n.language !== escolhido) i18n.changeLanguage(escolhido);
    } else if (!escolhido && profile.idioma && i18n.language !== profile.idioma) {
      i18n.changeLanguage(profile.idioma);
    }
    return { profile: profile as Profile, error: null };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // so termina de carregar depois do perfil: antes a tela de login piscava
    // a cada abertura (user ainda nulo) - auditoria E2
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        await fetchProfile(session.user.id).catch(() => {});
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).catch(() => {});
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Conta criada no servidor (mesma rota do site): o GoTrue nao aceita mais
  // cadastro direto, e o login so funciona depois que a pessoa abre o link
  // de confirmacao enviado para o e-mail.
  const signUp = async (email: string, password: string, nome: string, telefone: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/cadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password, nome, telefone, tipo: 'cliente', idioma: i18n.language, aceitouTermos: true, origem: 'app' }),
      });
      if (res.ok) return { error: null };
      const corpo = await res.json().catch(() => ({}));
      if (corpo.codigo === 'SENHA_CURTA') return { error: i18n.t('auth.senhaCurta') };
      if (res.status === 429) return { error: i18n.t('auth.muitasTentativas') };
      if (res.status === 400) return { error: i18n.t('auth.dadosInvalidos') };
      return { error: i18n.t('common.erroGenerico') };
    } catch {
      return { error: i18n.t('common.erroGenerico') };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // codigo estavel, traduzido na tela (email_not_confirmed, invalid_credentials...)
    if (error) return { error: error.code || 'invalid_credentials' };
    if (!data.user) return { error: null };

    const { error: profileError } = await fetchProfile(data.user.id);
    return { error: profileError };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    AsyncStorage.removeItem(CHAVE_PERFIL).catch(() => {});
    setUser(null);
    setAuthUser(null);
  };

  const refreshProfile = async () => {
    if (authUser) await fetchProfile(authUser.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, authUser, isLoggedIn: !!user, loading, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
