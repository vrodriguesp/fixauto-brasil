import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { useAvisos, type Aviso } from '../lib/avisos';

// "ha 5 min", "ontem 14:30", "12/10 09:15"
function quando(iso: string, idioma: string, t: (k: string, o?: any) => string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return t('notificacoes.agora');
  if (min < 60) return t('notificacoes.haMinutos', { n: min });
  const hora = d.toLocaleTimeString(idioma, { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === new Date().toDateString()) return hora;
  if (d.toDateString() === ontem.toDateString()) return `${t('notificacoes.ontem')} ${hora}`;
  return `${d.toLocaleDateString(idioma, { day: '2-digit', month: '2-digit' })} ${hora}`;
}

// Todas as interacoes (orcamento novo, mensagem, carro chegou, etapas...), a
// mais recente no alto; as nao lidas em destaque com "Nova".
export default function NotificacoesScreen() {
  const { t, i18n } = useTranslation();
  const titulo = t('notificacoes.titulo');
  const opcoes = useMemo(() => ({ headerShown: true, title: titulo }), [titulo]);
  const { user } = useAuth();
  const { abrir, atualizar, chegou } = useAvisos();
  const [lista, setLista] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('notificacoes').select('*').eq('profile_id', user.id)
      .order('created_at', { ascending: false }).limit(100);
    setLista((data as Aviso[]) || []);
    setCarregando(false);
  }, [user]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  useEffect(() => { if (chegou) carregar(); }, [chegou, carregar]);

  const marcarTodas = async () => {
    if (!user) return;
    await supabase.from('notificacoes').update({ lida: true }).eq('profile_id', user.id).eq('lida', false);
    await carregar();
    atualizar();
  };

  const temNova = lista.some((a) => !a.lida);
  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen options={opcoes} />
      <FlatList
        data={lista}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={temNova ? (
          <Pressable onPress={marcarTodas} accessibilityRole="button" className="self-end py-2 mb-2">
            <Text className="text-primary-700 font-medium">{t('notificacoes.marcarTodas')}</Text>
          </Pressable>
        ) : null}
        ListEmptyComponent={!carregando ? <Text className="text-gray-500 text-center mt-8">{t('notificacoes.nenhuma')}</Text> : null}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => { abrir(item); setLista((l) => l.map((x) => (x.id === item.id ? { ...x, lida: true } : x))); }}
            accessibilityRole="button"
            className={`rounded-xl px-4 py-3 mb-2 border flex-row gap-3 ${item.lida ? 'bg-white border-gray-200' : 'bg-primary-50 border-primary-200'}`}>
            <View className={`w-2.5 h-2.5 rounded-full mt-1.5 ${item.lida ? 'bg-transparent' : 'bg-primary-600'}`} />
            <View className="flex-1">
              <View className="flex-row items-center justify-between gap-2">
                <Text className={`flex-1 ${item.lida ? 'text-gray-800' : 'text-gray-900 font-semibold'}`} numberOfLines={2}>{item.titulo}</Text>
                {!item.lida && <Text className="text-xs font-bold text-primary-700">{index === 0 ? t('notificacoes.maisRecente') : t('notificacoes.nova')}</Text>}
              </View>
              {item.mensagem ? <Text className="text-gray-600 text-sm mt-0.5" numberOfLines={3}>{item.mensagem}</Text> : null}
              <Text className="text-gray-400 text-xs mt-1">{quando(item.created_at, i18n.language, t)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
