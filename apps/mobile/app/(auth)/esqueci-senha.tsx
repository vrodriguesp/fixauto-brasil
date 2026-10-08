import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../lib/api';
import { mensagemErro } from '../../lib/erro';

export default function EsqueciSenhaScreen() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleEnviar = async () => {
    setLoading(true);
    // Mesma rota do site: manda (via Resend, no idioma da pessoa) um link
    // pra /reset-password no site. Antes o app usava o envio de e-mail do
    // proprio Supabase, que depende do SMTP do Supabase self-hosted estar
    // configurado. A rota e "anti-enumeracao" (responde sucesso exista ou
    // nao a conta) - um erro aqui e sempre falha de verdade (rede, envio).
    try {
      await apiFetch('/api/esqueci-senha', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), locale: i18n.language }),
      });
      setEnviado(true);
    } catch (err) {
      Alert.alert(t('common.erroGenerico'), mensagemErro(err));
    } finally {
      setLoading(false);
    }
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
          <TextInput accessibilityLabel={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-[16px]"
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
