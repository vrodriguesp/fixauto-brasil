import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth-context';
import { useAvisos } from '../../lib/avisos';

const WEB_ROTULO = Platform.OS === 'web' ? { lineHeight: 14, flexShrink: 0 } : {};

// Abas da OFICINA (27/11, pedido do dono): Pedidos, Mensagens, Perfil. Motorista logado cai nas abas dele.
export default function OficinaTabsLayout() {
  const { isLoggedIn, loading, papel } = useAuth();
  const { naoLidos, mensagensNaoLidas } = useAvisos();
  const avisosPedidos = naoLidos.filter((a) => a.tipo !== 'nova_mensagem').length;
  const { t } = useTranslation();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }
  if (!isLoggedIn) return <Redirect href="/(auth)/login" />;
  if (papel !== 'oficina') return <Redirect href="/(tabs)" />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb', tabBarLabelStyle: { fontSize: 11, ...WEB_ROTULO }, ...(Platform.OS === 'web' ? { tabBarStyle: { height: 58 } } : {}) }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('oficina.abaPedidos'), tabBarBadge: avisosPedidos || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="mensagens"
        options={{ title: t('tabs.mensagens'), tabBarBadge: mensagensNaoLidas || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: t('tabs.perfil'), tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
