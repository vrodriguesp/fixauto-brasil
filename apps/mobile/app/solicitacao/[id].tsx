import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import type { Solicitacao, Orcamento, DisponibilidadeSlot } from '@fixauto/shared';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';

export default function SolicitacaoDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [slotSelecionado, setSlotSelecionado] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*, oficina:oficinas(nome_fantasia))')
      .eq('id', id)
      .single();
    setSolicitacao(data as Solicitacao);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const handleAceitar = async (orcamento: Orcamento) => {
    const slotId = slotSelecionado[orcamento.id];
    if (!slotId) return;
    setProcessando(orcamento.id);
    try {
      await apiFetch('/api/aceitar-orcamento', { method: 'POST', body: JSON.stringify({ orcamentoId: orcamento.id, slotId }) });
      await carregar();
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), (e as Error).message);
    } finally {
      setProcessando(null);
    }
  };

  const handleRecusar = async (orcamento: Orcamento) => {
    setProcessando(orcamento.id);
    await supabase.from('orcamentos').update({ status: 'recusado' }).eq('id', orcamento.id);
    await carregar();
    setProcessando(null);
  };

  if (loading || !solicitacao) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const veiculo = solicitacao.veiculo;

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ headerShown: true, title: t('acompanhamento.titulo') }} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">{veiculo ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : ''}</Text>
        <Text className="text-gray-600 mb-1">{solicitacao.descricao}</Text>
        <Text className="text-sm text-gray-500 mb-4">{t(`constants.statusSolicitacao.${solicitacao.status}`, solicitacao.status)}</Text>

        <Pressable onPress={() => router.push(`/conversa/${solicitacao.id}`)} className="bg-primary-50 rounded-lg py-3 items-center mb-6">
          <Text className="text-primary-700 font-medium">{t('mensagens.titulo')}</Text>
        </Pressable>

        <Text className="text-base font-semibold text-gray-900 mb-3">{t('orcamentos.titulo')}</Text>

        {(solicitacao.orcamentos || []).length === 0 && (
          <Text className="text-gray-500">{t('dashboard.nenhumaSolicitacao')}</Text>
        )}

        {(solicitacao.orcamentos || []).map((orc) => (
          <View key={orc.id} className="bg-white rounded-xl p-4 mb-3 border border-gray-200">
            <Text className="font-semibold text-gray-900 mb-1">{t('orcamentos.recebidoDe', { oficina: orc.oficina?.nome_fantasia || '-' })}</Text>
            <Text className="text-2xl font-bold text-gray-900 mb-2">R$ {orc.valor_total.toFixed(2)}</Text>
            <Text className="text-xs text-gray-500 mb-3">{t(`orcamentos.status${orc.status.charAt(0).toUpperCase()}${orc.status.slice(1)}`)}</Text>

            {orc.status === 'enviado' || orc.status === 'visualizado' ? (
              <>
                {(orc.disponibilidade || []).map((slot: DisponibilidadeSlot) => (
                  <Pressable
                    key={slot.id}
                    onPress={() => setSlotSelecionado((prev) => ({ ...prev, [orc.id]: slot.id }))}
                    className={`border rounded-lg px-3 py-2 mb-2 ${slotSelecionado[orc.id] === slot.id ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
                  >
                    <Text className="text-sm text-gray-700">{new Date(slot.data_checkin).toLocaleDateString()} - {slot.turno}</Text>
                  </Pressable>
                ))}
                <View className="flex-row gap-2 mt-2">
                  <Pressable
                    onPress={() => handleRecusar(orc)}
                    disabled={processando === orc.id}
                    className="flex-1 border border-gray-300 rounded-lg py-3 items-center"
                  >
                    <Text className="text-gray-700 font-medium">{t('orcamentos.recusar')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleAceitar(orc)}
                    disabled={processando === orc.id || !slotSelecionado[orc.id]}
                    className="flex-1 bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50"
                  >
                    {processando === orc.id ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-medium">{t('orcamentos.aceitar')}</Text>}
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
