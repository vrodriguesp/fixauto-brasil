import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Solicitacao } from '@fixauto/shared';
import { limparDescricao, ehAcidente } from '../lib/texto';
import { situacaoDoPedido } from '../lib/situacao';
import { textoSituacao } from './CartaoSituacao';

// selo com a mesma situacao/cores do cartao de acao e do cabecalho do pedido
// (auditoria 10/10, B3: antes "Orcamento Enviado" em azul quando havia orcamento
// para comparar, e aceita/em andamento com a mesma cor)
export default function SolicitacaoCard({ solicitacao }: { solicitacao: Solicitacao }) {
  const { t, i18n } = useTranslation();
  const veiculo = solicitacao.veiculo;
  const sit = situacaoDoPedido(solicitacao);
  const { titulo: rotulo } = textoSituacao(t, sit, i18n.language);
  // carro sem dados (acidente registrado sem o carro): titulo "Acidente"
  const titulo = veiculo?.fipe_marca
    ? `${veiculo.fipe_marca} ${veiculo.fipe_modelo}`
    : ehAcidente(solicitacao.descricao) ? t('acompanhamento.acidente') : limparDescricao(solicitacao.descricao);
  const texto = limparDescricao(solicitacao.descricao);
  const numero = (solicitacao as any).numero;

  return (
    <Pressable
      onPress={() => router.push(`/solicitacao/${solicitacao.id}`)}
      className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
    >
      <View className="flex-row justify-between items-start gap-2 mb-2">
        <Text className="font-semibold text-gray-900 flex-1" numberOfLines={1}>
          {titulo}
        </Text>
        <View className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${sit.selo.split(' ')[0]}`}>
          <Ionicons name={sit.icone} size={12} color="#111827" />
          <Text className={`text-xs font-medium ${sit.selo.split(' ')[1]}`}>{rotulo}</Text>
        </View>
      </View>
      {texto && texto !== titulo ? (
        <Text className="text-gray-600 text-sm mb-1" numberOfLines={2}>
          {texto}
        </Text>
      ) : null}
      {numero ? <Text className="text-xs text-gray-500">{t('constants.numeroPedido', { n: numero })}</Text> : null}
    </Pressable>
  );
}
