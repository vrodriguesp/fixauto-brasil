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
  oficina_id?: string;
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
  const { id, oficina: oficinaParam } = useLocalSearchParams<{ id: string; oficina?: string }>();
  // Cada oficina tem a sua conversa. Sem ?oficina: orcamento aceito -> essa;
  // uma so oficina -> ela; varias -> o cliente escolhe.
  const [oficinaId, setOficinaId] = useState<string | null>(oficinaParam || null);
  const [oficinaNome, setOficinaNome] = useState('');
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[] | null>(null);
  const tituloTela = oficinaNome || t('mensagens.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela }), [tituloTela]);
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id || oficinaId) return;
    (async () => {
      const [{ data: orcs }, { data: msgs }] = await Promise.all([
        supabase.from('orcamentos').select('oficina_id, status, oficina:oficinas(nome_fantasia)').eq('solicitacao_id', id),
        supabase.from('mensagens').select('oficina_id').eq('solicitacao_id', id),
      ]);
      const aceito = (orcs || []).find((o: any) => o.status === 'aceito') as any;
      if (aceito) { setOficinaId(aceito.oficina_id); return; }
      const nomes = new Map<string, string>();
      (orcs || []).forEach((o: any) => nomes.set(o.oficina_id, o.oficina?.nome_fantasia || ''));
      const faltam = Array.from(new Set((msgs || []).map((m: any) => m.oficina_id as string).filter((o) => !nomes.has(o))));
      if (faltam.length) {
        const { data: ofs } = await supabase.from('oficinas').select('id, nome_fantasia').in('id', faltam);
        (ofs || []).forEach((o: any) => nomes.set(o.id, o.nome_fantasia || ''));
        faltam.forEach((o) => { if (!nomes.has(o)) nomes.set(o, ''); });
      }
      if (nomes.size === 1) { setOficinaId(Array.from(nomes.keys())[0]); return; }
      setOpcoes(Array.from(nomes.entries()).map(([oid, nome]) => ({ id: oid, nome })));
      setLoading(false);
    })();
  }, [id, oficinaId]);

  useEffect(() => {
    if (!oficinaId) return;
    supabase.from('oficinas').select('nome_fantasia').eq('id', oficinaId).maybeSingle()
      .then(({ data }) => setOficinaNome((data as any)?.nome_fantasia || ''));
  }, [oficinaId]);

  useEffect(() => {
    if (!id || !oficinaId) return;

    async function fetchMensagens() {
      const { data } = await supabase.from('mensagens').select('*').eq('solicitacao_id', id).eq('oficina_id', oficinaId!).is('pagador_id', null).order('created_at', { ascending: true });
      setMensagens((data as Mensagem[]) || []);
      setLoading(false);
    }
    fetchMensagens();

    const channel = supabase
      .channel(`msgs-mobile-${id}-${oficinaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `solicitacao_id=eq.${id}` }, (payload) => {
        if ((payload.new as any).oficina_id !== oficinaId || (payload.new as any).pagador_id) return;
        setMensagens((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new as Mensagem]));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, oficinaId]);

  useEffect(() => {
    if (!user || !oficinaId || mensagens.length === 0) return;
    const naoLidas = mensagens.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (naoLidas.length > 0) {
      supabase.from('mensagens').update({ lida: true }).eq('solicitacao_id', id).eq('oficina_id', oficinaId).is('pagador_id', null).neq('remetente_id', user.id).then();
    }
  }, [mensagens, user, id, oficinaId]);

  const handleEnviar = async () => {
    if (!texto.trim() || !user || !oficinaId || enviando) return;
    const conteudo = texto.trim();
    setEnviando(true);
    const { error } = await supabase.from('mensagens').insert({ solicitacao_id: id, oficina_id: oficinaId, remetente_id: user.id, texto: conteudo });
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

  if (!oficinaId && opcoes) {
    return (
      <View className="flex-1 bg-gray-50 p-4">
        <Stack.Screen options={opcoesTela} />
        <Text className="text-lg font-bold text-gray-900 mb-1">{t('mensagens.escolherOficina')}</Text>
        <Text className="text-gray-500 mb-4">{t('mensagens.escolherOficinaTexto')}</Text>
        {opcoes.length === 0 ? (
          <Text className="text-gray-500 bg-white border border-gray-200 rounded-xl p-4">{t('mensagens.semConversaAinda')}</Text>
        ) : (
          opcoes.map((o) => (
            <Pressable key={o.id} onPress={() => { setLoading(true); setOficinaId(o.id); }} accessibilityRole="button"
              className="bg-white border border-gray-200 rounded-xl px-4 py-4 mb-2">
              <Text className="font-semibold text-gray-900">{o.nome || '-'}</Text>
            </Pressable>
          ))
        )}
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
