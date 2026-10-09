import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import i18n from '../i18n';
import { View, Text, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './supabase';
import { useAuth } from './auth-context';

export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  dados: Record<string, string> | null;
  created_at: string;
}

interface Ctx {
  /** muda a cada aviso que chega: as telas abertas recarregam (estado do conserto, orcamentos...) */
  chegou: number;
  naoLidos: Aviso[];
  mensagensNaoLidas: number;
  abrir: (a: Aviso) => void;
  atualizar: () => void;
}
const AvisosCtx = createContext<Ctx>({ chegou: 0, naoLidos: [], mensagensNaoLidas: 0, abrir: () => {}, atualizar: () => {} });
export const useAvisos = () => useContext(AvisosCtx);

// Para onde vai cada aviso ao ser tocado
function destino(a: Aviso): string | null {
  const d = a.dados || {};
  if (a.tipo === 'nova_mensagem' && d.solicitacao_id) {
    const p = new URLSearchParams();
    if (d.oficina_id) p.set('oficina', d.oficina_id);
    if (d.pagador_id) p.set('pagador', '1');
    return `/conversa/${d.solicitacao_id}${p.toString() ? `?${p}` : ''}`;
  }
  if (d.solicitacao_id) return `/solicitacao/${d.solicitacao_id}`;
  return null;
}

// Avisos dentro do app (orcamento novo, mensagem, carro chegou na oficina,
// etapa do conserto...): aparecem no alto da tela na hora em que chegam,
// contam nas abas e ficam na tela inicial ate serem abertos. (Aviso com o app
// fechado - push - exige o app instalado como versao propria, nao o Expo Go.)
export function AvisosProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [naoLidos, setNaoLidos] = useState<Aviso[]>([]);
  const [mensagensNaoLidas, setMensagensNaoLidas] = useState(0);
  const [banner, setBanner] = useState<Aviso | null>(null);
  const [chegou, setChegou] = useState(0);
  const opacidade = useRef(new Animated.Value(0)).current;
  const tmr = useRef<ReturnType<typeof setTimeout> | null>(null);

  const atualizar = useCallback(async () => {
    if (!user) { setNaoLidos([]); setMensagensNaoLidas(0); return; }
    const [{ data: avisos }, { data: sols }] = await Promise.all([
      supabase.from('notificacoes').select('*').eq('profile_id', user.id).eq('lida', false).order('created_at', { ascending: false }).limit(30),
      supabase.from('solicitacoes').select('id').eq('cliente_id', user.id),
    ]);
    setNaoLidos((avisos as Aviso[]) || []);
    const ids = (sols || []).map((s: any) => s.id);
    // mensagens nao lidas: as dos meus pedidos e as da conversa em que eu pago o reparo
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      ids.length
        ? supabase.from('mensagens').select('id', { count: 'exact', head: true }).in('solicitacao_id', ids).is('pagador_id', null).eq('lida', false).neq('remetente_id', user.id)
        : Promise.resolve({ count: 0 } as any),
      supabase.from('mensagens').select('id', { count: 'exact', head: true }).eq('pagador_id', user.id).eq('lida', false).neq('remetente_id', user.id),
    ]);
    setMensagensNaoLidas((c1 || 0) + (c2 || 0));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrar = useCallback((a: Aviso) => {
    setBanner(a);
    Animated.timing(opacidade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(() => {
      Animated.timing(opacidade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setBanner(null));
    }, 5000);
  }, [opacidade]);

  const fechar = useCallback(() => {
    if (tmr.current) clearTimeout(tmr.current);
    Animated.timing(opacidade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setBanner(null));
  }, [opacidade]);

  const abrir = useCallback((a: Aviso) => {
    setBanner(null);
    setNaoLidos((l) => l.filter((x) => x.id !== a.id));
    supabase.from('notificacoes').update({ lida: true }).eq('id', a.id).then(() => {});
    const para = destino(a);
    if (para) router.push(para as any);
  }, []);

  useEffect(() => {
    atualizar();
    if (!user) return;
    const canal = supabase
      .channel(`avisos-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `profile_id=eq.${user.id}` }, (payload) => {
        mostrar(payload.new as Aviso);
        atualizar();
        setChegou((n) => n + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [user?.id, atualizar, mostrar]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AvisosCtx.Provider value={{ chegou, naoLidos, mensagensNaoLidas, abrir, atualizar }}>
      {children}
      {banner && (
        // cartao solido (estilo fixo, nao depende das classes) para nao ficar
        // so o texto por cima da tela; toque abre, o X fecha na hora
        <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 6, opacity: opacidade, zIndex: 1000, elevation: 12 }}>
          <View style={{ backgroundColor: '#111827', borderRadius: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 12 }}>
            <Pressable onPress={() => abrir(banner)} accessibilityRole="button" accessibilityLabel={banner.titulo}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16 }}>
              <Ionicons name="notifications" size={20} color="#fff" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }} numberOfLines={1}>{banner.titulo}</Text>
                {banner.mensagem ? <Text style={{ color: '#e5e7eb', fontSize: 13 }} numberOfLines={2}>{banner.mensagem}</Text> : null}
              </View>
            </Pressable>
            <Pressable onPress={fechar} accessibilityRole="button" accessibilityLabel={i18n.t('common.fechar')} hitSlop={10} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
              <Ionicons name="close" size={20} color="#9ca3af" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </AvisosCtx.Provider>
  );
}
