import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import type { Veiculo } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';

export default function VeiculosScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('veiculos').select('*').eq('profile_id', user.id).order('created_at', { ascending: false });
    setVeiculos((data as Veiculo[]) || []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <View className="flex-1 bg-gray-50 px-4 pt-14">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-2xl font-bold text-gray-900">{t('veiculos.titulo')}</Text>
        <Pressable onPress={() => router.push('/veiculo/novo')} className="bg-primary-600 rounded-full px-4 py-2">
          <Text className="text-white font-medium">{t('veiculos.adicionar')}</Text>
        </Pressable>
      </View>
      <FlatList
        data={veiculos}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} />}
        ListEmptyComponent={!loading ? <Text className="text-gray-500 text-center mt-8">{t('veiculos.nenhumVeiculo')}</Text> : null}
        renderItem={({ item }) => (
          <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200">
            <Text className="font-semibold text-gray-900">{item.apelido || `${item.fipe_marca} ${item.fipe_modelo}`}</Text>
            <Text className="text-gray-500 text-sm">{item.fipe_marca} {item.fipe_modelo} - {item.fipe_ano}</Text>
            {item.placa ? <Text className="text-gray-400 text-xs mt-1">{item.placa}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
