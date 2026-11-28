import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Sem rede (auditoria 27/11, A4/M6): faixa no alto da lista (a lista anterior continua) e tela inteira quando
// ainda nao ha nada carregado. Sempre com "tentar de novo".
export function FaixaSemRede({ aoTentar, texto, variante = 'rede' }: { aoTentar: () => void; /** outro texto (erro do servidor) */ texto?: string; variante?: 'rede' | 'servidor' }) {
  const { t } = useTranslation();
  return (
    <View className="mx-4 mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex-row items-center gap-2" accessibilityRole="alert" testID={variante === 'servidor' ? 'faixa-erro-servidor' : 'faixa-sem-rede'}>
      <Ionicons name={variante === 'servidor' ? 'warning-outline' : 'cloud-offline-outline'} size={20} color="#92400e" />
      <Text className="flex-1 text-sm text-amber-900">{texto || t('oficina.semRede')}</Text>
      <Pressable onPress={aoTentar} accessibilityRole="button" className="px-3 py-2 rounded-lg bg-amber-200"><Text className="text-sm font-semibold text-amber-900">{t('oficina.tentarDeNovo')}</Text></Pressable>
    </View>
  );
}

export default function SemRede({ aoTentar }: { aoTentar: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center bg-gray-50 p-6" testID="tela-sem-rede">
      <Ionicons name="cloud-offline-outline" size={48} color="#6b7280" />
      <Text className="text-gray-800 text-center mt-3 text-base">{t('oficina.semRedeCurto')}</Text>
      <Pressable onPress={aoTentar} accessibilityRole="button" className="mt-5 bg-primary-600 rounded-xl px-6 py-3"><Text className="text-white font-semibold">{t('oficina.tentarDeNovo')}</Text></Pressable>
    </View>
  );
}
