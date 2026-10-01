import { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth-context';

// Link de confirmacao do e-mail (https://bipfix.com/<idioma>/confirmar-email?
// token_hash=...) aberto DENTRO do app quando ele esta instalado (Universal
// Links / App Links, ver app.json e /.well-known no site). Confirma e ja entra.
export default function ConfirmarEmailApp() {
  const { t } = useTranslation();
  const opcoesTela = useMemo(() => ({ headerShown: false }), []);
  const { token_hash } = useLocalSearchParams<{ token_hash?: string }>();
  const { refreshProfile } = useAuth();
  const [estado, setEstado] = useState<'verificando' | 'erro'>('verificando');
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    if (!token_hash) { setEstado('erro'); return; }
    supabase.auth.verifyOtp({ token_hash: String(token_hash), type: 'email' }).then(async ({ error }) => {
      if (error) { setEstado('erro'); return; }
      await refreshProfile();
      router.replace('/(tabs)');
    });
  }, [token_hash, refreshProfile]);

  return (
    <View className="flex-1 bg-white items-center justify-center px-6">
      <Stack.Screen options={opcoesTela} />
      {estado === 'verificando' ? (
        <>
          <ActivityIndicator color="#0284c7" />
          <Text className="text-gray-600 mt-4">{t('auth.confirmando')}</Text>
        </>
      ) : (
        <>
          <Ionicons name="alert-circle-outline" size={56} color="#d97706" />
          <Text className="text-lg font-semibold text-gray-900 mt-3 text-center">{t('auth.linkInvalidoTitulo')}</Text>
          <Text className="text-gray-600 mt-2 mb-6 text-center">{t('auth.linkInvalidoTexto')}</Text>
          <Pressable onPress={() => router.replace('/(auth)/login')} className="bg-primary-600 rounded-lg px-6 py-3">
            <Text className="text-white font-semibold">{t('auth.irLogin')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
