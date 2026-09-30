import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Link, router } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { urlTermos, urlPrivacidade } from '../../lib/links-legais';

export default function CadastroScreen() {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Aceite explicito dos Termos e da Politica (App Store 5.1.1 / Google Play)
  const [aceitou, setAceitou] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleCriarConta = async () => {
    setErro(null);
    if (senha.length < 8) {
      setErro(t('auth.senhaCurta'));
      return;
    }
    if (senha !== confirmarSenha) {
      setErro(t('auth.senhasNaoConferem'));
      return;
    }
    if (!aceitou) return;
    setLoading(true);
    const { error } = await signUp(email.trim(), senha, nome.trim(), telefone.trim());
    setLoading(false);
    if (error) {
      setErro(error);
      return;
    }
    setEnviado(true);
  };

  if (enviado) {
    return (
      <View className="flex-1 bg-white justify-center px-6">
        <Text className="text-2xl font-bold text-gray-900 mb-3">{t('auth.verifiqueTitulo')}</Text>
        <Text className="text-base text-gray-700 mb-2">{t('auth.verifiqueTexto', { email: email.trim() })}</Text>
        <Text className="text-sm text-gray-500 mb-8">{t('auth.verifiqueDepois')}</Text>
        <Pressable onPress={() => router.replace('/(auth)/login')} className="bg-primary-600 rounded-lg py-4 items-center">
          <Text className="text-white font-semibold text-base">{t('auth.irLogin')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-12">
        <Text className="text-xl font-semibold text-gray-900 mb-6">{t('auth.cadastroTitulo')}</Text>

        {erro && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <Text className="text-red-700 text-sm">{erro}</Text>
          </View>
        )}

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.nome')}</Text>
        <TextInput accessibilityLabel={t('auth.nome')} value={nome} onChangeText={setNome} className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base" />

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
        <TextInput accessibilityLabel={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">
          {t('auth.telefone')} <Text className="text-gray-400">({t('common.opcional')})</Text>
        </Text>
        <TextInput accessibilityLabel={t('auth.telefone')}
          value={telefone}
          onChangeText={setTelefone}
          keyboardType="phone-pad"
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
        />

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.senha')}</Text>
        <TextInput accessibilityLabel={t('auth.senha')} value={senha} onChangeText={setSenha} secureTextEntry className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base" />

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.confirmarSenha')}</Text>
        <TextInput accessibilityLabel={t('auth.confirmarSenha')}
          value={confirmarSenha}
          onChangeText={setConfirmarSenha}
          secureTextEntry
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
        />

        <Pressable
          onPress={() => setAceitou(!aceitou)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: aceitou }}
          className="flex-row items-start gap-3 mb-6 py-1"
        >
          <View className={`w-6 h-6 rounded border-2 items-center justify-center mt-0.5 ${aceitou ? 'bg-primary-600 border-primary-600' : 'border-gray-400'}`}>
            {aceitou && <Text className="text-white text-xs font-bold">✓</Text>}
          </View>
          <Text className="flex-1 text-sm text-gray-700">
            {t('auth.aceiteTexto1')}{' '}
            <Text className="text-primary-600 underline" onPress={() => WebBrowser.openBrowserAsync(urlTermos(i18n.language))}>{t('auth.termos')}</Text>
            {' '}{t('auth.aceiteTexto2')}{' '}
            <Text className="text-primary-600 underline" onPress={() => WebBrowser.openBrowserAsync(urlPrivacidade(i18n.language))}>{t('auth.privacidade')}</Text>
          </Text>
        </Pressable>

        <Pressable
          onPress={handleCriarConta}
          disabled={loading || !nome || !email || !senha || !aceitou}
          className="bg-primary-600 rounded-lg py-4 items-center mb-6 disabled:opacity-50"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('auth.criarConta')}</Text>}
        </Pressable>

        <View className="flex-row justify-center gap-1">
          <Text className="text-gray-600">{t('auth.jaTemConta')}</Text>
          <Link href="/(auth)/login" className="text-primary-600 font-medium">
            {t('auth.entrar')}
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
