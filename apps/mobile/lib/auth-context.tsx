import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { Profile, Oficina, Funcionario } from '@fixauto/shared';
import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import i18n from '../i18n';
import { API_BASE_URL } from './api';
import { idiomaEscolhido } from './idiomas';
import { removerPush } from './push';
import { CHAVE_PERFIL, CHAVE_OFICINA, limparCachePerfil, cacheOficinaVale } from './cache-perfil';

// quem esta no app: motorista (cliente) ou oficina (dono ou funcionario da equipe)
export type Papel = 'cliente' | 'oficina';

interface AuthContextType {
  user: Profile | null;
  /** oficina da conta (dona ou funcionario ativo) - so com user.tipo === 'oficina' */
  oficina: Oficina | null;
  /** linha de funcionarios quando a conta e da equipe (nao a dona) */
  funcionario: Funcionario | null;
  papel: Papel | null;
  authUser: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  signUp: (email: string, password: string, nome: string, telefone: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  // token de uso unico devolvido pelas rotas do site depois do codigo de 6 digitos
  // (pedido sem senha, login por codigo; apps/web/src/lib/login-token.ts)
  signInComToken: (tokenHash: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  oficina: null,
  funcionario: null,
  papel: null,
  authUser: null,
  isLoggedIn: false,
  loading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInComToken: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

// O app atende motoristas (cliente) e, desde 27/11 (pedido do dono), oficinas: a dona da oficina ou um
// funcionario ativo da equipe (mesma regra do site, apps/web/src/lib/auth-context.tsx). Loja de pecas e
// admin continuam so no site: nao ha tela para eles aqui.
// codigos estaveis: a tela de login traduz (auth.tipoNaoSuportado, auth.contaDesativada, auth.semOficina)
const ERRO_TIPO_NAO_SUPORTADO = 'tipo_nao_suportado';
// conta de oficina sem oficina (nem dona nem funcionario ativo): nao ha o que mostrar
const ERRO_SEM_OFICINA = 'sem_oficina';
// ultimo perfil valido (CHAVE_PERFIL) e oficina + funcionario (CHAVE_OFICINA): abrem o app sem rede (lib/cache-perfil.ts)
// falha de rede do GoTrue (status 0 / "Network request failed" / fetch): nao e credencial errada
const ehErroDeRede = (e: { status?: number; code?: string; message?: string; name?: string }) =>
  e.status === 0 || /network|fetch|timeout|ECONN/i.test(e.message || '') || /Retryable|Fetch/i.test(e.name || '');
type CacheOficina = { oficina: Oficina | null; funcionario: Funcionario | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [user, setUser] = useState<Profile | null>(null);
  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
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
        if (cache.tipo === 'oficina') {
          const g = await AsyncStorage.getItem(CHAVE_OFICINA).catch(() => null);
          const co = g ? JSON.parse(g) as CacheOficina : null;
          // so a oficina desta conta (revisao 28/11)
          if (!cacheOficinaVale(co, userId)) { setUser(null); return { profile: null, error: 'perfil_nao_encontrado' }; }
          setOficina(co!.oficina); setFuncionario(co!.funcionario);
        }
        setUser(cache);
        return { profile: cache, error: null };
      }
      setUser(null);
      return { profile: null, error: 'perfil_nao_encontrado' };
    }
    if (profile.ativo === false) {
      await supabase.auth.signOut({ scope: 'local' });
      limparCachePerfil();
      setUser(null);
      return { profile: null, error: 'conta_desativada' };
    }
    if (profile.tipo !== 'cliente' && profile.tipo !== 'oficina') {
      await supabase.auth.signOut({ scope: 'local' });
      limparCachePerfil();
      setUser(null);
      return { profile: null, error: ERRO_TIPO_NAO_SUPORTADO };
    }

    // Oficina: a propria (profile_id) ou, se nao e dona, a da equipe (funcionarios ativo) - igual ao site.
    // Tudo lido ANTES de definir user: as abas da oficina nunca abrem sem saber qual oficina e.
    let ofi: Oficina | null = null;
    let func: Funcionario | null = null;
    if (profile.tipo === 'oficina') {
      const { data: propria, error: e1 } = await supabase.from('oficinas').select('*').eq('profile_id', userId).maybeSingle();
      ofi = (propria as Oficina | null) ?? null;
      let e2: unknown = null;
      if (!ofi && !e1) {
        const { data: f, error } = await supabase.from('funcionarios').select('*, oficina:oficinas(*)').eq('profile_id', userId).eq('ativo', true).maybeSingle();
        e2 = error;
        if (f) { func = f as Funcionario; ofi = ((f as any).oficina as Oficina) ?? null; }
      }
      // ERRO de leitura (sem rede, gateway fora) nao e "sem oficina": usa a oficina guardada e NUNCA sai da conta
      // (teste 28/11: gateway parado por 1 min deslogou a oficina)
      if (!ofi && (e1 || e2)) {
        const g = await AsyncStorage.getItem(CHAVE_OFICINA).catch(() => null);
        const co = g ? JSON.parse(g) as CacheOficina : null;
        if (!cacheOficinaVale(co, userId)) { setUser(null); return { profile: null, error: 'perfil_nao_encontrado' }; }
        ofi = co!.oficina; func = co!.funcionario;
      }
      if (!ofi) {
        await supabase.auth.signOut({ scope: 'local' });
        limparCachePerfil();
        setUser(null);
        return { profile: null, error: ERRO_SEM_OFICINA };
      }
    }
    setOficina(ofi);
    setFuncionario(func);
    AsyncStorage.setItem(CHAVE_OFICINA, JSON.stringify({ oficina: ofi, funcionario: func } satisfies CacheOficina)).catch(() => {});

    setUser(profile as Profile);
    AsyncStorage.setItem(CHAVE_PERFIL, JSON.stringify(profile)).catch(() => {});
    // Idioma (regra da Apple, decisao do dono 10/10): vale o idioma do
    // aparelho - no iPhone, inclusive o escolhido so para o BipFix nos Ajustes -
    // ou a escolha feita no app (Android/Expo Go). A conta SEGUE o app (e-mails
    // no mesmo idioma); antes o app obedecia a conta e abria em estoniano para
    // quem tinha criado a conta na versao /ee/et do site.
    const escolhido = await idiomaEscolhido();
    if (escolhido && escolhido !== profile.idioma) {
      supabase.from('profiles').update({ idioma: escolhido }).eq('id', userId).then(() => {});
      if (i18n.language !== escolhido) i18n.changeLanguage(escolhido);
    } else if (!escolhido && profile.idioma !== i18n.language) {
      supabase.from('profiles').update({ idioma: i18n.language }).eq('id', userId).then(() => {});
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
    // limite de 8 s (como o site): sem rede o perfil vem do cache; se nem isso, a tela de login aparece em vez de
    // girar para sempre (ENT-7, auditoria 27/11)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        await Promise.race([fetchProfile(session.user.id).catch(() => {}), new Promise((r) => setTimeout(r, 8000))]);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
      setAuthUser(session?.user ?? null);
      // perfil so quando muda quem esta logado (nao a cada renovacao de token,
      // ~1x/h, que refazia todas as consultas e o canal de avisos - auditoria E10)
      if (session?.user && ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED'].includes(evento)) {
        fetchProfile(session.user.id).catch(() => {});
      } else if (!session?.user) {
        // sem sessao: limpa tudo. A renovacao do token (TOKEN_REFRESHED, com sessao) nao mexe no perfil ja
        // carregado - antes zerava o user e as abas pulavam para o login por um instante
        setUser(null); setOficina(null); setFuncionario(null);
      }
    });

