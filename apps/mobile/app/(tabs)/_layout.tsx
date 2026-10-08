import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth-context';
import { useAvisos } from '../../lib/avisos';

export default function TabsLayout() {
  const { isLoggedIn, loading } = useAuth();
  // numeros nas abas: avisos dos pedidos e mensagens nao lidas
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

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb', tabBarLabelStyle: { fontSize: 11 } }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.inicio'), tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="solicitacoes"
        options={{ title: t('tabs.solicitacoes'), tabBarBadge: avisosPedidos || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="mensagens"
        options={{ title: t('tabs.mensagens'), tabBarBadge: mensagensNaoLidas || undefined, tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="veiculos"
        options={{ title: t('tabs.veiculos'), tabBarIcon: ({ color, size }) => <Ionicons name="car-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: t('tabs.perfil'), tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
