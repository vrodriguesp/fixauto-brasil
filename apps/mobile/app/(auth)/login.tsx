import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth-context';
import { API_BASE_URL } from '../../lib/api';
import { IDIOMAS, escolherIdioma } from '../../lib/idiomas';

// Tela de entrada: marca, atalho de acidente SEM conta (quem acabou de bater
// nao deve parar num cadastro), login e idioma.
export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);
  const [reenviado, setReenviado] = useState(false);
  const [menuIdioma, setMenuIdioma] = useState(false);
  const idiomaAtual = IDIOMAS.find((i) => i.code === i18n.language) || IDIOMAS[2];

  const handleEntrar = async () => {
    setErro(null);
    setNaoConfirmado(false);
    setLoading(true);
    const { error } = await signIn(email.trim(), senha);
    setLoading(false);
    if (error) {
      if (error === 'email_not_confirmed') {
        setNaoConfirmado(true);
        setErro(t('auth.naoConfirmado'));
      } else if (error === 'invalid_credentials') {
        setErro(t('auth.credenciaisInvalidas'));
      } else if (error.startsWith('over_')) {
        setErro(t('auth.muitasTentativas'));
      } else {
        setErro(t('common.erroGenerico'));
      }
      return;
    }
    router.replace('/(tabs)');
  };

  const selos = [
    { icone: 'shield-checkmark-outline' as const, texto: t('auth.selo1') },
    { icone: 'pricetag-outline' as const, texto: t('auth.selo2') },
    { icone: 'lock-closed-outline' as const, texto: t('auth.selo3') },
  ];

  return (
    <SafeAreaView className="flex-1 bg-sky-50" edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow px-5 pb-10" keyboardShouldPersistTaps="handled">
          {/* Topo: idioma */}
          <View className="flex-row justify-end pt-2">
            <Pressable
              onPress={() => setMenuIdioma(true)}
              accessibilityRole="button"
              accessibilityLabel={t('auth.idioma')}
              className="flex-row items-center gap-1 bg-white border border-gray-200 rounded-full px-3 py-2"
            >
              <Ionicons name="globe-outline" size={16} color="#0369a1" />
              <Text className="text-sm font-semibold text-gray-800">{idiomaAtual.curto}</Text>
              <Ionicons name="chevron-down" size={14} color="#6b7280" />
            </Pressable>
          </View>

          {/* Marca */}
          <View className="items-center mt-4 mb-6">
            <Image source={require('../../assets/logo.png')} style={{ width: 220, height: 49 }} resizeMode="contain" accessibilityLabel="BipFix" />
            <Text className="text-center text-gray-600 text-base mt-3 px-4">{t('auth.slogan')}</Text>
          </View>

          {/* Acidente sem conta */}
          <Pressable
            onPress={() => router.push('/emergencia')}
            accessibilityRole="button"
            className="bg-red-600 rounded-2xl p-4 flex-row items-center gap-4 mb-6 active:opacity-90"
            style={{ shadowColor: '#dc2626', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
          >
            <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center">
              <Ionicons name="car-sport" size={26} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-lg font-bold">{t('emergencia.titulo')}</Text>
              <Text className="text-red-50 text-sm">{t('auth.emergenciaTexto')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </Pressable>

          {/* Login */}
          <View
            className="bg-white rounded-2xl p-5 mb-6"
            style={{ shadowColor: '#0c4a6e', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}
          >
            <Text className="text-xl font-bold text-gray-900 mb-4">{t('auth.loginTitulo')}</Text>

            {erro && (
              <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
                <Text className="text-red-700 text-sm">{erro}</Text>
                {naoConfirmado && (reenviado ? (
                  <Text className="text-green-700 text-sm mt-2">{t('auth.linkReenviado')}</Text>
                ) : (
                  <Pressable
                    onPress={async () => {
                      await fetch(`${API_BASE_URL}/api/cadastro/reenviar`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email.trim(), idioma: i18n.language, origem: 'app' }),
                      }).catch(() => {});
                      setReenviado(true);
                    }}
                    className="mt-2 py-2"
                  >
                    <Text className="text-primary-600 text-sm font-medium underline">{t('auth.reenviarLink')}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</Text>
            <View className="flex-row items-center border border-gray-300 rounded-xl px-3 mb-4 bg-white">
              <Ionicons name="mail-outline" size={18} color="#9ca3af" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                className="flex-1 px-2 py-3 text-base"
              />
            </View>

            <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.senha')}</Text>
            <View className="flex-row items-center border border-gray-300 rounded-xl px-3 mb-2 bg-white">
              <Ionicons name="lock-closed-outline" size={18} color="#9ca3af" />
              <TextInput
                value={senha}
                onChangeText={setSenha}
                secureTextEntry={!verSenha}
                autoComplete="password"
                textContentType="password"
                className="flex-1 px-2 py-3 text-base"
              />
              <Pressable onPress={() => setVerSenha(!verSenha)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t(verSenha ? 'auth.ocultarSenha' : 'auth.mostrarSenha')}>
                <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
              </Pressable>
            </View>

            <Link href="/(auth)/esqueci-senha" className="text-primary-600 text-sm mb-5 self-end py-1">
              {t('auth.esqueciSenha')}
            </Link>

            <Pressable
              onPress={handleEntrar}
              disabled={loading || !email || !senha}
              className="bg-primary-600 rounded-xl py-4 items-center disabled:opacity-50"
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('auth.entrar')}</Text>}
            </Pressable>

            <View className="flex-row justify-center gap-1 mt-5">
              <Text className="text-gray-600">{t('auth.naoTemConta')}</Text>
              <Link href="/(auth)/cadastro" className="text-primary-600 font-semibold">
                {t('auth.criarConta')}
              </Link>
            </View>
          </View>

          {/* Confianca */}
          <View className="gap-3 px-1">
            {selos.map((s) => (
              <View key={s.icone} className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-white items-center justify-center border border-sky-100">
                  <Ionicons name={s.icone} size={16} color="#0369a1" />
                </View>
                <Text className="flex-1 text-sm text-gray-700">{s.texto}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Escolha de idioma */}
      <Modal visible={menuIdioma} transparent animationType="fade" onRequestClose={() => setMenuIdioma(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setMenuIdioma(false)}>
          <View className="bg-white rounded-t-3xl px-5 pt-5 pb-10">
            <Text className="text-lg font-bold text-gray-900 mb-3">{t('auth.idioma')}</Text>
            {IDIOMAS.map((idi) => (
              <Pressable
                key={idi.code}
                onPress={async () => { await escolherIdioma(idi.code); setMenuIdioma(false); }}
                className="flex-row items-center justify-between py-3.5 border-b border-gray-100"
              >
                <Text className={`text-base ${idi.code === i18n.language ? 'font-bold text-primary-700' : 'text-gray-800'}`}>{idi.label}</Text>
                {idi.code === i18n.language && <Ionicons name="checkmark" size={20} color="#0369a1" />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
