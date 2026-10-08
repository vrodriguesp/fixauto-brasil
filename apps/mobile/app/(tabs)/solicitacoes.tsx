import { useEffect, useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import type { Solicitacao } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import SolicitacaoCard from '../../components/SolicitacaoCard';
import { useAvisos } from '../../lib/avisos';

export default function SolicitacoesScreen() {
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
      .order('created_at', { ascending: false });
    setSolicitacoes((data as Solicitacao[]) || []);
    setLoading(false);
  }, [user]);

  // aviso novo (orcamento, etapa do conserto, mensagem): recarrega na hora
  const { chegou: avisoChegou } = useAvisos();
  useEffect(() => { if (avisoChegou) carregar(); }, [avisoChegou]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  return (
    <View className="flex-1 bg-gray-50 px-4 pt-14">
      <Text className="text-2xl font-bold text-gray-900 mb-4">{t('tabs.solicitacoes')}</Text>
      <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
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
