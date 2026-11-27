import { useEffect, useMemo, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { SITE_URL } from '../../lib/api';
import { destinoDoLinkCurto } from '../../lib/link-curto';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { guardarDestino, pegarDestino } from '../../lib/destino-pendente';
import LoginScreen from '../(auth)/login';

// Link curto do SMS/e-mail bipfix.com/r/<numero> (apps/web/src/app/r/[numero]/route.ts) aberto pelo app
// (App Links / Universal Links, 27/11). Oficina -> formulario do orcamento; motorista -> o pedido dele.
// Sem login: a tela de login aparece AQUI mesmo (nao navega para o grupo (auth): o redirecionamento de la
// para as abas vencia o do link - teste 27/11) e, ao entrar, o login volta a este endereco (destino-pendente)
// com a conta ja carregada. O link nunca "morre". Pedido que a conta nao pode ver (RLS) -> explica e abre a lista.
export default function LinkCurtoScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ numero: string } & Record<string, string>>();
  const numero = params.numero;
  const { user, papel, loading } = useAuth();
  const [erro, setErro] = useState(false);
  const n = String(numero || '').replace(/\D/g, '').slice(0, 12);
  // variantes do link que o site resolve SEM login (parar lembretes ?s=, acesso ?k=, chat ?c=&g=, novas datas &p=1,
  // "nao tenho interesse" &d=1...): abrem no navegador, nunca morrem (regra do dono 19/11; revisao Fable S2)
  const decisao = useMemo(() => destinoDoLinkCurto(params as Record<string, string>), [params]);
  const abriuNavegador = useRef(false);
  useEffect(() => {
    if (decisao.tipo !== 'navegador' || abriuNavegador.current) return;
    abriuNavegador.current = true;
    (async () => {
      await WebBrowser.openBrowserAsync(`${SITE_URL}/r/${n}?${decisao.query}`).catch(() => {});
      router.replace((user ? (papel === 'oficina' ? '/(oficina)' : '/(tabs)') : '/(auth)/login') as any);
    })();
  }, [decisao]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (decisao.tipo !== 'app' || loading || !user || !n) return;
    (async () => {
      const { data } = await supabase.from('solicitacoes').select('id').eq('numero', Number(n)).maybeSingle();
      if (!data?.id) { setErro(true); return; }
      pegarDestino(); // consumido: um login seguinte no mesmo processo nao reabre este link (M2)
      router.replace((papel === 'oficina' ? `/orcamento/${data.id}` : `/solicitacao/${data.id}`) as any);
    })();
  }, [loading, user?.id, papel, n, decisao.tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // guardado uma vez (nao a cada desenho)
  const semLogin = decisao.tipo === 'app' && !loading && !user;
  useEffect(() => { if (semLogin && n) guardarDestino(`/r/${n}`); }, [semLogin, n]);
  if (decisao.tipo === 'navegador') return <View className="flex-1 items-center justify-center bg-white"><ActivityIndicator color="#2563eb" /></View>;
  if (semLogin) return <LoginScreen />;
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
