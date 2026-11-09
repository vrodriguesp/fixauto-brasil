import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@fixauto/shared';
import { supabase } from '../../lib/supabase';

// Pagina da oficina DENTRO do app (dono 09/11): antes abria a pagina do site e, ao voltar,
// a pessoa caia no inicio do site, fora do app. Mesmos dados publicos do perfil do site:
// nome, endereco (mapa), nota, avaliacoes, servicos, fotos. Voltar = de onde veio.
interface Oficina {
  id: string; nome_fantasia: string; descricao: string | null; endereco: string | null; complemento: string | null;
  cidade: string | null; cep: string | null; latitude: number | null; longitude: number | null;
  especialidades: string[] | null; logo_url: string | null; avaliacao_media: number | null; total_avaliacoes: number | null; ativa: boolean;
}
interface Avaliacao { id: string; nota: number; comentario: string | null; created_at: string }

export default function OficinaScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [oficina, setOficina] = useState<Oficina | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [fotos, setFotos] = useState<{ id: string; foto_url: string }[]>([]);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'nada'>('carregando');

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    (async () => {
      const [{ data: o }, { data: av }, { data: fs }] = await Promise.all([
        supabase.from('oficinas').select('id, nome_fantasia, descricao, endereco, complemento, cidade, cep, latitude, longitude, especialidades, logo_url, avaliacao_media, total_avaliacoes, ativa').eq('id', id).maybeSingle(),
        supabase.from('avaliacoes').select('id, nota, comentario, created_at').eq('oficina_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('oficina_fotos').select('id, foto_url').eq('oficina_id', id).order('created_at', { ascending: false }).limit(12),
      ]);
      if (!vivo) return;
      const of = o as Oficina | null;
      if (!of || of.ativa === false) { setEstado('nada'); return; }
      setOficina(of); setAvaliacoes((av as Avaliacao[]) || []); setFotos((fs as any) || []); setEstado('ok');
    })();
    return () => { vivo = false; };
  }, [id]);

  if (estado === 'carregando') return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#2563eb" /></View>;
  if (estado === 'nada' || !oficina) return <View className="flex-1 items-center justify-center bg-white px-6"><Text className="text-gray-600 text-center">{t('oficinaPerfil.naoEncontrada')}</Text></View>;

  const endereco = [oficina.endereco, oficina.complemento, oficina.cep, oficina.cidade].filter(Boolean).join(', ');
  const abrirMapa = () => {
    const alvo = oficina.latitude != null && oficina.longitude != null ? `${oficina.latitude},${oficina.longitude}` : endereco;
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encodeURIComponent(alvo)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
    Linking.openURL(url).catch(() => {});
  };
  const media = Number(oficina.avaliacao_media || 0);
  const total = Number(oficina.total_avaliacoes || avaliacoes.length || 0);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 32 }} testID="tela-oficina">
      <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex-row items-center gap-3">
        {oficina.logo_url ? <Image source={{ uri: oficina.logo_url }} style={{ width: 56, height: 56, borderRadius: 12 }} /> : (
          <View className="w-14 h-14 rounded-xl bg-primary-50 items-center justify-center"><Ionicons name="storefront-outline" size={28} color="#1d4ed8" /></View>
        )}
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">{oficina.nome_fantasia}</Text>
          {total > 0 ? (
            <View className="flex-row items-center gap-1 mt-1">
              <Ionicons name="star" size={16} color="#f59e0b" />
              <Text className="text-sm text-gray-700">{t('oficinaPerfil.mediaAvaliacoes', { nota: media.toFixed(1), n: total })}</Text>
            </View>
          ) : <Text className="text-sm text-gray-500 mt-1">{t('oficinaPerfil.semAvaliacoes')}</Text>}
        </View>
      </View>

      {endereco ? (
        <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-900 mb-1">{t('oficinaPerfil.endereco')}</Text>
          <Text className="text-gray-700">{endereco}</Text>
          <Pressable onPress={abrirMapa} accessibilityRole="link" className="self-start mt-3 flex-row items-center gap-1.5 bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
            <Ionicons name="map-outline" size={18} color="#1d4ed8" />
            <Text className="text-primary-700 font-medium">{t('oficinaPerfil.abrirMapa')}</Text>
          </Pressable>
        </View>
      ) : null}

      {oficina.descricao ? (
        <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-900 mb-1">{t('oficinaPerfil.sobre')}</Text>
          <Text className="text-gray-700">{oficina.descricao}</Text>
        </View>
      ) : null}

      {(oficina.especialidades || []).length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-900 mb-2">{t('oficinaPerfil.especialidades')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {(oficina.especialidades || []).map((e) => (
              <Text key={e} className="text-sm text-gray-800 bg-gray-100 rounded-full px-3 py-1">{t(`constants.tiposServico.${e}`, e)}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {fotos.length > 0 ? (
        <View className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <Text className="text-sm font-semibold text-gray-900 mb-2">{t('oficinaPerfil.fotos')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {fotos.map((f) => <Image key={f.id} source={{ uri: f.foto_url }} style={{ width: 96, height: 96, borderRadius: 10 }} />)}
          </View>
        </View>
      ) : null}

      <View className="bg-white rounded-2xl border border-gray-200 p-4">
        <Text className="text-sm font-semibold text-gray-900 mb-2">{t('oficinaPerfil.avaliacoes')}</Text>
        {avaliacoes.length === 0 ? <Text className="text-gray-500">{t('oficinaPerfil.semAvaliacoes')}</Text> : avaliacoes.map((a) => (
          <View key={a.id} className="py-2 border-b border-gray-100">
            <View className="flex-row items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= a.nota ? 'star' : 'star-outline'} size={14} color="#f59e0b" />)}
              <Text className="text-xs text-gray-500 ml-2">{t('oficinaPerfil.cliente')} · {formatDate(a.created_at, i18n.language)}</Text>
            </View>
            {a.comentario ? <Text className="text-gray-700 mt-1">{a.comentario}</Text> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
