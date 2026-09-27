import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link, router } from 'expo-router';
import { useAuth } from '../../lib/auth-context';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleEntrar = async () => {
    setErro(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), senha);
    setLoading(false);
    if (error) {
      setErro(error);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="text-3xl font-bold text-gray-900 mb-8">BipFix</Text>
        <Text className="text-xl font-semibold text-gray-900 mb-6">{t('auth.loginTitulo')}</Text>

        {erro && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <Text className="text-red-700 text-sm">{erro}</Text>
          </View>
        )}

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.senha')}</Text>
        <TextInput
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          className="border border-gray-300 rounded-lg px-4 py-3 mb-2 text-base"
        />

        <Link href="/(auth)/esqueci-senha" className="text-primary-600 text-sm mb-6 self-end">
          {t('auth.esqueciSenha')}
        </Link>

        <Pressable
          onPress={handleEntrar}
          disabled={loading || !email || !senha}
          className="bg-primary-600 rounded-lg py-4 items-center mb-6 disabled:opacity-50"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('auth.entrar')}</Text>}
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-gray-600">{t('auth.naoTemConta')}</Text>
          <Link href="/(auth)/cadastro" className="text-primary-600 font-medium">
            {t('auth.criarConta')}
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
