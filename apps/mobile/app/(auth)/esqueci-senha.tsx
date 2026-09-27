import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

export default function EsqueciSenhaScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleEnviar = async () => {
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    setEnviado(true);
  };

  return (
    <View className="flex-1 bg-white justify-center px-6">
      <Text className="text-xl font-semibold text-gray-900 mb-2">{t('auth.recuperarTitulo')}</Text>
      <Text className="text-gray-600 mb-6">{t('auth.recuperarTexto')}</Text>

      {enviado ? (
        <View className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <Text className="text-green-700 text-sm">{t('auth.linkEnviado')}</Text>
        </View>
      ) : (
        <>
          <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
          />
          <Pressable
            onPress={handleEnviar}
            disabled={loading || !email}
            className="bg-primary-600 rounded-lg py-4 items-center disabled:opacity-50"
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('common.enviar')}</Text>}
          </Pressable>
        </>
      )}
    </View>
  );
}