    // recomendacao do Supabase para React Native: renovar o token so com o app
    // em primeiro plano (sem isso o realtime seguia com token vencido - E11)
    const app = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => { subscription.unsubscribe(); app.remove(); };
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
    // codigo estavel, traduzido na tela (email_not_confirmed, invalid_credentials...); sem rede nao e "senha errada" (M15)
    if (error) return { error: ehErroDeRede(error) ? 'sem_rede' : (error.code || 'invalid_credentials') };
    if (!data.user) return { error: null };

    const { error: profileError } = await fetchProfile(data.user.id);
    return { error: profileError };
  };

  const signInComToken = async (tokenHash: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error) return { error: error.code || 'invalid_credentials' };
    if (!data.user) return { error: null };
    const { error: profileError } = await fetchProfile(data.user.id);
    return { error: profileError };
  };

  const signOut = async () => {
    // este aparelho para de receber o push desta conta (antes de perder o login)
    await removerPush();
    await supabase.auth.signOut({ scope: 'local' });
    limparCachePerfil();
    setUser(null); setOficina(null); setFuncionario(null);
    setAuthUser(null);
  };

  const refreshProfile = async () => {
    if (authUser) await fetchProfile(authUser.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, oficina, funcionario, papel: user ? (user.tipo === 'oficina' ? 'oficina' : 'cliente') : null, authUser, isLoggedIn: !!user, loading, signUp, signIn, signInComToken, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
