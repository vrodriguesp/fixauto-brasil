import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { limparDescricao, ehAcidente } from '../lib/texto';
import { situacaoDoPedido } from '../lib/situacao';
import { textoSituacao } from './CartaoSituacao';

// Um cartao por pedido, todos no mesmo nivel (dono 09/11: com 2 pedidos abertos o segundo ficava
// escondido em "outros pedidos" e nao se entendia o que acontecia). Carro (ou "Acidente"), numero,
// situacao em palavras simples e o botao do proximo passo. Acidente: borda e selo vermelhos.
export default function CartaoPedido({ solicitacao }: { solicitacao: any }) {
  const { t, i18n } = useTranslation();
  const sit = situacaoDoPedido(solicitacao);
  const { titulo, agora } = textoSituacao(t, sit, i18n.language);
  const acidente = solicitacao.tipo === 'colisao' || !!solicitacao.emergencia_id || ehAcidente(solicitacao.descricao);
  const v = solicitacao.veiculo;
  const carro = v?.fipe_marca ? `${v.fipe_marca} ${v.fipe_modelo || ''}`.trim() : null;
  const nome = carro || (acidente ? t('pedidoCartao.acidente') : limparDescricao(solicitacao.descricao));
  return (
    <Pressable onPress={() => router.push(`/solicitacao/${solicitacao.id}`)} accessibilityRole="button"
      className={`bg-white rounded-2xl px-4 py-3 mb-3 ${acidente ? 'border-2 border-red-400' : 'border border-gray-200'}`} testID={acidente ? 'cartao-pedido-acidente' : 'cartao-pedido'}>
      <View className="flex-row items-center gap-2">
        {acidente ? (
          <View className="flex-row items-center gap-1 bg-red-100 rounded-full px-2 py-0.5">
            <Ionicons name="warning" size={12} color="#b91c1c" />
            <Text className="text-xs font-semibold text-red-800">{t('pedidoCartao.acidente')}</Text>
          </View>
        ) : null}
        <Text className="flex-1 font-semibold text-gray-900" numberOfLines={1}>{nome}</Text>
        {solicitacao.numero ? <Text className="text-xs text-gray-500">{t('constants.numeroPedido', { n: solicitacao.numero })}</Text> : null}
      </View>
      <View className={`self-start flex-row items-center gap-1 mt-2 px-2 py-1 rounded-full ${sit.selo.split(' ')[0]}`}>
        <Ionicons name={sit.icone} size={14} color="#111827" />
        <Text className={`text-sm font-semibold ${sit.selo.split(' ')[1]}`}>{titulo}</Text>
      </View>
      <Text className="text-sm text-gray-700 mt-1.5">{agora}</Text>
      <View className="self-start mt-2.5 bg-primary-600 rounded-lg px-4 py-2">
        <Text className="text-white font-semibold">{t(`situacao.botao_${sit.chave}`)}</Text>
      </View>
    </Pressable>
  );
}
