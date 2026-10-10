import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@fixauto/shared';
import { situacaoDoPedido, type Situacao } from '../lib/situacao';

// Cartao "o que esta acontecendo e o que fazer agora" (auditoria do site 10/10,
// C1/C2). No Inicio mostra o pedido mais urgente com um botao; no pedido e o
// cabecalho (sem botao, a tela ja e o pedido).
const COR_ICONE: Record<Situacao['chave'], string> = {
  aguardando: '#0369a1', comparar: '#b45309', agendado: '#4338ca', naOficina: '#c2410c', pronto: '#047857',
  entregue: '#374151', avaliar: '#a16207', cancelado: '#6b7280', naoFoi: '#b91c1c',
};

export function textoSituacao(t: (k: string, o?: any) => string, s: Situacao, locale: string) {
  const titulo = t(`situacao.titulo_${s.chave}`, { n: s.n });
  let agora = t(`situacao.agora_${s.chave}`);
  if (s.chave === 'agendado') agora = s.dia ? t('situacao.agora_agendado', { dia: formatDate(s.dia, locale) }) : t('situacao.agora_agendadoSemDia');
  if (s.chave === 'naOficina') agora = s.etapa ? t('situacao.agora_naOficina', { etapa: t(`constants.statusManutencao.${s.etapa}`, s.etapa) }) : t('situacao.agora_naOficinaSemEtapa');
  return { titulo, agora };
}

export default function CartaoSituacao({ solicitacao, situacao, comBotao = false }: { solicitacao: any; situacao?: Situacao; comBotao?: boolean }) {
  const { t, i18n } = useTranslation();
  const s = situacao || situacaoDoPedido(solicitacao);
  const { titulo, agora } = textoSituacao(t, s, i18n.language);
  const carro = solicitacao.veiculo?.fipe_marca ? `${solicitacao.veiculo.fipe_marca} ${solicitacao.veiculo.fipe_modelo || ''}`.trim() : null;
  return (
    <View className={`rounded-2xl px-4 py-3 mb-4 ${comBotao ? 'border-2 shadow-md' : 'border'} ${s.fundo}`} testID={`situacao-${s.chave}`}
      style={comBotao ? { elevation: 3 } : undefined}>
      <View className="flex-row items-center gap-2">
        <Ionicons name={s.icone} size={22} color={COR_ICONE[s.chave]} />
        <Text className={`flex-1 text-base font-bold ${s.texto}`}>{titulo}</Text>
      </View>
      {comBotao && carro ? <Text className="text-sm text-gray-700 mt-0.5">{carro}</Text> : null}
      <Text className="text-sm text-gray-700 mt-1">{agora}</Text>
      {comBotao && (
        <Pressable onPress={() => router.push(`/solicitacao/${solicitacao.id}`)} accessibilityRole="button"
          className="self-start mt-3 bg-primary-600 rounded-lg px-4 py-2.5 active:opacity-90">
          <Text className="text-white font-semibold">{t(`situacao.botao_${s.chave}`)}</Text>
        </Pressable>
      )}
    </View>
  );
}
