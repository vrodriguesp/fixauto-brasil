'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Profile, Oficina, Funcionario, LojaPecas } from '@fixauto/shared';
import { supabase, isSupabaseConfigured } from './supabase';
import type { User } from '@supabase/supabase-js';
import { instalarSessaoNasApis } from './sessao-api';

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

    if (profile) {
      setUser(profile as Profile);

      if (profile.tipo === 'oficina') {
        // Check if this profile owns an oficina
        const { data: ofi } = await supabase
          .from('oficinas')
          .select('*')
          .eq('profile_id', userId)
          .single();
        setOficina(ofi as Oficina | null);

        // Also check if they're a funcionario (admin of their own oficina doesn't need this)
        if (!ofi) {
          const { data: func } = await supabase
            .from('funcionarios')
            .select('*, oficina:oficinas(*)')
            .eq('profile_id', userId)
            .eq('ativo', true)
            .single();
          if (func) {
            setFuncionario(func as Funcionario);
            setOficina(func.oficina as Oficina);
          }
        } else {
          setFuncionario(null);
        }
      } else {
        setOficina(null);
        setFuncionario(null);
      }

      if (profile.tipo === 'loja_pecas') {
        const { data: lj } = await supabase
          .from('lojas_pecas')
          .select('*')
          .eq('profile_id', userId)
          .single();
        setLoja(lj as LojaPecas | null);
      } else {
        setLoja(null);
      }
    }
  }, []);

  // renova o login antes de cada chamada as rotas /api (evita "sessao expirada" no celular)
  useEffect(() => { instalarSessaoNasApis(); }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        fetchProfile(session.user.id);
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
        await supabase.auth.signOut();
        return { error: 'conta_desativada' };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
