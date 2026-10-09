import '../global.css';
import '../i18n';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth-context';
import { restaurarIdioma } from '../lib/idiomas';
import { AvisosProvider } from '../lib/avisos';
import { instalarCapturaDeErros } from '../lib/diagnostico';

// erros de JavaScript do aparelho chegam ao monitoramento do admin
instalarCapturaDeErros();

restaurarIdioma();

export default function RootLayout() {
  const { t } = useTranslation();
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AvisosProvider>
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
    </SafeAreaProvider>
  );
}
