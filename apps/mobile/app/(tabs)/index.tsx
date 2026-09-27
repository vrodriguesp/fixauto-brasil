import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import type { Solicitacao } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import SolicitacaoCard from '../../components/SolicitacaoCard';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*)')
      .eq('cliente_id', user.id)
      .in('status', ['aberta', 'em_orcamento', 'aceita', 'em_andamento'])
      .order('created_at', { ascending: false });
    setSolicitacoes((data as Solicitacao[]) || []);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <View className="flex-1 bg-gray-50 px-4 pt-14">
      <Text className="text-2xl font-bold text-gray-900 mb-1">{t('dashboard.saudacao', { nome: user?.nome?.split(' ')[0] || '' })}</Text>

      <View className="flex-row gap-3 my-4">
        <Pressable onPress={() => router.push('/emergencia')} className="flex-1 bg-red-600 rounded-xl py-4 items-center">
          <Text className="text-white font-semibold">{t('dashboard.emergenciaBotao')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/nova-solicitacao')} className="flex-1 bg-primary-600 rounded-xl py-4 items-center">
          <Text className="text-white font-semibold">{t('dashboard.novaSolicitacaoBotao')}</Text>
        </Pressable>
      </View>

      <Text className="text-base font-semibold text-gray-900 mb-2">{t('dashboard.solicitacoesAtivas')}</Text>

      <FlatList
        data={solicitacoes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => <SolicitacaoCard solicitacao={item} />}
        ListEmptyComponent={!loading ? <Text className="text-gray-500 text-center mt-8">{t('dashboard.nenhumaSolicitacao')}</Text> : null}
      />
    </View>
  );
}
