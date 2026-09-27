import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Profile } from '@fixauto/shared';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import i18n from '../i18n';

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
const ERRO_TIPO_NAO_SUPORTADO = 'Este app é exclusivo para clientes. Acesse sua conta de oficina ou loja pelo site.';

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
      setUser(null);
      return { profile: null, error: error?.message || 'Perfil não encontrado' };
    }
    if (profile.ativo === false) {
      await supabase.auth.signOut();
      setUser(null);
      return { profile: null, error: 'Esta conta foi desativada. Entre em contato com o suporte.' };
    }
    if (profile.tipo !== 'cliente') {
      await supabase.auth.signOut();
      setUser(null);
      return { profile: null, error: ERRO_TIPO_NAO_SUPORTADO };
    }

    setUser(profile as Profile);
    if (profile.idioma && i18n.language !== profile.idioma) {
      i18n.changeLanguage(profile.idioma);
    }
    return { profile: profile as Profile, error: null };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        fetchProfile(session.user.id);
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

  const signUp = async (email: string, password: string, nome: string, telefone: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Erro ao criar usuário' };

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      tipo: 'cliente',
      nome,
      email,
      telefone,
      idioma: i18n.language,
      termos_aceitos_em: new Date().toISOString(),
      termos_versao: '2026-09-08',
    });
    if (profileError) {
      // Nao da pra apagar a conta de auth ja criada a partir do app (isso
      // exige a service role key, que o mobile nao tem) - mas pelo menos
      // desloga pra nao deixar a pessoa "autenticada" sem perfil nenhum
      // (estado que antes causava um loop de redirecionamento silencioso
      // no login seguinte). Ela pode tentar o cadastro de novo depois.
      await supabase.auth.signOut();
      return { error: profileError.message };
    }

    const { error: fetchError } = await fetchProfile(data.user.id);
    return { error: fetchError };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: null };

    const { error: profileError } = await fetchProfile(data.user.id);
    return { error: profileError };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
