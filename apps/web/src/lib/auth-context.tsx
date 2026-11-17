'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Profile, Oficina, Funcionario, LojaPecas } from '@fixauto/shared';
import { supabase, isSupabaseConfigured } from './supabase';
import type { User } from '@supabase/supabase-js';
import { instalarSessaoNasApis } from './sessao-api';
import { desligarAvisos } from './push-navegador-cliente';

interface AuthContextType {
  user: Profile | null;
  oficina: Oficina | null;
  funcionario: Funcionario | null;
  loja: LojaPecas | null;
  authUser: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  // error = codigo estavel (traduzido na tela): email_not_confirmed,
  // invalid_credentials, conta_desativada ou outro codigo do GoTrue
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateOficina: (data: Partial<Oficina>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  oficina: null,
  funcionario: null,
  loja: null,
  authUser: null,
  isLoggedIn: false,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
  updateOficina: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [loja, setLoja] = useState<LojaPecas | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile) return;

    // Busca tudo antes de mudar o estado: perfil, oficina e loja chegam juntos. Antes o perfil
    // vinha sozinho e a oficina uma ida ao banco depois - a pagina pintava "logado sem oficina" e
    // depois empurrava o conteudo (CLS ~0,4 em todo o painel da oficina, Clarity 15/11).
    let ofi: Oficina | null = null;
    let func: Funcionario | null = null;
    let lj: LojaPecas | null = null;
    if (profile.tipo === 'oficina') {
      // Check if this profile owns an oficina
      const { data } = await supabase
        .from('oficinas')
        .select('*')
        .eq('profile_id', userId)
        .single();
      ofi = data as Oficina | null;

      // Also check if they're a funcionario (admin of their own oficina doesn't need this)
      if (!ofi) {
        const { data: f } = await supabase
          .from('funcionarios')
          .select('*, oficina:oficinas(*)')
          .eq('profile_id', userId)
          .eq('ativo', true)
          .single();
        if (f) {
          func = f as Funcionario;
          ofi = f.oficina as Oficina;
        }
      }
    }
    if (profile.tipo === 'loja_pecas') {
      const { data } = await supabase
        .from('lojas_pecas')
        .select('*')
        .eq('profile_id', userId)
        .single();
      lj = data as LojaPecas | null;
    }
    setUser(profile as Profile);
    setOficina(ofi);
    setFuncionario(func);
    setLoja(lj);
  }, []);

  // renova o login antes de cada chamada as rotas /api (evita "sessao expirada" no celular)
  useEffect(() => { instalarSessaoNasApis(); }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Check current session
    // loading so termina com o perfil (e a oficina) carregados: as paginas esperam um passo so,
    // sem desenhar a tela pela metade. Limite de 8 s para nunca ficar presa em "carregando".
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        await Promise.race([
          fetchProfile(session.user.id).catch(() => {}),
          new Promise((r) => setTimeout(r, 8000)),
        ]);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setOficina(null);
        setFuncionario(null);
        setLoja(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.code || 'invalid_credentials' };

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('ativo')
        .eq('id', data.user.id)
        .single();
      if (profile && profile.ativo === false) {
        await supabase.auth.signOut({ scope: 'local' });
        return { error: 'conta_desativada' };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    // lote 3c de pecas: o aviso no navegador sai com a conta (a inscricao e apagada antes do logout)
    await desligarAvisos();
    await supabase.auth.signOut({ scope: 'local' });
    setUser(null);
    setOficina(null);
    setFuncionario(null);
    setLoja(null);
    setAuthUser(null);
  };

  const refreshProfile = async () => {
    if (authUser) await fetchProfile(authUser.id);
  };

  const updateOficina = async (data: Partial<Oficina>) => {
    if (!oficina) return;
    await supabase.from('oficinas').update(data).eq('id', oficina.id);
    await refreshProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        oficina,
        funcionario,
        loja,
        authUser,
        isLoggedIn: !!user,
        loading,
        signIn,
        signOut,
        refreshProfile,
        updateOficina,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
