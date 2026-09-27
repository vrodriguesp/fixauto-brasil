import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../lib/api';
import i18n from '../i18n';

// Coordenada default de Sao Paulo, so pro caso raro de geolocalizacao E
// geocodificacao por endereco falharem - mesmo fallback do site.
const COORDS_DEFAULT = { lat: -23.5505, lon: -46.6333 };

export default function EmergenciaScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [fotos, setFotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [descricao, setDescricao] = useState('');
  const [endereco, setEndereco] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets]);
  };

  const handleGaleria = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: true });
    if (!result.canceled) setFotos((prev) => [...prev, ...result.assets]);
  };

  const handleUsarLocalizacao = async () => {
    setBuscandoLocal(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setBuscandoLocal(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCoords({ lat, lon });
      const res = await fetch(`${API_BASE_URL}/api/geocode?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.cidade) setEndereco([data.cidade, data.estado, data.pais].filter(Boolean).join(', '));
    } finally {
      setBuscandoLocal(false);
    }
  };

  const uploadFotos = async (emergenciaId: string): Promise<string[]> => {
    if (fotos.length === 0) return [];
    const formData = new FormData();
    formData.append('emergenciaId', emergenciaId);
    fotos.forEach((foto, i) => {
      formData.append('fotos', { uri: foto.uri, name: `foto-${i}.jpg`, type: 'image/jpeg' } as any);
    });
    const res = await fetch(`${API_BASE_URL}/api/upload-emergencia`, { method: 'POST', body: formData });
    const data = await res.json();
    return data.urls || [];
  };

  const handleEnviar = async () => {
    setEnviando(true);
    try {
      let localCoords = coords;
      if (!localCoords && endereco) {
        const res = await fetch(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(endereco)}`);
        const data = await res.json();
        if (data.latitude && data.longitude) localCoords = { lat: data.latitude, lon: data.longitude };
      }
      const finalCoords = localCoords || COORDS_DEFAULT;

      const { data: emergencia, error: emergError } = await supabase
        .from('emergencias')
        .insert({
          profile_id: user?.id || null,
          nome: user?.nome || '',
          email: user?.email || '',
          telefone: user?.telefone || '',
          descricao: `[TIPO:outro_causou] ${descricao || 'Emergência - Colisão'}`,
          endereco,
          latitude: finalCoords.lat,
          longitude: finalCoords.lon,
          prioridade: 'urgente',
        })
        .select()
        .single();

      if (emergError || !emergencia) throw new Error(emergError?.message || t('common.erroGenerico'));

      const photoUrls = await uploadFotos(emergencia.id);

      await fetch(`${API_BASE_URL}/api/criar-solicitacao-emergencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emergenciaId: emergencia.id,
          clienteId: user?.id || null,
          nome: user?.nome || '',
          email: user?.email || '',
          telefone: user?.telefone || '',
          idioma: i18n.language,
          tipoAcidente: 'outro_causou',
          descricao: `[TIPO:outro_causou] ${descricao || 'Emergência - Colisão registrada pelo app'}`,
          latitude: finalCoords.lat,
          longitude: finalCoords.lon,
          endereco,
          photoUrls,
        }),
      });

      await fetch(`${API_BASE_URL}/api/notificar-oficinas-emergencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergenciaId: emergencia.id, latitude: finalCoords.lat, longitude: finalCoords.lon }),
      });

      setEnviado(true);
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), (e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <View className="flex-1 bg-white items-center justify-center px-6">
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text className="text-xl font-bold text-gray-900 mt-4 mb-2 text-center">{t('emergencia.sucessoTitulo')}</Text>
        <Text className="text-gray-600 text-center mb-8">{t('emergencia.sucessoTexto')}</Text>
        <Pressable onPress={() => router.replace('/(tabs)')} className="bg-primary-600 rounded-lg px-6 py-3">
          <Text className="text-white font-semibold">{t('tabs.solicitacoes')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white px-4 pt-4">
      <Stack.Screen options={{ headerShown: true, title: t('emergencia.titulo'), presentation: 'modal' }} />
      <Text className="text-gray-600 mb-6">{t('emergencia.subtitulo')}</Text>

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('emergencia.fotoTitulo')}</Text>
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
          <Text className="text-gray-700">{t('veiculos.adicionar')}</Text>
        </Pressable>
      </View>

      <Text className="text-sm font-medium text-gray-700 mb-1">{t('emergencia.descricaoLabel')}</Text>
      <TextInput
        value={descricao}
        onChangeText={setDescricao}
        placeholder={t('emergencia.descricaoPlaceholder')}
        multiline
        numberOfLines={4}
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
        style={{ textAlignVertical: 'top' }}
      />

      <Text className="text-sm font-medium text-gray-700 mb-2">{t('emergencia.localTitulo')}</Text>
      <Pressable onPress={handleUsarLocalizacao} className="flex-row items-center gap-2 border border-gray-300 rounded-lg py-3 px-4 mb-2">
        <Ionicons name="location-outline" size={18} color="#374151" />
        <Text className="text-gray-700">{buscandoLocal ? t('common.carregando') : t('emergencia.localPermitir')}</Text>
        {buscandoLocal && <ActivityIndicator size="small" color="#2563eb" />}
      </Pressable>
      <TextInput
        value={endereco}
        onChangeText={setEndereco}
        placeholder={t('emergencia.localTexto')}
        className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
      />

      <Pressable
        onPress={handleEnviar}
        disabled={enviando || (!coords && !endereco)}
        className="bg-red-600 rounded-lg py-4 items-center mb-10 disabled:opacity-50"
      >
        {enviando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('emergencia.enviarRegistro')}</Text>}
      </Pressable>
    </ScrollView>
  );
}
