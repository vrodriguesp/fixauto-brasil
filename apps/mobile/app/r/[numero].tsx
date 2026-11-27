import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { guardarDestino } from '../../lib/destino-pendente';

// Link curto do SMS/e-mail bipfix.com/r/<numero> (apps/web/src/app/r/[numero]/route.ts) aberto pelo app
// (App Links / Universal Links, 27/11). Oficina -> formulario do orcamento; motorista -> o pedido dele.
// Sem login: guarda o destino, pede login e segue (o link nunca "morre"). Pedido que a conta nao pode ver
// (RLS) -> explica e abre a lista.
export default function LinkCurtoScreen() {
  const { t } = useTranslation();
  const { numero } = useLocalSearchParams<{ numero: string }>();
  const { user, papel, loading } = useAuth();
  const [erro, setErro] = useState(false);
  const n = String(numero || '').replace(/\D/g, '').slice(0, 12);

  useEffect(() => {
    if (loading || !user || !n) return;
    (async () => {
      const { data } = await supabase.from('solicitacoes').select('id').eq('numero', Number(n)).maybeSingle();
      if (!data?.id) { setErro(true); return; }
      router.replace((papel === 'oficina' ? `/orcamento/${data.id}` : `/solicitacao/${data.id}`) as any);
    })();
  }, [loading, user?.id, papel, n]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && !user) {
    if (n) guardarDestino(`/r/${n}`);
    return <Redirect href="/(auth)/login" />;
  }
  if (erro || !n) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-6">
        <Text className="text-lg font-bold text-gray-900 text-center mb-2">{t('oficina.linkPedidoNaoEncontrado')}</Text>
        <Text className="text-gray-600 text-center mb-6">{t('oficina.linkPedidoNaoEncontradoTexto')}</Text>
        <Pressable onPress={() => router.replace(papel === 'oficina' ? '/(oficina)' : '/(tabs)')} accessibilityRole="button" className="bg-primary-600 rounded-xl px-6 py-3">
          <Text className="text-white font-semibold">{t('oficina.verPedidos')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator color="#2563eb" />
    </View>
  );
}
