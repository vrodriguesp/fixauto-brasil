import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';

interface Mensagem {
  id: string;
  solicitacao_id: string;
  remetente_id: string;
  texto: string;
  tipo?: string;
  lida: boolean;
  created_at: string;
}

// v1: chat de texto com a oficina. Audio (que o web ja tem) fica pra proxima
// leva - ver docs/ESPECIFICACAO_APP_MOBILE_CLIENTE.md.
export default function ConversaScreen() {
  const { t } = useTranslation();
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('mensagens.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela }), [tituloTela]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchMensagens() {
      const { data } = await supabase.from('mensagens').select('*').eq('solicitacao_id', id).order('created_at', { ascending: true });
      setMensagens((data as Mensagem[]) || []);
      setLoading(false);
    }
    fetchMensagens();

    const channel = supabase
      .channel(`msgs-mobile-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `solicitacao_id=eq.${id}` }, (payload) => {
        setMensagens((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new as Mensagem]));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!user || mensagens.length === 0) return;
    const naoLidas = mensagens.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (naoLidas.length > 0) {
      supabase.from('mensagens').update({ lida: true }).eq('solicitacao_id', id).neq('remetente_id', user.id).then();
    }
  }, [mensagens, user, id]);

  const handleEnviar = async () => {
    if (!texto.trim() || !user || enviando) return;
    const conteudo = texto.trim();
    setEnviando(true);
    const { error } = await supabase.from('mensagens').insert({ solicitacao_id: id, remetente_id: user.id, texto: conteudo });
    setEnviando(false);
    if (error) {
      // Nao limpa a caixa de texto - o usuario nao perde o que escreveu se
      // o envio falhar (rede caiu, RLS, etc.), e pode tentar de novo.
      Alert.alert(t('common.erroGenerico'), t('mensagens.erroEnviar'));
      return;
    }
    setTexto('');
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-gray-50" keyboardVerticalOffset={90}>
      <Stack.Screen options={opcoesTela} />
      <FlatList
        ref={listRef}
        data={mensagens}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const minha = item.remetente_id === user?.id;
          return (
            <View className={`max-w-[80%] rounded-2xl px-4 py-2 mb-2 ${minha ? 'self-end bg-primary-600' : 'self-start bg-white border border-gray-200'}`}>
              <Text className={minha ? 'text-white' : 'text-gray-900'}>{item.texto}</Text>
            </View>
          );
        }}
      />
      <View className="flex-row items-center gap-2 px-4 py-3 bg-white border-t border-gray-200">
        <TextInput accessibilityLabel={t('mensagens.digiteMensagem')}
          value={texto}
          onChangeText={setTexto}
          placeholder={t('mensagens.digiteMensagem')}
          className="flex-1 border border-gray-300 rounded-full px-4 py-2"
          multiline
        />
        <Pressable onPress={handleEnviar} disabled={!texto.trim() || enviando} accessibilityRole="button" accessibilityLabel={t('mensagens.enviar')} className="bg-primary-600 rounded-full w-10 h-10 items-center justify-center" style={{ opacity: !texto.trim() || enviando ? 0.5 : 1 }}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
