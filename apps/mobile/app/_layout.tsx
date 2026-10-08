import '../global.css';
import '../i18n';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../lib/auth-context';
import { restaurarIdioma } from '../lib/idiomas';
import { AvisosProvider } from '../lib/avisos';

restaurarIdioma();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AvisosProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="emergencia" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="nova-solicitacao" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        </AvisosProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
