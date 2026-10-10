import { useEffect, useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import type { Solicitacao } from '@fixauto/shared';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import SolicitacaoCard from '../../components/SolicitacaoCard';
import { Ionicons } from '@expo/vector-icons';
import { useAvisos } from '../../lib/avisos';
import GarantiasAtivas from '../../components/GarantiasAtivas';
import AvaliacaoPendente from '../../components/AvaliacaoPendente';
import CartaoSituacao from '../../components/CartaoSituacao';
import { situacaoDoPedido } from '../../lib/situacao';

export default function DashboardScreen() {
  // topo pela area segura (Dynamic Island / Android edge-to-edge) - auditoria E16
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { naoLidos, abrir, atualizar } = useAvisos();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*), agenda(status, data_inicio, etapas:manutencao_etapas(status, created_at))')
      .eq('cliente_id', user.id)
      .in('status', ['aberta', 'em_orcamento', 'aceita', 'em_andamento'])
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
      atualizar();
    }, [carregar, atualizar])
  );

  // cartao de acao (auditoria 10/10, C1): o pedido mais urgente em destaque;
  // a lista embaixo fica com os outros
  const comSituacao = solicitacoes.map((s) => ({ s, sit: situacaoDoPedido(s) })).sort((a, b) => b.sit.prioridade - a.sit.prioridade);
  const destaque = comSituacao[0];
  const outros = comSituacao.slice(1).map((x) => x.s);

  return (
    <View className="flex-1 bg-gray-50 px-4" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-2xl font-bold text-gray-900 flex-1">{t('dashboard.saudacao', { nome: user?.nome?.split(' ')[0] || '' })}</Text>
        {/* sino: todas as interacoes, a mais recente no alto */}
        <Pressable onPress={() => router.push('/notificacoes')} accessibilityRole="button" accessibilityLabel={t('notificacoes.titulo')} hitSlop={10} className="p-2">
          <Ionicons name="notifications-outline" size={26} color="#111827" />
          {naoLidos.length > 0 && (
            <View className="absolute right-0 top-0 bg-red-500 rounded-full min-w-[18px] h-[18px] px-1 items-center justify-center">
              <Text className="text-white text-[10px] font-bold">{naoLidos.length > 9 ? '9+' : naoLidos.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View className="flex-row gap-3 my-4">
        <Pressable onPress={() => router.push('/emergencia')} accessibilityRole="button" className="flex-1 bg-red-600 rounded-2xl px-3 py-4 items-center justify-center gap-2 active:opacity-90">
          <Ionicons name="car-sport" size={26} color="#fff" />
          <Text className="text-white font-semibold text-center">{t('dashboard.emergenciaBotao')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/nova-solicitacao')} accessibilityRole="button" className="flex-1 bg-primary-600 rounded-2xl px-3 py-4 items-center justify-center gap-2 active:opacity-90">
          <Ionicons name="construct-outline" size={26} color="#fff" />
          <Text className="text-white font-semibold text-center">{t('dashboard.novaSolicitacaoBotao')}</Text>
        </Pressable>
      </View>

      {/* pedido mais urgente logo abaixo dos botoes, em destaque (dono 10/10) */}
      {destaque && <CartaoSituacao solicitacao={destaque.s} situacao={destaque.sit} comBotao />}

      <AvaliacaoPendente recarregar={avisoChegou} />
      <GarantiasAtivas recarregar={avisoChegou} />

      {naoLidos.length > 0 && (
        <View className="mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-2">{t('dashboard.avisos')}</Text>
          {naoLidos.slice(0, 3).map((a) => (
            <Pressable key={a.id} onPress={() => abrir(a)} accessibilityRole="button" className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-2 flex-row items-center gap-3">
              <Ionicons name="notifications-outline" size={18} color="#92400e" />
              <View className="flex-1">
                <Text className="text-amber-900 font-semibold" numberOfLines={1}>{a.titulo}</Text>
                {a.mensagem ? <Text className="text-amber-800 text-sm" numberOfLines={2}>{a.mensagem}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {(outros.length > 0 || (!loading && !destaque)) && <Text className="text-base font-semibold text-gray-900 mb-2">{destaque ? t('situacao.outros') : t('dashboard.solicitacoesAtivas')}</Text>}

      <FlatList keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
        data={outros}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={carregar} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => <SolicitacaoCard solicitacao={item} />}
        ListEmptyComponent={!loading && !destaque ? <Text className="text-gray-500 text-center mt-8">{t('dashboard.nenhumaSolicitacao')}</Text> : null}
      />
    </View>
  );
}
