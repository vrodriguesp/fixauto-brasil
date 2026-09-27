import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import type { Solicitacao } from '@fixauto/shared';

const STATUS_COLOR: Record<string, string> = {
  aberta: 'bg-gray-100 text-gray-700',
  em_orcamento: 'bg-blue-100 text-blue-700',
  aceita: 'bg-amber-100 text-amber-700',
  em_andamento: 'bg-amber-100 text-amber-700',
  concluida: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-700',
};

export default function SolicitacaoCard({ solicitacao }: { solicitacao: Solicitacao }) {
  const { t } = useTranslation();
  const veiculo = solicitacao.veiculo;
  const qtdOrcamentos = solicitacao.orcamentos?.length || 0;

  return (
    <Pressable
      onPress={() => router.push(`/solicitacao/${solicitacao.id}`)}
      className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
    >
      <View className="flex-row justify-between items-start mb-2">
        <Text className="font-semibold text-gray-900 flex-1" numberOfLines={1}>
          {veiculo ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}` : solicitacao.descricao}
        </Text>
        <View className={`px-2 py-1 rounded-full ${STATUS_COLOR[solicitacao.status] || 'bg-gray-100'}`}>
          <Text className="text-xs font-medium">{t(`constants.statusSolicitacao.${solicitacao.status}`, solicitacao.status)}</Text>
        </View>
      </View>
      <Text className="text-gray-600 text-sm mb-2" numberOfLines={2}>
        {solicitacao.descricao}
      </Text>
      {qtdOrcamentos > 0 && (
        <Text className="text-primary-600 text-sm font-medium">
          {t('orcamentos.titulo')}: {qtdOrcamentos}
        </Text>
      )}
    </Pressable>
  );
}
