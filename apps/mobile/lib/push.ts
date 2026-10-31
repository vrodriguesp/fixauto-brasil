import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { destinoDoAviso } from './destino-aviso';

// Push com o app fechado (OK do dono 31/10). O servidor manda pelo servico da
// Expo (FCM no Android, APNs no iPhone) cada aviso novo de `notificacoes`
// (migracao 066). Aqui: canal do Android, permissao (so depois do login, nunca
// na primeira abertura), token salvo na conta, token removido ao sair e o
// toque no aviso abre a tela certa (mesmo destino do aviso dentro do app).
const CHAVE_TOKEN = 'bipfix_push_token';
const CANAL = 'avisos';

// com o app aberto o aviso ja aparece no alto da tela (lib/avisos.tsx): o
// sistema nao mostra outro por cima, so guarda na central de notificacoes
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const projectId = (): string | undefined =>
  (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;

async function prepararCanal() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'BipFix',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0284c7',
  });
}

/** Pede permissao (se ainda nao respondeu) e grava o token desta conta. */
export async function registrarPush(): Promise<void> {
  // emulador/Expo Go nao recebem push de verdade
  if (!Device.isDevice) return;
  try {
    await prepararCanal();
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pid = projectId();
    if (!pid) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    if (!token) return;
    const { error } = await supabase.rpc('registrar_push_token', { p_token: token, p_plataforma: Platform.OS });
    if (!error) await AsyncStorage.setItem(CHAVE_TOKEN, token);
  } catch {
    // sem push o app continua igual (avisos dentro do app)
  }
}

/** Ao sair da conta: este aparelho deixa de receber os avisos dela. Chamar ANTES do signOut. */
export async function removerPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(CHAVE_TOKEN);
    if (token) await supabase.from('push_tokens').delete().eq('token', token);
    await AsyncStorage.removeItem(CHAVE_TOKEN);
  } catch { /* segue saindo */ }
}

function abrirDoPush(resp: Notifications.NotificationResponse | null) {
  const d = (resp?.notification.request.content.data || {}) as Record<string, string>;
  if (!d.tipo) return;
  if (d.notificacao_id) supabase.from('notificacoes').update({ lida: true }).eq('id', d.notificacao_id).then(() => {});
  const para = destinoDoAviso({ tipo: d.tipo, dados: d });
  if (para) router.push(para as any);
}

/** No layout raiz: registra ao entrar e abre a tela do aviso tocado. */
export function usePush(userId: string | null | undefined) {
  const tratada = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    registrarPush();
    // o sistema trocou o token do aparelho: grava o novo
    const subToken = Notifications.addPushTokenListener(() => { registrarPush(); });
    // toque no aviso com o app aberto ou em segundo plano
    const subToque = Notifications.addNotificationResponseReceivedListener((resp) => {
      tratada.current = resp.notification.request.identifier;
      abrirDoPush(resp);
    });
    // app aberto pelo toque no aviso (estava fechado)
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (!resp || tratada.current === resp.notification.request.identifier) return;
      tratada.current = resp.notification.request.identifier;
      abrirDoPush(resp);
    }).catch(() => {});
    return () => { subToken.remove(); subToque.remove(); };
  }, [userId]);
}
