import '../global.css';
import '../i18n';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { usePush } from '../lib/push';
import { restaurarIdioma } from '../lib/idiomas';
import { AvisosProvider } from '../lib/avisos';
import { instalarCapturaDeErros, enviarDiagnostico } from '../lib/diagnostico';

// erros de JavaScript do aparelho chegam ao monitoramento do admin
instalarCapturaDeErros();

restaurarIdioma();

// tela que quebra ao desenhar: em vez de tela branca, aviso com "tentar de novo"; o erro vai ao monitoramento
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => { enviarDiagnostico('tela-quebrou', error?.message || String(error), { stack: error?.stack?.slice(0, 2000) }); }, [error]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f9fafb' }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' }}>{t('erroTela.titulo')}</Text>
      <Text style={{ fontSize: 15, color: '#4b5563', textAlign: 'center', marginTop: 8 }}>{t('erroTela.texto')}</Text>
      <Pressable onPress={retry} accessibilityRole="button" style={{ marginTop: 20, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{t('erroTela.tentar')}</Text>
      </Pressable>
    </View>
  );
}

// push com o app fechado: registra o aparelho da conta e abre a tela do aviso tocado
function PushDaConta() {
  const { user } = useAuth();
  usePush(user?.id);
  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <SafeAreaProvider>
      {/* teclado: no Android edge-to-edge (SDK 54+) a janela nao encolhe mais
          sozinha; o keyboard-controller move os campos (guia de teclado da Expo) */}
      <KeyboardProvider>
      <AuthProvider>
        <AvisosProvider>
        <PushDaConta />
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          {/* Modais com o cabecalho fixo desde a abertura: no iPhone, ligar o
              cabecalho de dentro da tela (Stack.Screen) recria a tela e ela
              recomeca sem parar (novo pedido carregando sem fim, teste 09/10) */}
          <Stack.Screen name="emergencia" options={{ presentation: 'modal', headerShown: true, title: t('emergencia.titulo') }} />
          <Stack.Screen name="nova-solicitacao" options={{ presentation: 'modal', headerShown: true, title: t('novaSolicitacao.titulo') }} />
        </Stack>
        </AvisosProvider>
      </AuthProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
