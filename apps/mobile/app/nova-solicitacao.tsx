import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { TIPOS_SERVICO, URGENCIAS } from '@fixauto/shared';
import type { Veiculo } from '@fixauto/shared';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { fetchComPrazo } from '../lib/rede';
import { mensagemErro, ErroUsuario } from '../lib/erro';
import EnderecoAutocomplete from '../components/EnderecoAutocomplete';
import { obterPosicao } from '../lib/posicao';
import { arquivoDaFoto } from '../lib/anexo';
import { useAvaliacaoPendente } from '../components/AvaliacaoPendente';


export default function NovaSolicitacaoScreen() {
  const { t } = useTranslation();
  // campo de endereco: ao focar, a tela rola para ele ficar no alto e as sugestoes aparecerem acima do teclado
  const rolagem = useRef<ScrollView>(null);
  const posEndereco = useRef(0);
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('novaSolicitacao.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela, presentation: 'modal' as const }), [tituloTela]);
  const { user } = useAuth();
  // servico entregue sem avaliacao: avaliar antes de pedir de novo (como no Uber)
  const [versaoAval, setVersaoAval] = useState(0);
  const avaliacaoPendente = useAvaliacaoPendente(versaoAval);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [veiculoId, setVeiculoId] = useState('');
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [urgencia, setUrgencia] = useState('media');
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pais, setPais] = useState<string | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      supabase.from('veiculos').select('*').eq('profile_id', user.id).then(({ data }) => setVeiculos((data as Veiculo[]) || []));
    }, [user])
  );

  useEffect(() => {
    (async () => {
      setBuscandoLocal(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await obterPosicao();
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
        const data = await res.json();
        if (data.cidade) setEndereco([data.cidade, data.estado, data.pais].filter(Boolean).join(', '));
        if (data.paisCodigo) setPais(data.paisCodigo);
      } catch {
        // Localização indisponível (GPS desligado, indoors, timeout) - o
        // campo de endereço continua editável manualmente, sem bloquear o
        // fluxo nem precisar de Alert (falha silenciosa e recuperável).
      } finally {
        setBuscandoLocal(false);
      }
    })();
  }, []);

  const handleFoto = async () => {
    // o seletor de fotos do sistema nao precisa de permissao (iOS 14+, Android
    // 13+); pedir antes bloqueava a galeria no Android antigo (auditoria L2)
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets]);
  };

  const handleEnviar = async () => {
    if (!user || !veiculoId || !tipo || !endereco) return;
    setEnviando(true);
    try {
      let finalCoords = coords;
      if (!finalCoords) {
        const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(endereco)}`).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (data.latitude && data.longitude) finalCoords = { lat: data.latitude, lon: data.longitude };
      }
      // sem coordenadas nao cria o pedido (antes ia com Sao Paulo e as oficinas
      // erradas eram avisadas - auditoria E1); igual ao fluxo do acidente
      if (!finalCoords) throw new ErroUsuario(t('emergencia.erroLocalizacao'));

      const { data: sol, error } = await supabase
        .from('solicitacoes')
        .insert({
          cliente_id: user.id,
          veiculo_id: veiculoId,
          tipo,
          descricao: descricao || t(`novaSolicitacao.passoServico`),
          urgencia,
          latitude: finalCoords.lat,
          longitude: finalCoords.lon,
          endereco,
          pais,
        })
        .select()
        .single();

      // banco recusou por avaliacao pendente: mostra o aviso para avaliar
      if (error && /row-level security/i.test(error.message || '')) { setVersaoAval((v) => v + 1); return; }
      if (error || !sol) throw error || new Error('solicitacao nao criada');

      if (fotos.length > 0) {
        const urls: string[] = [];
        for (const foto of fotos) {
          const ext = foto.uri.split('.').pop() || 'jpg';
          const fileName = `solicitacoes/${sol.id}/${Date.now()}.${ext}`;
          const blob = await arquivoDaFoto(foto.uri);
          const { data: uploadData, error: uploadError } = await supabase.storage.from('damage-photos').upload(fileName, blob, { contentType: `image/${ext}` });
          if (uploadError) continue;
          if (uploadData?.path) {
            const { data: urlData } = supabase.storage.from('damage-photos').getPublicUrl(uploadData.path);
            urls.push(urlData.publicUrl);
          }
        }
        if (urls.length > 0) {
          await supabase.from('solicitacao_fotos').insert(urls.map((url) => ({ solicitacao_id: sol.id, foto_url: url })));
        }
      }

      // aviso as oficinas do raio e ao admin: no servidor (antes o celular
      // avisava uma a uma todas as oficinas ativas - auditoria E9)
      apiFetch('/api/pedido-criado', { method: 'POST', body: JSON.stringify({ solicitacaoId: sol.id }) }).catch(() => {});

      setEnviado(true);
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-xl font-bold text-gray-900 mb-2 text-center">{t('novaSolicitacao.sucessoTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('novaSolicitacao.sucessoTexto')}</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} className="bg-primary-600 rounded-lg px-6 py-3">
          <Text className="text-white font-semibold">{t('tabs.inicio')}</Text>
        </Pressable>
      </View>
    );
  }

  if (avaliacaoPendente === undefined) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Stack.Screen options={opcoesTela} />
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }
  if (avaliacaoPendente) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Stack.Screen options={opcoesTela} />
        <Text className="text-4xl mb-3">⭐</Text>
        <Text className="text-xl font-bold text-gray-900 mb-2 text-center">{t('avaliacao.pendenteTitulo', { oficina: avaliacaoPendente.oficina })}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('avaliacao.bloqueio')}</Text>
        <Pressable onPress={() => router.replace(`/solicitacao/${avaliacaoPendente.solicitacaoId}`)} accessibilityRole="button" className="bg-primary-600 rounded-lg px-6 py-3 mb-3 w-full items-center">
          <Text className="text-white font-semibold">{t('avaliacao.avaliarAgora')}</Text>
        </Pressable>
        <Pressable onPress={() => router.replace('/emergencia')} accessibilityRole="button" className="bg-red-600 rounded-lg px-6 py-3 w-full items-center">
          <Text className="text-white font-semibold">{t('dashboard.emergenciaBotao')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView keyboardDismissMode="on-drag" ref={rolagem} className="flex-1 bg-white px-4 pt-4" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={opcoesTela} />

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoVeiculo')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {veiculos.map((v) => (
          <Pressable
            key={v.id}
            onPress={() => setVeiculoId(v.id)}
            className={`px-4 py-2 rounded-full border ${veiculoId === v.id ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
          >
            <Text className={veiculoId === v.id ? 'text-white' : 'text-gray-700'}>{v.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo}` : v.placa || t('veiculos.semDados')}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => router.push('/veiculo/novo')} className="mb-6">
        <Text className="text-primary-600 font-medium">{t('novaSolicitacao.adicionarVeiculo')}</Text>
      </Pressable>

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoServico')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-6">
        {TIPOS_SERVICO.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => setTipo(s.value)}
            className={`px-4 py-2 rounded-full border ${tipo === s.value ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
          >
            <Text className={tipo === s.value ? 'text-white' : 'text-gray-700'}>{s.icon} {t(`constants.tiposServico.${s.value}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-1">{t('novaSolicitacao.passoSintomas')}</Text>
      <TextInput accessibilityLabel={t('novaSolicitacao.passoSintomas')}
        value={descricao}
        onChangeText={setDescricao}
        multiline
        numberOfLines={3}
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-[16px]"
        style={{ textAlignVertical: 'top' }}
      />

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoFotos')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {fotos.map((f, i) => (
          <Image key={i} source={{ uri: f.uri }} className="w-20 h-20 rounded-lg" />
        ))}
      </View>
      <Pressable onPress={handleFoto} className="border border-gray-300 rounded-lg py-3 items-center mb-6">
        <Text className="text-gray-700">{t('novaSolicitacao.passoFotos')}</Text>
      </Pressable>

      <Text className="text-sm font-medium text-gray-700 mb-1">
        {t('novaSolicitacao.passoLocal')} {buscandoLocal && <ActivityIndicator size="small" color="#2563eb" />}
      </Text>
      <View onLayout={(e) => { posEndereco.current = e.nativeEvent.layout.y; }} />
      <EnderecoAutocomplete
        aoFocar={() => setTimeout(() => rolagem.current?.scrollTo({ y: Math.max(0, posEndereco.current - 40), animated: true }), 250)}
        value={endereco}
        onChange={setEndereco}
        perto={coords}
        rotulo={t('novaSolicitacao.passoLocal')}
        onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPais(s.paisCodigo); }}
      />

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('novaSolicitacao.passoUrgencia')}</Text>
      <View className="gap-2 mb-8">
        {URGENCIAS.map((u) => (
          <Pressable
            key={u.value}
            onPress={() => setUrgencia(u.value)}
            className={`border rounded-lg px-4 py-3 ${urgencia === u.value ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
          >
            <Text className="font-medium text-gray-900">{t(`constants.urgencias.${u.value}`)}</Text>
            <Text className="text-gray-500 text-sm">{t(`constants.urgencias.${u.value}Desc`)}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={handleEnviar}
        disabled={enviando || !veiculoId || !tipo || !endereco}
        className="bg-primary-600 rounded-lg py-4 items-center mb-10 disabled:opacity-50"
      >
        {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('novaSolicitacao.enviarSolicitacao')}</Text>}
      </Pressable>
    </ScrollView>
  );
}
