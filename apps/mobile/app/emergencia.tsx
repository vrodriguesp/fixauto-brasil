import { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Alert, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/api';
import { fetchComPrazo } from '../lib/rede';
import i18n from '../i18n';
import { ErroApi, ErroUsuario, mensagemErro } from '../lib/erro';
import EnderecoAutocomplete from '../components/EnderecoAutocomplete';
import { obterPosicao, enderecoDaPosicao } from '../lib/posicao';
import { regiaoSeguro, paisDoAcidente, PAISES_SEGURO, nomeDoPais } from '../lib/regiao';
import VehicleCatalogPicker from '../components/VehicleCatalogPicker';
import { arquivoDaFoto } from '../lib/anexo';

type Tipo = 'eu_causei' | 'outro_causou' | 'sem_outro';
type Pagamento = 'proprio' | 'seguro_terceiro' | 'seguro_proprio' | 'nao_sei';
const usaSeguro = (p: Pagamento | '') => p === 'seguro_terceiro' || p === 'seguro_proprio';
// Mesma ordem do site: com culpa do outro, o seguro dele primeiro; sem outro
// veiculo, o seguro do outro nem aparece.
const opcoesPagamento = (tipo: Tipo): Pagamento[] =>
  tipo === 'outro_causou' ? ['seguro_terceiro', 'seguro_proprio', 'proprio', 'nao_sei'] : ['seguro_proprio', 'proprio', 'nao_sei'];

function Opcao({ ativo, onPress, titulo, desc }: { ativo: boolean; onPress: () => void; titulo: string; desc?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: ativo }}
      className={`border-2 rounded-lg px-4 py-3 mb-2 ${ativo ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
    >
      <Text className="text-gray-900 font-medium">{titulo}</Text>
      {desc ? <Text className="text-gray-500 text-xs mt-0.5">{desc}</Text> : null}
    </Pressable>
  );
}

export default function EmergenciaScreen() {
  const { t } = useTranslation();
  // campo de endereco: ao focar, a tela rola para ele ficar no alto e as sugestoes aparecerem acima do teclado
  const rolagem = useRef<ScrollView>(null);
  const posEndereco = useRef(0);
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('emergencia.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela, presentation: 'modal' as const }), [tituloTela]);
  const { user } = useAuth();
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [descricao, setDescricao] = useState('');
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  // resultado da localizacao na tela (antes falhava em silencio)
  const [estadoLocal, setEstadoLocal] = useState<'' | 'ok' | 'negado' | 'negadoAjustes' | 'falhou'>('');
  const [paisAcidente, setPaisAcidente] = useState<string | null>(null);
  // carro (opcional): um dos cadastrados, ou marca/modelo/placa - vira um carro dele
  const [meusVeiculos, setMeusVeiculos] = useState<{ id: string; fipe_marca: string; fipe_modelo: string; placa: string | null }[]>([]);
  const [veiculoEscolhido, setVeiculoEscolhido] = useState<string | null>(null);
  const [marca, setMarca] = useState<{ code: string; name: string } | null>(null);
  const [modelo, setModelo] = useState<{ code: string; name: string } | null>(null);
  const [placa, setPlaca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [tipo, setTipo] = useState<Tipo>('outro_causou');
  // sem login: contato para os orcamentos (o servidor cria a conta e manda o link de senha)
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const faltaContato = !user && (!nome.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !telefone.trim());
  // quem paga o reparo (opcional) - a oficina ve no pedido
  const [pagamento, setPagamento] = useState<Pagamento | ''>('');
  const [seguradora, setSeguradora] = useState('');
  const [sinistro, setSinistro] = useState('');
  const [franquia, setFranquia] = useState('');
  const regiao = regiaoSeguro(paisAcidente);
  // pais do SEGURO e outra escolha (carta verde); por padrao o do acidente
  const [paisSeguro, setPaisSeguro] = useState<string | null>(null);
  const [outroPais, setOutroPais] = useState(false);
  const paisAcid = paisDoAcidente(paisAcidente);
  const nomePais = (c: string) => nomeDoPais(c, i18n.language);

  useEffect(() => {
    if (!user) return;
    supabase.from('veiculos').select('id, fipe_marca, fipe_modelo, placa').eq('profile_id', user.id).order('created_at')
      .then(({ data }) => {
        const lista = (data || []).filter((v: any) => v.fipe_marca);
        setMeusVeiculos(lista as any);
        if (lista.length === 1) setVeiculoEscolhido(lista[0].id);
      });
  }, [user]);

  const handleFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      // negada: explica e oferece os Ajustes (o iOS nao pergunta de novo - auditoria E7)
      Alert.alert(t('emergencia.cameraNegadaTitulo'), t('emergencia.cameraNegadaTexto'), [
        { text: t('common.cancelar'), style: 'cancel' },
        { text: t('emergencia.abrirAjustes'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets]);
  };

  const handleGaleria = async () => {
    // o seletor de fotos do sistema nao precisa de permissao (iOS 14+, Android
    // 13+); pedir antes bloqueava a galeria no Android antigo (auditoria L2)
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets]);
  };

  const handleUsarLocalizacao = async (silencioso = false) => {
    setBuscandoLocal(true);
    try {
      // ja negada: o sistema nao mostra o pedido de novo - entao vai direto
      // aos Ajustes; senao o sistema pergunta (permitir uma vez / sempre)
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setEstadoLocal(perm.canAskAgain ? 'negado' : 'negadoAjustes');
        if (!silencioso && !perm.canAskAgain) {
          Alert.alert(t('emergencia.localNegadaTitulo'), t('emergencia.localNegadaTexto'), [
            { text: t('common.cancelar'), style: 'cancel' },
            { text: t('emergencia.abrirAjustes'), onPress: () => Linking.openSettings() },
          ]);
        }
        return;
      }
      const pos = await obterPosicao();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCoords({ lat, lon });
      setEstadoLocal('ok');
      // endereco com rua e numero (antes so a cidade, e so se o servidor respondesse)
      const end = await enderecoDaPosicao(lat, lon);
      if (end) {
        setEndereco(end.texto);
        if (end.paisCodigo) setPaisAcidente(end.paisCodigo);
      }
    } catch {
      // Permitido mas o GPS nao respondeu: avisa na tela (mesmo na busca
      // automatica ao abrir) - antes falhava calado e parecia nao ter feito nada
      setEstadoLocal('falhou');
    } finally {
      setBuscandoLocal(false);
    }
  };

  // Num acidente a localizacao e essencial: pede ao abrir a tela (o botao
  // continua para quem negou e quer tentar de novo). Tambem aproxima as
  // sugestoes de endereco de onde a pessoa esta.
  useEffect(() => {
    handleUsarLocalizacao(true).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tudo no servidor numa chamada so (/api/emergencia): acidente, fotos,
  // solicitacao e aviso as oficinas. O dono vem do login (Authorization).
  const handleEnviar = async () => {
    setEnviando(true);
    try {
      let localCoords = coords;
      if (!localCoords && endereco) {
        const res = await fetchComPrazo(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(endereco)}`);
        const data = await res.json();
        if (data.latitude && data.longitude) localCoords = { lat: data.latitude, lon: data.longitude };
      }
      // Sem localizacao nao ha como avisar oficinas proximas (antes caia
      // num ponto fixo em Sao Paulo, mesmo para acidentes na Europa)
      if (!localCoords) throw new ErroUsuario(t('emergencia.erroLocalizacao'));

      const form = new FormData();
      form.append('dados', JSON.stringify({
        idioma: i18n.language,
        tipoAcidente: tipo,
        ...(user ? {} : { nome: nome.trim(), email: email.trim(), telefone: telefone.trim() }),
        pagamento_reparo: pagamento || null,
        seguradora,
        sinistro_numero: sinistro,
        franquia,
        descricao: descricao || null,
        endereco,
        latitude: localCoords.lat,
        longitude: localCoords.lon,
        // carro: um dos cadastrados, ou o que a pessoa informou agora (opcional)
        ...(veiculoEscolhido
          ? { veiculoId: veiculoEscolhido }
          : { placa: placa.trim() || null, veiculoInfo: marca ? { marca: marca.name, modelo: modelo?.name || '' } : null }),
      }));
      for (const [i, foto] of fotos.entries()) {
        form.append('fotos', await arquivoDaFoto(foto.uri), `foto-${i}.jpg`);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_BASE_URL}/api/emergencia`, {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: form,
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new ErroApi(res.status, r.codigo);

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
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text className="text-xl font-bold text-gray-900 mt-4 mb-2 text-center">{t('emergencia.sucessoTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-6">{t(user ? 'emergencia.sucessoTexto' : 'emergencia.sucessoSemConta', { email: email.trim() })}</Text>
        <View className="self-stretch bg-gray-50 rounded-lg p-4 mb-6">
          <Text className="font-semibold text-gray-900 mb-2">{t('seguro.proximosTitulo')}</Text>
          {[
            t(`seguro.passo_emergencia_${regiao}`),
            ...(tipo !== 'sem_outro' ? [t(`seguro.passo_registro_${regiao}`)] : []),
            ...(usaSeguro(pagamento)
              ? [t('seguro.passo_seguro'), t('seguro.passo_oficina_seguro')]
              : [t(pagamento === 'proprio' ? 'seguro.passo_proprio' : 'seguro.passo_nao_sei')]),
          ].map((p, i) => (
            <Text key={i} className="text-sm text-gray-700 mb-1.5">{i + 1}. {p}</Text>
          ))}
        </View>
        <Pressable onPress={() => router.replace(user ? '/(tabs)' : '/(auth)/login')} className="bg-primary-600 rounded-lg px-6 py-3">
          <Text className="text-white font-semibold">{user ? t('tabs.solicitacoes') : t('emergencia.voltarInicio')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView keyboardDismissMode="on-drag" ref={rolagem} className="flex-1 bg-white px-4 pt-4" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Stack.Screen options={opcoesTela} />
      <Text className="text-gray-600 mb-6">{t('emergencia.subtitulo')}</Text>

      <Text className="text-sm font-medium text-gray-700 mb-1">{t('emergencia.fotoTitulo')}</Text>
      <Text className="text-xs text-gray-500 mb-2">{t('emergencia.fotoDica')}</Text>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {fotos.map((f, i) => (
          <Image key={i} source={{ uri: f.uri }} className="w-20 h-20 rounded-lg" />
        ))}
      </View>
      <View className="flex-row gap-2 mb-6">
        <Pressable onPress={handleFoto} className="flex-1 border border-gray-300 rounded-lg py-3 items-center flex-row justify-center gap-2">
          <Ionicons name="camera-outline" size={18} color="#374151" />
          <Text className="text-gray-700">{t('emergencia.fotoTitulo')}</Text>
        </Pressable>
        <Pressable onPress={handleGaleria} className="flex-1 border border-gray-300 rounded-lg py-3 items-center flex-row justify-center gap-2">
          <Ionicons name="images-outline" size={18} color="#374151" />
          <Text className="text-gray-700">{t('emergencia.galeria')}</Text>
        </Pressable>
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-1">{t('emergencia.descricaoLabel')}</Text>
      <TextInput accessibilityLabel={t('emergencia.descricaoLabel')}
        value={descricao}
        onChangeText={setDescricao}
        placeholder={t('emergencia.descricaoPlaceholder')}
        multiline
        numberOfLines={4}
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-[16px]"
        style={{ textAlignVertical: 'top' }}
      />

      {/* Seu carro (opcional): um toque se ja cadastrado; senao marca/modelo/placa */}
      <Text className="text-sm font-medium text-gray-700 mb-1">
        {t('emergencia.seuCarro')} <Text className="text-gray-400">({t('common.opcional')})</Text>
      </Text>
      <Text className="text-xs text-gray-500 mb-2">{t('emergencia.seuCarroDica')}</Text>
      {meusVeiculos.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mb-2">
          {meusVeiculos.map((v) => (
            <Pressable key={v.id} onPress={() => setVeiculoEscolhido(v.id)} accessibilityRole="radio" accessibilityState={{ checked: veiculoEscolhido === v.id }}
              className={`border-2 rounded-lg px-3 py-2 ${veiculoEscolhido === v.id ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
              <Text className="text-gray-900 text-sm font-medium">{v.fipe_marca} {v.fipe_modelo}</Text>
              {v.placa ? <Text className="text-gray-500 text-xs">{v.placa}</Text> : null}
            </Pressable>
          ))}
          <Pressable onPress={() => setVeiculoEscolhido(null)} accessibilityRole="radio" accessibilityState={{ checked: veiculoEscolhido === null }}
            className={`border-2 rounded-lg px-3 py-2 justify-center ${veiculoEscolhido === null ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
            <Text className="text-gray-900 text-sm font-medium">{t('emergencia.outroCarro')}</Text>
          </Pressable>
        </View>
      )}
      {veiculoEscolhido === null && (
        <View className="mb-2">
          <VehicleCatalogPicker label={t('veiculos.marca')} value={marca} onChange={(m) => { setMarca(m); setModelo(null); }} fetchUrl="/api/vehicle-catalog?tipo=cars" />
          {marca && (
            <VehicleCatalogPicker label={t('veiculos.modelo')} value={modelo} onChange={setModelo} fetchUrl={`/api/vehicle-catalog?tipo=cars&marca=${marca.code}`} />
          )}
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('veiculos.placa')}</Text>
          <TextInput accessibilityLabel={t('veiculos.placa')} value={placa} onChangeText={setPlaca} autoCapitalize="characters" maxLength={15}
            className="border border-gray-300 rounded-lg px-4 py-3 text-[16px]" />
        </View>
      )}
      <View className="mb-6" />

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('emergencia.whatHappenedLabel')}</Text>
      {(['eu_causei', 'outro_causou', 'sem_outro'] as Tipo[]).map((op) => {
        const k = op === 'eu_causei' ? 'EuCausei' : op === 'outro_causou' ? 'OutroCausou' : 'SemOutro';
        return (
          <Opcao key={op} ativo={tipo === op} titulo={t(`emergencia.option${k}Label`)} desc={t(`emergencia.option${k}Desc`)}
            onPress={() => { setTipo(op); if (op !== 'outro_causou' && pagamento === 'seguro_terceiro') setPagamento(''); }} />
        );
      })}

      <Text className="text-sm font-medium text-gray-700 mt-4 mb-1">{t('seguro.titulo')}</Text>
      <Text className="text-xs text-gray-500 mb-2">{t('seguro.subtitulo')}</Text>
      {opcoesPagamento(tipo).map((op) => (
        <Opcao key={op} ativo={pagamento === op} titulo={t(`seguro.opcao_${op}`)} onPress={() => setPagamento(op)} />
      ))}
      {usaSeguro(pagamento) && (
        <View className="bg-gray-50 rounded-lg p-3 mb-2">
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('seguro.labelSeguradora')}</Text>
          <TextInput accessibilityLabel={t('seguro.labelSeguradora')} value={seguradora} onChangeText={setSeguradora} maxLength={100} className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-2 text-[16px]" />
          {outroPais ? (
            <View className="mb-3">
              <Text className="text-xs font-medium text-gray-700 mb-1">{t('seguro.paisDoSeguro')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {PAISES_SEGURO.map((c) => (
                  <Pressable key={c} onPress={() => setPaisSeguro(c)} accessibilityRole="button" className={`px-3 py-1.5 rounded-full border ${(paisSeguro || paisAcid) === c ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
                    <Text className={(paisSeguro || paisAcid) === c ? 'text-white text-sm' : 'text-gray-700 text-sm'}>{nomePais(c)}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setPaisSeguro('XX')} accessibilityRole="button" className={`px-3 py-1.5 rounded-full border ${paisSeguro === 'XX' ? 'bg-primary-600 border-primary-600' : 'border-gray-300 bg-white'}`}>
                  <Text className={paisSeguro === 'XX' ? 'text-white text-sm' : 'text-gray-700 text-sm'}>{t('seguro.outroPaisLista')}</Text>
                </Pressable>
              </View>
              {paisSeguro && paisAcid && paisSeguro !== paisAcid && (
                // carta verde: o seguro estrangeiro atende pelo representante no pais do acidente
                <Text className="text-xs text-blue-900 bg-blue-50 rounded-lg p-2 mt-2">
                  {t('seguro.cartaVerde', { pais: nomePais(paisAcid) })}
                  {paisAcid === 'EE' ? <Text className="underline" onPress={() => Linking.openURL('https://www.lkf.ee/en/representatives')}> lkf.ee</Text> : null}
                </Text>
              )}
            </View>
          ) : (
            <Pressable onPress={() => setOutroPais(true)} accessibilityRole="button" hitSlop={6} className="mb-3 self-start">
              <Text className="text-xs text-primary-700 underline">{t('seguro.seguroOutroPais')}</Text>
            </Pressable>
          )}
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('seguro.labelSinistro')}</Text>
          <TextInput accessibilityLabel={t('seguro.labelSinistro')} value={sinistro} onChangeText={setSinistro} maxLength={60} autoCapitalize="characters" className="bg-white border border-gray-300 rounded-lg px-4 py-3 text-[16px]" />
          <Text className="text-xs text-gray-500 mt-1 mb-3">{t('seguro.ajudaSinistro')}</Text>
          {pagamento === 'seguro_proprio' && (
            <>
              <Text className="text-sm font-medium text-gray-700 mb-1">{t('seguro.labelFranquia')}</Text>
              <TextInput accessibilityLabel={t('seguro.labelFranquia')} value={franquia} onChangeText={(v) => setFranquia(v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" maxLength={12} className="bg-white border border-gray-300 rounded-lg px-4 py-3 text-[16px]" />
              <Text className="text-xs text-gray-500 mt-1">{t('seguro.ajudaFranquia')}</Text>
            </>
          )}
        </View>
      )}
      {pagamento ? (
        <Text className="text-sm text-blue-900 bg-blue-50 rounded-lg p-3 mb-2">
          {t(usaSeguro(pagamento) ? `seguro.dica_${pagamento}_${regiao}` : `seguro.dica_${pagamento}`)}
        </Text>
      ) : null}

      <Text className="text-sm font-medium text-gray-700 mt-4 mb-2">{t('emergencia.localTitulo')}</Text>
      <Pressable onPress={() => handleUsarLocalizacao()} className="flex-row items-center gap-2 border border-gray-300 rounded-lg py-3 px-4 mb-2">
        <Ionicons name="location-outline" size={18} color="#374151" />
        <Text className="text-gray-700">{buscandoLocal ? t('common.carregando') : t('emergencia.localPermitir')}</Text>
        {buscandoLocal && <ActivityIndicator size="small" color="#2563eb" />}
      </Pressable>
      {estadoLocal === 'ok' && !buscandoLocal && (
        <Text className="text-sm text-green-800 bg-green-50 rounded-lg p-3 mb-2">📍 {t('emergencia.localEncontrada')}</Text>
      )}
      {(estadoLocal === 'falhou' || estadoLocal === 'negado' || estadoLocal === 'negadoAjustes') && !buscandoLocal && (
        <View className="bg-amber-50 rounded-lg p-3 mb-2">
          <Text className="text-sm text-amber-900 mb-2">
            {estadoLocal === 'falhou' ? t('emergencia.erroLocalizacao') : t('emergencia.localNegadaTexto')}
          </Text>
          <View className="flex-row gap-2">
            {estadoLocal === 'negadoAjustes' ? (
              <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" className="bg-white border border-amber-300 rounded-lg px-3 py-2">
                <Text className="text-amber-900 font-medium">{t('emergencia.abrirAjustes')}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => handleUsarLocalizacao()} accessibilityRole="button" className="bg-white border border-amber-300 rounded-lg px-3 py-2">
                <Text className="text-amber-900 font-medium">{t('emergencia.tentarDeNovo')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      <View onLayout={(e) => { posEndereco.current = e.nativeEvent.layout.y; }} />
      <EnderecoAutocomplete
        aoFocar={() => setTimeout(() => rolagem.current?.scrollTo({ y: Math.max(0, posEndereco.current - 40), animated: true }), 250)}
        value={endereco}
        onChange={setEndereco}
        placeholder={t('emergencia.localTexto')}
        perto={coords}
        rotulo={t('emergencia.localTitulo')}
        onSelect={(s) => { setEndereco(s.rotulo); setCoords({ lat: s.latitude, lon: s.longitude }); if (s.paisCodigo) setPaisAcidente(s.paisCodigo); setEstadoLocal(''); }}
      />

      {!user && (
        <View className="bg-gray-50 rounded-lg p-3 mb-6">
          <Text className="text-sm font-semibold text-gray-900 mb-1">{t('emergencia.contatoTitulo')}</Text>
          <Text className="text-xs text-gray-500 mb-3">{t('emergencia.contatoTexto')}</Text>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.nome')}</Text>
          <TextInput accessibilityLabel={t('auth.nome')} value={nome} onChangeText={setNome} autoComplete="name" textContentType="name" maxLength={100} className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-3 text-[16px]" />
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
          <TextInput accessibilityLabel={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" maxLength={254} className="bg-white border border-gray-300 rounded-lg px-4 py-3 mb-3 text-[16px]" />
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.telefone')}</Text>
          <TextInput accessibilityLabel={t('auth.telefone')} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={30} className="bg-white border border-gray-300 rounded-lg px-4 py-3 text-[16px]" />
        </View>
      )}

      <Pressable
        onPress={handleEnviar}
        disabled={enviando || (!coords && !endereco) || faltaContato}
        className="bg-red-600 rounded-lg py-4 items-center mb-10 disabled:opacity-50"
      >
        {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('emergencia.enviarRegistro')}</Text>}
      </Pressable>
    </ScrollView>
  );
}
