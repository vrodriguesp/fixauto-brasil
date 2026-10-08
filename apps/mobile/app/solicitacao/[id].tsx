import { useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useFocusEffect, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Solicitacao, Orcamento, DisponibilidadeSlot, ManutencaoEtapa, Avaliacao } from '@fixauto/shared';
import { formatCurrency, formatDate, currencyForCountry } from '@fixauto/shared';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { mensagemErro } from '../../lib/erro';
import { turnoDisponivel, type Turno } from '../../lib/turnos';
import { limparDescricao, ehAcidente } from '../../lib/texto';
import EditarPedido from '../../components/EditarPedido';
import { useAvisos } from '../../lib/avisos';

export default function SolicitacaoDetailScreen() {
  const { t, i18n } = useTranslation();
  // Opcoes do cabecalho criadas uma vez: objeto novo a cada desenho fazia o
  // cabecalho e a tela se redesenharem sem fim no iPhone ("Maximum update depth").
  const tituloTela = t('acompanhamento.titulo');
  const opcoesTela = useMemo(() => ({ headerShown: true, title: tituloTela }), [tituloTela]);
  const locale = i18n.language;
  const { user } = useAuth();
  const { atualizar: atualizarAvisos } = useAvisos();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [etapas, setEtapas] = useState<ManutencaoEtapa[]>([]);
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [notaSelecionada, setNotaSelecionada] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [slotSelecionado, setSlotSelecionado] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes')
      .select('*, veiculo:veiculos(*), orcamentos(*, oficina:oficinas(id, nome_fantasia, pais, profile_id), disponibilidade:orcamento_disponibilidade!orcamento_disponibilidade_orcamento_id_fkey(*))')
      .eq('id', id)
      .single();
    setSolicitacao(data as Solicitacao);
    // avisos deste pedido (orcamento novo, carro chegou, etapas) ficam lidos
    if (user) {
      supabase.from('notificacoes').update({ lida: true }).eq('profile_id', user.id).neq('tipo', 'nova_mensagem').eq('dados->>solicitacao_id', id)
        .then(() => atualizarAvisos());
    }

    const { data: agendaRows } = await supabase
      .from('agenda')
      .select('id')
      .eq('solicitacao_id', id);
    const agendaIds = (agendaRows || []).map((a) => a.id);
    if (agendaIds.length > 0) {
      const { data: etapasData } = await supabase
        .from('manutencao_etapas')
        .select('*')
        .in('agenda_id', agendaIds)
        .order('created_at', { ascending: true });
      setEtapas((etapasData as ManutencaoEtapa[]) || []);
    } else {
      setEtapas([]);
    }

    const { data: avaliacaoData } = await supabase
      .from('avaliacoes')
      .select('*')
      .eq('solicitacao_id', id)
      .maybeSingle();
    setAvaliacao((avaliacaoData as Avaliacao) || null);

    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar])
  );

  const handleEnviarAvaliacao = async () => {
    if (!notaSelecionada || !user || !solicitacao) return;
    const orcamentoAceito = (solicitacao.orcamentos || []).find((o) => o.status === 'aceito');
    const oficinaId = orcamentoAceito?.oficina?.id;
    if (!oficinaId) return;
    setEnviandoAvaliacao(true);
    try {
      const { data, error } = await supabase
        .from('avaliacoes')
        .insert({ solicitacao_id: solicitacao.id, oficina_id: oficinaId, cliente_id: user.id, nota: notaSelecionada, comentario: comentario.trim() || null })
        .select()
        .single();
      if (error) {
        Alert.alert(t('common.erroGenerico'), mensagemErro(error));
      } else if (data) {
        setAvaliacao(data as Avaliacao);
        await apiFetch('/api/atualizar-avaliacao-oficina', { method: 'POST', body: JSON.stringify({ oficinaId }) }).catch(() => {});
      }
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
    } finally {
      setEnviandoAvaliacao(false);
    }
  };

  const handleAceitar = async (orcamento: Orcamento) => {
    const slotId = slotSelecionado[orcamento.id];
    if (!slotId) return;
    setProcessando(orcamento.id);
    try {
      await apiFetch('/api/aceitar-orcamento', { method: 'POST', body: JSON.stringify({ orcamentoId: orcamento.id, slotId }) });
      await carregar();
    } catch (e) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(e));
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
      <Stack.Screen options={opcoesTela} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">
          {veiculo?.fipe_marca ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : ehAcidente(solicitacao.descricao) ? t('acompanhamento.acidente') : ''}
        </Text>
        {limparDescricao(solicitacao.descricao) ? <Text className="text-gray-600 mb-1">{limparDescricao(solicitacao.descricao)}</Text> : null}
        <Text className="text-sm text-gray-500 mb-4">{t(`constants.statusSolicitacao.${solicitacao.status}`, solicitacao.status)}</Text>

        {['aberta', 'em_orcamento'].includes(solicitacao.status) && (
          <EditarPedido key={`${solicitacao.id}-${veiculo?.fipe_marca || ''}`} solicitacaoId={solicitacao.id} descricao={solicitacao.descricao} veiculo={(veiculo as any) || null} aoSalvar={carregar} />
        )}

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
            <Text className="text-2xl font-bold text-gray-900 mb-2">{formatCurrency(orc.valor_total, currencyForCountry((orc.oficina as any)?.pais), locale)}</Text>
            <Text className="text-xs text-gray-500 mb-3">{t(`orcamentos.status${orc.status.charAt(0).toUpperCase()}${orc.status.slice(1)}`)}</Text>

            {orc.status === 'enviado' || orc.status === 'visualizado' ? (
              <>
                {(orc.disponibilidade || []).length > 0 && (
                  <Text className="text-sm font-medium text-gray-700 mb-2">{t('orcamentos.escolhaData')}</Text>
                )}
                {/* horario que ja passou nao se escolhe */}
                {(orc.disponibilidade || []).length > 0 && (orc.disponibilidade || []).every((slot: DisponibilidadeSlot) => !turnoDisponivel(slot.data_checkin, slot.turno as Turno)) && (
                  <Text className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 mb-2">{t('orcamentos.horariosVencidos')}</Text>
                )}
                {(orc.disponibilidade || []).filter((slot: DisponibilidadeSlot) => turnoDisponivel(slot.data_checkin, slot.turno as Turno)).map((slot: DisponibilidadeSlot) => (
                  <Pressable
                    key={slot.id}
                    onPress={() => setSlotSelecionado((prev) => ({ ...prev, [orc.id]: slot.id }))}
                    className={`border rounded-lg px-3 py-2 mb-2 ${slotSelecionado[orc.id] === slot.id ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}
                  >
                    <Text className="text-sm text-gray-700">{formatDate(slot.data_checkin, locale)} - {t(`orcamentos.turno_${slot.turno}`, slot.turno)} ({slot.turno === 'manha' ? '08:00-12:00' : '13:00-17:00'})</Text>
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
                    accessibilityState={{ disabled: processando === orc.id || !slotSelecionado[orc.id] }}
                    className="flex-1 bg-primary-600 rounded-lg py-3 items-center"
                    style={{ opacity: processando === orc.id || !slotSelecionado[orc.id] ? 0.45 : 1 }}
                  >
                    {processando === orc.id ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-medium">{t('orcamentos.aceitar')}</Text>}
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        ))}

        {etapas.length > 0 && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3 mt-2">{t('acompanhamento.titulo')}</Text>
            <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
              {etapas.map((etapa, i) => (
                <View key={etapa.id} className={`flex-row items-start gap-3 ${i < etapas.length - 1 ? 'pb-4' : ''}`}>
                  <View className={`w-3 h-3 rounded-full mt-1 ${i === etapas.length - 1 ? 'bg-primary-600' : 'bg-gray-300'}`} />
                  <View className="flex-1">
                    <Text className={`text-sm ${i === etapas.length - 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                      {t(`constants.statusManutencao.${etapa.status}`, etapa.status)}
                    </Text>
                    <Text className="text-xs text-gray-400">{formatDate(etapa.created_at, locale)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {solicitacao.status === 'concluida' && (
          <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
            {avaliacao ? (
              <>
                <Text className="text-base font-semibold text-gray-900 mb-2">{t('avaliacao.jaAvaliado')}</Text>
                <View className="flex-row gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Ionicons key={n} name={n <= avaliacao.nota ? 'star' : 'star-outline'} size={22} color="#f59e0b" />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text className="text-base font-semibold text-gray-900 mb-1">{t('avaliacao.titulo')}</Text>
                <Text className="text-sm text-gray-500 mb-3">{t('avaliacao.subtitulo')}</Text>
                <View className="flex-row gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setNotaSelecionada(n)}>
                      <Ionicons name={n <= notaSelecionada ? 'star' : 'star-outline'} size={32} color="#f59e0b" />
                    </Pressable>
                  ))}
                </View>
                <TextInput accessibilityLabel={t('avaliacao.comentarioPlaceholder')}
                  value={comentario}
                  onChangeText={setComentario}
                  placeholder={t('avaliacao.comentarioPlaceholder')}
                  multiline
                  numberOfLines={3}
                  className="border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm"
                  style={{ textAlignVertical: 'top' }}
                />
                <Pressable
                  onPress={handleEnviarAvaliacao}
                  disabled={!notaSelecionada || enviandoAvaliacao}
                  className="bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50"
                >
                  {enviandoAvaliacao ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-medium">{t('avaliacao.enviar')}</Text>}
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
