import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { avisar } from '../../lib/confirmar';
import { abrirOficina } from '../../lib/oficina-link';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { formatDate } from '@fixauto/shared';
import { usePresoNaAreaVisivel } from '../../lib/conversa-web';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import AudioMensagem from '../../components/AudioMensagem';
import { useAvisos } from '../../lib/avisos';
import { useTraducoes, AvisoTraducao } from '../../lib/traducao';

// mensagem da outra pessoa na lingua de quem le (a propria fica como escrita)
function TextoMensagem({ texto, minha }: { texto: string; minha: boolean }) {
  const [original, setOriginal] = useState(false);
  const tr = useTraducoes([texto], original, !minha);
  return (
    <>
      <Text className={minha ? 'text-white' : 'text-gray-900'}>{tr.textos[0]}</Text>
      <AvisoTraducao traduzido={tr.traduzido} original={original} alternar={() => setOriginal((o) => !o)} />
    </>
  );
}

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
  const naWeb = Platform.OS === 'web';
  const opcoesTela = useMemo(() => (naWeb ? { headerShown: false } : {
    headerShown: true, title: tituloTela,
    headerRight: () => (oficinaDoTitulo.current ? (
      // botao com cara de botao e area de toque >= 44x44 (antes so o icone; dificil de tocar - teste do dono 31/10)
      <Pressable onPress={() => oficinaDoTitulo.current && abrirOficina(oficinaDoTitulo.current, i18n.language)} accessibilityRole="link" accessibilityLabel={t('orcamentos.verOficina')}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
        style={({ pressed }) => ({ minHeight: 44, minWidth: 44, opacity: pressed ? 0.7 : 1 })}
        className="flex-row items-center gap-1.5 px-3 rounded-full bg-blue-50 border border-blue-200">
        <Ionicons name="storefront-outline" size={20} color="#1d4ed8" />
        <Text className="text-sm font-semibold text-blue-700" numberOfLines={1}>{t('mensagens.verOficinaCurto')}</Text>
      </Pressable>
    ) : null),
  }), [tituloTela, oficinaId, naWeb]); // eslint-disable-line react-hooks/exhaustive-deps
  const { user } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  // pagador=1: sou o outro motorista do acidente e pago o reparo - conversa
  // particular minha com a oficina (o cliente do pedido nao a ve)
  const pagadorId = pagador === '1' ? (user?.id ?? null) : null;
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  // altura da caixa: 1 linha vazia e cresce com o texto ate ~5 linhas (na web o textarea nascia com 2 linhas)
  const [alturaCaixa, setAlturaCaixa] = useState(44);
  // enviar nao fecha o teclado (dono 09/11): o foco volta a caixa ainda dentro do toque
  const caixaRef = useRef<TextInput>(null);
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
      // INSERT e UPDATE (transcricao do audio chega depois - auditoria E13)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens', filter: `solicitacao_id=eq.${id}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setMensagens((prev) => prev.map((m) => (m.id === (payload.new as any).id ? { ...m, ...(payload.new as Mensagem) } : m)));
          return;
        }
        if (payload.eventType !== 'INSERT') return;
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
  const insets = useSafeAreaInsets();
  // barra de digitacao acima do indicador de inicio do iPhone (auditoria E4)
  const fundoBarra = { paddingBottom: Math.max(insets.bottom, 12) };
  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const estadoGravacao = useAudioRecorderState(gravador);
  const [gravando, setGravando] = useState(false);
  const [fechada, setFechada] = useState(false);
  // servico concluido e conversa ainda aberta: diz ate quando (garantia ou 7 dias, regra do servidor)
  const [abertaAte, setAbertaAte] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !oficinaId) return;
    supabase.rpc('conversa_aberta', { p_sol: id, p_of: oficinaId }).then(({ data }) => setFechada(data === false));
    Promise.all([
      supabase.from('solicitacoes').select('status').eq('id', id).maybeSingle(),
      supabase.from('orcamentos').select('garantia_dias').eq('solicitacao_id', id).eq('oficina_id', oficinaId).eq('status', 'aceito').maybeSingle(),
      supabase.from('agenda').select('data_inicio, data_fim').eq('solicitacao_id', id).eq('oficina_id', oficinaId).eq('status', 'concluido').maybeSingle(),
    ]).then(([{ data: s }, { data: o }, { data: a }]) => {
      if ((s as any)?.status !== 'concluida' || !a) return;
      const base = new Date((a as any).data_fim || (a as any).data_inicio);
      base.setDate(base.getDate() + Math.max(Number((o as any)?.garantia_dias || 0), 7));
      setAbertaAte(base.toISOString());
    });
  }, [id, oficinaId]);
  const raiz = useRef<View>(null);
  usePresoNaAreaVisivel(raiz, !loading && !(!oficinaId && opcoes));

  // saiu da conversa gravando: para e volta o audio ao normal (auditoria E5).
  // Usa o estado DESTA tela (ref), nunca o gravador: na saida a biblioteca ja
  // liberou o objeto nativo, e ler gravador.isRecording dava erro SEMPRE que se
  // voltava da conversa (teste do dono 09/10, ponto 6).
  const gravandoRef = useRef(false);
  useEffect(() => { gravandoRef.current = gravando; }, [gravando]);
  useEffect(() => () => {
    if (gravandoRef.current) {
      try { gravador.stop().catch(() => {}); } catch { /* gravador ja liberado */ }
    }
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const comecarGravacao = async () => {
    // qualquer falha do microfone vira aviso na tela (antes o botao simplesmente nao fazia nada)
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        avisar(t('mensagens.microfoneTitulo'), t('mensagens.microfoneTexto'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await gravador.prepareToRecordAsync();
      gravador.record();
      setGravando(true);
    } catch {
      avisar(t('mensagens.microfoneTitulo'), t('mensagens.microfoneTexto'));
    }
  };
  // na versao web o navegador so da o microfone em endereco seguro (https): sem ele, nada de botao
  const temMicrofone = Platform.OS !== 'web' || (typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia);

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
      avisar(t('common.erroGenerico'), t('mensagens.erroEnviar'));
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviar = async () => {
    if (!texto.trim() || !user || !oficinaId || enviando) return;
    caixaRef.current?.focus();
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
      avisar(t('common.erroGenerico'), t('mensagens.erroEnviar'));
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

  // na versao web o navegador cuida do teclado: o KeyboardAvoidingView deixava a tela 109 px
  // mais alta que o Safari, a caixa de escrever ficava fora da tela e a pagina pulava (dono 08/11)
  const Envolve = Platform.OS === 'web' ? View : KeyboardAvoidingView;
  return (
    <Envolve ref={raiz as any} {...({ dataSet: { conversa: 'sim' } } as any)} behavior="padding" className="flex-1 bg-gray-50" keyboardVerticalOffset={insets.top + (Platform.OS === 'ios' ? 44 : 56)}>
      <Stack.Screen options={opcoesTela} />
      {naWeb && (
        // cabecalho proprio na web: fica sempre no alto da area visivel, mesmo com o teclado
        <View className="flex-row items-center gap-2 px-2 py-2 bg-white border-b border-gray-200" style={{ paddingTop: Math.max(insets.top, 8) }} testID="conversa-cabecalho">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} accessibilityRole="button" accessibilityLabel={t('common.voltar')} hitSlop={8} className="w-11 h-11 items-center justify-center">
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </Pressable>
          <Text className="flex-1 text-base font-semibold text-gray-900" numberOfLines={1}>{tituloTela}</Text>
          {oficinaId ? (
            <Pressable onPress={() => abrirOficina(oficinaId, i18n.language)} accessibilityRole="link" accessibilityLabel={t('orcamentos.verOficina')} testID="conversa-ver-oficina"
              className="flex-row items-center gap-1.5 px-3 rounded-full bg-blue-50 border border-blue-200" style={{ minHeight: 40 }}>
              <Ionicons name="storefront-outline" size={18} color="#1d4ed8" />
              <Text className="text-sm font-semibold text-blue-700" numberOfLines={1}>{t('mensagens.verOficinaCurto')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <FlatList keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'} keyboardShouldPersistTaps="handled"
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
                <TextoMensagem texto={item.texto} minha={minha} />
              )}
            </View>
          );
        }}
      />
      {abertaAte && !fechada ? <Text className="px-4 py-2 bg-gray-100 border-t border-gray-200 text-gray-600 text-xs" testID="conversa-aberta-ate">{t('mensagens.abertaAte', { data: formatDate(abertaAte, i18n.language) })}</Text> : null}
      {fechada ? (
        <Text className="px-4 py-4 bg-gray-100 border-t border-gray-200 text-gray-600 text-sm" testID="conversa-encerrada">{t('garantia.conversaEncerrada')}</Text>
      ) : gravando ? (
        <View className="flex-row items-center gap-3 px-4 pt-3 bg-white border-t border-gray-200" style={fundoBarra}>
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
        <View className="flex-row items-center gap-2 px-4 pt-3 bg-white border-t border-gray-200" style={fundoBarra}>
          <TextInput ref={caixaRef} accessibilityLabel={t('mensagens.digiteMensagem')}
            value={texto}
            onChangeText={setTexto}
            placeholder={t('mensagens.digiteMensagem')}
            // 16 px: com letra menor o Safari do iPhone da zoom ao tocar; ate ~5 linhas, depois rola
            className="flex-1 border border-gray-300 rounded-3xl px-4 py-2 text-[16px]"
            style={{ height: texto ? alturaCaixa : 44, maxHeight: 120 }}
            numberOfLines={1}
            onContentSizeChange={(e) => setAlturaCaixa(Math.min(120, Math.max(44, Math.ceil(e.nativeEvent.contentSize.height) + 2)))}
            multiline
          />
          {texto.trim() ? (
            <Pressable onPress={handleEnviar} disabled={enviando} accessibilityRole="button" accessibilityLabel={t('mensagens.enviar')} className="bg-primary-600 rounded-full w-11 h-11 items-center justify-center" style={{ opacity: enviando ? 0.5 : 1 }}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          ) : temMicrofone ? (
            <Pressable onPress={comecarGravacao} disabled={enviando} accessibilityRole="button" accessibilityLabel={t('mensagens.gravarAudio')} className="bg-green-600 rounded-full w-11 h-11 items-center justify-center" style={{ opacity: enviando ? 0.5 : 1 }}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Ionicons name="mic" size={20} color="#fff" />}
            </Pressable>
          ) : null}
        </View>
      )}
    </Envolve>
  );
}
