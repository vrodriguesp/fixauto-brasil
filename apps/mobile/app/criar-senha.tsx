import { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import RolagemTeclado from '../components/RolagemTeclado';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';
import { adiarSenha } from '../lib/senha-adiada';

// "Crie a sua senha" (dono 12/11): tela cheia depois de entrar sem senha (codigo
// do pedido ou codigo de login) enquanto a conta nao tem senha
// (profiles.senha_definida = false; migracao 080). "Agora nao" pula ate o app
// fechar; volta no proximo login. Salvar: o banco marca senha_definida sozinho.
// ?voltar= tela para abrir depois (o pedido recem-enviado); sem ele, as abas.
export default function CriarSenhaScreen() {
  const { t } = useTranslation();
  const { voltar } = useLocalSearchParams<{ voltar?: string }>();
  const { refreshProfile } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salva, setSalva] = useState(false);

  const seguir = () => router.replace((typeof voltar === 'string' && voltar.startsWith('/') ? voltar : '/(tabs)') as any);

  const salvar = async () => {
    Keyboard.dismiss();
    setErro(null);
    if (senha.length < 8) { setErro(t('auth.senhaCurta')); return; }
    if (senha !== confirmar) { setErro(t('auth.senhasNaoConferem')); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setSalvando(false);
      setErro((error as { code?: string }).code === 'weak_password' ? t('auth.senhaCurta') : t('common.erroGenerico'));
      return;
    }
    setSalva(true);
    await refreshProfile();
    setSalvando(false);
    setTimeout(seguir, 1200);
  };

  if (salva) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
        <Text accessibilityRole="alert" className="text-lg font-semibold text-gray-900 mt-4 text-center">{t('auth.senhaCriada')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <RolagemTeclado bottomOffset={24} className="flex-1" keyboardDismissMode="on-drag" contentContainerClassName="flex-grow justify-center px-6 py-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-gray-900 mb-2">{t('auth.criarSenhaTitulo')}</Text>
        <Text className="text-gray-600 mb-6">{t('auth.criarSenhaTexto')}</Text>

        {erro && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <Text accessibilityRole="alert" className="text-red-700 text-sm">{erro}</Text>
          </View>
        )}

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.senha')}</Text>
        <View className="flex-row items-center border border-gray-300 rounded-xl px-3 mb-4 bg-white">
          <TextInput accessibilityLabel={t('auth.senha')} value={senha} onChangeText={setSenha} secureTextEntry={!verSenha}
            autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={72}
            className="flex-1 px-2 py-3 text-[16px]" />
          <Pressable onPress={() => setVerSenha((v) => !v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t(verSenha ? 'auth.ocultarSenha' : 'auth.mostrarSenha')}>
            <Ionicons name={verSenha ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
          </Pressable>
        </View>

        <Text className="text-sm font-medium text-gray-700 mb-1">{t('auth.repitaSenha')}</Text>
        <TextInput accessibilityLabel={t('auth.repitaSenha')} value={confirmar} onChangeText={setConfirmar} secureTextEntry={!verSenha}
          autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" maxLength={72}
          returnKeyType="go" onSubmitEditing={() => { if (!salvando && senha && confirmar) salvar(); }}
          className="border border-gray-300 rounded-xl px-4 py-3 mb-6 text-[16px]" />

        <Pressable onPress={salvar} disabled={salvando || !senha || !confirmar} accessibilityRole="button"
          className="bg-primary-600 rounded-xl py-4 items-center disabled:opacity-50">
          {salvando ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold text-base">{t('common.salvar')}</Text>}
        </Pressable>
        <Pressable onPress={() => { adiarSenha(); seguir(); }} disabled={salvando} accessibilityRole="button" className="min-h-[48px] justify-center items-center mt-2">
          <Text className="text-gray-600 underline">{t('auth.agoraNao')}</Text>
        </Pressable>
      </RolagemTeclado>
    </SafeAreaView>
  );
}
