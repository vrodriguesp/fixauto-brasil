import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, FlatList, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PREFIXOS_TELEFONE, EXEMPLO_TELEFONE, prefixoPadrao, separarTelefone, juntarTelefone } from '@fixauto/shared';

// Telefone com prefixo internacional (dono 06/11): bandeira + codigo (no pais do
// mercado do idioma do app) ao lado do numero; devolve o numero completo
// ("+372 5123 4567"). O mesmo campo no site: apps/web/src/components/forms/CampoTelefone.tsx.
export default function CampoTelefone({ value, onChange, rotulo }: { value: string; onChange: (v: string) => void; rotulo: string }) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const padrao = prefixoPadrao(i18n.language);
  const [ddi, setDdi] = useState(() => separarTelefone(value, padrao).ddi);
  const [numero, setNumero] = useState(() => separarTelefone(value, padrao).numero);
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (juntarTelefone(ddi, numero) === (value || '')) return;
    const s = separarTelefone(value, padrao);
    setDdi(s.ddi); setNumero(s.numero);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (novoDdi: string, novoNumero: string) => {
    const s = /^\s*(\+|00)/.test(novoNumero) ? separarTelefone(novoNumero, novoDdi) : { ddi: novoDdi, numero: novoNumero };
    setDdi(s.ddi); setNumero(s.numero);
    onChange(juntarTelefone(s.ddi, s.numero));
  };
  const atual = PREFIXOS_TELEFONE.find((p) => p.ddi === ddi);

  return (
    <View className="flex-row gap-2">
      <Pressable onPress={() => setAberto(true)} accessibilityRole="button" accessibilityLabel={`${t('constants.prefixoTelefone')}: +${ddi}`}
        className="border border-gray-300 rounded-lg px-3 flex-row items-center gap-1">
        <Text className="text-[16px]">{atual?.bandeira} +{ddi}</Text>
        <Ionicons name="chevron-down" size={16} color="#6b7280" />
      </Pressable>
      <TextInput accessibilityLabel={rotulo} value={numero} onChangeText={(v) => mudar(ddi, v)} placeholder={EXEMPLO_TELEFONE[ddi]}
        keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={30}
        className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-[16px] bg-white" />
      <Modal visible={aberto} animationType={Platform.OS === 'web' ? 'none' : 'slide'} onRequestClose={() => setAberto(false)}>
        <View className="flex-1 bg-white px-4" style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom }}>
          <Text className="text-lg font-semibold text-gray-900 mb-3">{t('constants.prefixoTelefone')}</Text>
          <FlatList
            data={PREFIXOS_TELEFONE}
            keyExtractor={(p) => p.pais}
            renderItem={({ item }) => (
              <Pressable onPress={() => { mudar(item.ddi, numero); setAberto(false); }} accessibilityRole="button"
                className={`py-3 border-b border-gray-100 flex-row items-center gap-3 ${item.ddi === ddi ? 'bg-primary-50' : ''}`}>
                <Text className="text-xl">{item.bandeira}</Text>
                <Text className="text-base text-gray-900">{item.pais} +{item.ddi}</Text>
              </Pressable>
            )}
          />
          <Pressable onPress={() => setAberto(false)} className="py-4 items-center">
            <Text className="text-primary-600 font-medium">{t('common.cancelar')}</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
