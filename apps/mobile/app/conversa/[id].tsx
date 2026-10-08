import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { abrirOficina } from '../../lib/oficina-link';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { File } from 'expo-file-system';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import AudioMensagem from '../../components/AudioMensagem';
import { useAvisos } from '../../lib/avisos';

interface Mensagem {
  id: string;
  solicitacao_id: string;
  oficina_id?: string;
  remetente_id: string;
  texto: string;
  tipo?: string;
  audio_url?: string | null;
  audio_duracao_segundos?: number | null;
  transcricao?: string | null;
  lida: boolean;
  created_at: string;
}

// Conversa com a oficina: texto e audio (gravado aqui ou recebido do site).
export default function ConversaScreen() {
  const { t, i18n } = useTranslation();
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const { id, oficina: oficinaParam, pagador } = useLocalSearchParams<{ id: string; oficina?: string; pagador?: string }>();
  // Cada oficina tem a sua conversa. Sem ?oficina: orcamento aceito -> essa;
  // uma so oficina -> ela; varias -> o cliente escolhe.
  const [oficinaId, setOficinaId] = useState<string | null>(oficinaParam || null);
  const [oficinaNome, setOficinaNome] = useState('');
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[] | null>(null);
  const tituloTela = oficinaNome || t('mensagens.titulo');
  const [versao, setVersao] = useState(0);
  const [puxando, setPuxando] = useState(false);
  // titulo = oficina; o icone abre a pagina publica dela (avaliacoes, endereco)
  const oficinaDoTitulo = useRef<string | null>(null);
  const opcoesTela = useMemo(() => ({
    headerShown: true, title: tituloTela,
    headerRight: () => (oficinaDoTitulo.current ? (
      <Pressable onPress={() => oficinaDoTitulo.current && abrirOficina(oficinaDoTitulo.current, i18n.language)} accessibilityRole="link" accessibilityLabel={t('orcamentos.verOficina')} hitSlop={10}>
        <Ionicons name="storefront-outline" size={22} color="#1d4ed8" />
      </Pressable>
    ) : null),
  }), [tituloTela]); // eslint-disable-line react-hooks/exhaustive-deps
  const { user } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  // pagador=1: sou o outro motorista do acidente e pago o reparo - conversa
  // particular minha com a oficina (o cliente do pedido nao a ve)
  const pagadorId = pagador === '1' ? (user?.id ?? null) : null;
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
  }, [id, oficinaId, pagadorId]);

  useEffect(() => {
    if (!oficinaId) return;
    oficinaDoTitulo.current = oficinaId;
    supabase.from('oficinas').select('nome_fantasia').eq('id', oficinaId).maybeSingle()
      .then(({ data }) => setOficinaNome((data as any)?.nome_fantasia || ''));
  }, [oficinaId]);

  useEffect(() => {
    if (!id || !oficinaId || (pagador === '1' && !pagadorId)) return;

    async function fetchMensagens() {
      const { data } = await supabase.from('mensagens').select('*').eq('solicitacao_id', id).eq('oficina_id', oficinaId!)
        .filter('pagador_id', pagadorId ? 'eq' : 'is', pagadorId ?? null).order('created_at', { ascending: true });
      setMensagens((data as Mensagem[]) || []);
      setLoading(false);
      setPuxando(false);
    }
    fetchMensagens();

    const channel = supabase
      .channel(`msgs-mobile-${id}-${oficinaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `solicitacao_id=eq.${id}` }, (payload) => {
        if ((payload.new as any).oficina_id !== oficinaId || ((payload.new as any).pagador_id || null) !== pagadorId) return;
        setMensagens((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new as Mensagem]));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, oficinaId, pagadorId, versao]);

  useEffect(() => {
    if (!user || !oficinaId || mensagens.length === 0) return;
    const naoLidas = mensagens.filter((m) => !m.lida && m.remetente_id !== user.id);
    if (naoLidas.length > 0) {
      supabase.from('mensagens').update({ lida: true }).eq('solicitacao_id', id).eq('oficina_id', oficinaId).filter('pagador_id', pagadorId ? 'eq' : 'is', pagadorId ?? null).neq('remetente_id', user.id)
        .then(() => supabase.from('notificacoes').update({ lida: true }).eq('profile_id', user.id).eq('tipo', 'nova_mensagem').eq('dados->>solicitacao_id', id))
        .then(() => atualizarAvisos());
    }
  }, [mensagens, user, id, oficinaId, pagadorId]);

  // audio: toca o microfone para gravar; depois enviar ou descartar
  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const estadoGravacao = useAudioRecorderState(gravador);
  const [gravando, setGravando] = useState(false);
  const [fechada, setFechada] = useState(false);
  useEffect(() => {
    if (!id || !oficinaId) return;
    supabase.rpc('conversa_aberta', { p_sol: id, p_of: oficinaId }).then(({ data }) => setFechada(data === false));
  }, [id, oficinaId]);

  const comecarGravacao = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('mensagens.microfoneTitulo'), t('mensagens.microfoneTexto'));
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await gravador.prepareToRecordAsync();
    gravador.record();
    setGravando(true);
  };

  const pararGravacao = async (enviar: boolean) => {
    const duracao = Math.max(1, Math.round((estadoGravacao.durationMillis || 0) / 1000));
    await gravador.stop();
    setGravando(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!enviar || !gravador.uri || !user || !oficinaId) return;
    setEnviando(true);
    try {
      // mesma pasta do site: audio/<pedido>/<oficina>/[<quem paga>/]<arquivo>
      const caminho = `audio/${id}/${oficinaId}/${pagadorId ? `${pagadorId}/` : ''}${Date.now()}.m4a`;
      const bytes = await new File(gravador.uri).arrayBuffer();
      const { error: eUp } = await supabase.storage.from('damage-photos').upload(caminho, bytes, { contentType: 'audio/mp4' });
      if (eUp) throw eUp;
      const audioUrl = supabase.storage.from('damage-photos').getPublicUrl(caminho).data.publicUrl;
      const { data: nova, error } = await supabase.from('mensagens').insert({
        solicitacao_id: id, oficina_id: oficinaId, pagador_id: pagadorId, remetente_id: user.id,
        texto: '[Audio]', tipo: 'audio', audio_url: audioUrl, audio_duracao_segundos: duracao,
      }).select('*').single();
      if (error) throw error;
      if (nova) setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova as Mensagem]));
      if (nova?.id) apiFetch('/api/avisar-mensagem', { method: 'POST', body: JSON.stringify({ mensagemId: nova.id }) }).catch(() => {});
    } catch {
      Alert.alert(t('common.erroGenerico'), t('mensagens.erroEnviar'));
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviar = async () => {
    if (!texto.trim() || !user || !oficinaId || enviando) return;
    const conteudo = texto.trim();
    setEnviando(true);
    const { data: nova, error } = await supabase.from('mensagens')
      .insert({ solicitacao_id: id, oficina_id: oficinaId, pagador_id: pagadorId, remetente_id: user.id, texto: conteudo }).select('id').single();
    setEnviando(false);
    // aviso para a oficina (o site ja avisava; o app nao)
    if (!error && nova?.id) apiFetch('/api/avisar-mensagem', { method: 'POST', body: JSON.stringify({ mensagemId: nova.id }) }).catch(() => {});
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
      <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        ref={listRef}
        data={mensagens}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={() => { setPuxando(true); setVersao((v) => v + 1); }} />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const minha = item.remetente_id === user?.id;
          return (
            <View className={`max-w-[80%] rounded-2xl px-4 py-2 mb-2 ${minha ? 'self-end bg-primary-600' : 'self-start bg-white border border-gray-200'}`}>
              {item.tipo === 'audio' && item.audio_url ? (
                <AudioMensagem url={item.audio_url} duracao={item.audio_duracao_segundos} transcricao={item.transcricao} minha={minha} />
              ) : (
                <Text className={minha ? 'text-white' : 'text-gray-900'}>{item.texto}</Text>
              )}
            </View>
          );
        }}
      />
      {fechada ? (
        <Text className="px-4 py-4 bg-gray-100 border-t border-gray-200 text-gray-600 text-sm">{t('garantia.conversaEncerrada')}</Text>
      ) : gravando ? (
        <View className="flex-row items-center gap-3 px-4 py-3 bg-white border-t border-gray-200">
          <View className="w-3 h-3 rounded-full bg-red-500" />
          <Text className="flex-1 text-gray-800">
            {t('mensagens.gravando')} {Math.floor((estadoGravacao.durationMillis || 0) / 60000)}:{String(Math.floor(((estadoGravacao.durationMillis || 0) / 1000) % 60)).padStart(2, '0')}
          </Text>
          <Pressable onPress={() => pararGravacao(false)} accessibilityRole="button" accessibilityLabel={t('common.cancelar')} className="w-11 h-11 rounded-full border border-gray-300 items-center justify-center">
            <Ionicons name="trash-outline" size={20} color="#6b7280" />
          </Pressable>
          <Pressable onPress={() => pararGravacao(true)} accessibilityRole="button" accessibilityLabel={t('mensagens.enviarAudio')} className="w-11 h-11 rounded-full bg-primary-600 items-center justify-center">
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-center gap-2 px-4 py-3 bg-white border-t border-gray-200">
          <TextInput accessibilityLabel={t('mensagens.digiteMensagem')}
            value={texto}
            onChangeText={setTexto}
            placeholder={t('mensagens.digiteMensagem')}
            className="flex-1 border border-gray-300 rounded-full px-4 py-2"
            multiline
          />
          {texto.trim() ? (
            <Pressable onPress={handleEnviar} disabled={enviando} accessibilityRole="button" accessibilityLabel={t('mensagens.enviar')} className="bg-primary-600 rounded-full w-11 h-11 items-center justify-center" style={{ opacity: enviando ? 0.5 : 1 }}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          ) : (
            <Pressable onPress={comecarGravacao} disabled={enviando} accessibilityRole="button" accessibilityLabel={t('mensagens.gravarAudio')} className="bg-green-600 rounded-full w-11 h-11 items-center justify-center" style={{ opacity: enviando ? 0.5 : 1 }}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Ionicons name="mic" size={20} color="#fff" />}
            </Pressable>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
