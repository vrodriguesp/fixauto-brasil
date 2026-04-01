'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Profile, Oficina } from '@fixauto/shared';
import { supabase, isSupabaseConfigured } from './supabase';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: Profile | null;
  oficina: Oficina | null;
  authUser: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  signUp: (email: string, password: string, nome: string, telefone: string, tipo: 'cliente' | 'oficina') => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateOficina: (data: Partial<Oficina>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  oficina: null,
  authUser: null,
  isLoggedIn: false,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
  updateOficina: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [oficina, setOficina] = useState<Oficina | null>(null);
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
        const { data: ofi } = await supabase
          .from('oficinas')
          .select('*')
          .eq('profile_id', userId)
          .single();
        setOficina(ofi as Oficina | null);
      } else {
        setOficina(null);
      }
    }
  }, []);

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
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async (
    email: string,
    password: string,
    nome: string,
    telefone: string,
    tipo: 'cliente' | 'oficina'
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Erro ao criar usuario' };

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      tipo,
      nome,
      email,
      telefone,
    });

    if (profileError) return { error: profileError.message };

    await fetchProfile(data.user.id);
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setOficina(null);
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
        authUser,
        isLoggedIn: !!user,
        loading,
        signUp,
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
