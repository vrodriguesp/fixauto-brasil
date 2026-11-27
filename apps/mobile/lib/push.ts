import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import i18n from '../i18n';
import { supabase } from './supabase';
import { destinoDoAviso, type Papel } from './destino-aviso';
import { CANAIS, type Canal } from './canal-aviso';

// Push com o app fechado (OK do dono 31/10). O servidor manda pelo servico da
// Expo (FCM no Android, APNs no iPhone) cada aviso novo de `notificacoes`
// (migracao 066). Aqui: canal do Android, permissao (so depois do login, nunca
// na primeira abertura), token salvo na conta, token removido ao sair e o
// toque no aviso abre a tela certa (mesmo destino do aviso dentro do app).
const CHAVE_TOKEN = 'bipfix_push_token';
// quem esta logado (motorista ou oficina): o toque no aviso abre a tela do papel certo (27/11)
let papelAtual: Papel = 'cliente';

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

// Canais do Android por importancia (27/11; lib/canal-aviso.ts, espelho do servidor): 'pedidos' e
// 'mensagens' interrompem (heads-up + som); 'avisos' (lembretes, datas, etapas, pecas) e normal. Nome na
// lingua do app. Obs.: o Android nao deixa o app baixar a importancia de um canal ja criado - em aparelho
// antigo o canal 'avisos' continua alto ate a pessoa mexer nas configuracoes; instalacao nova ja vem certa.
const IMPORTANCIA: Record<Canal, Notifications.AndroidImportance> = {
  pedidos: Notifications.AndroidImportance.HIGH,
  mensagens: Notifications.AndroidImportance.HIGH,
  avisos: Notifications.AndroidImportance.DEFAULT,
};
async function prepararCanais() {
  if (Platform.OS !== 'android') return;
  for (const c of CANAIS) {
    await Notifications.setNotificationChannelAsync(c, {
      name: i18n.t(`push.canal_${c}`),
      importance: IMPORTANCIA[c],
      vibrationPattern: c === 'avisos' ? undefined : [0, 250, 250, 250],
      lightColor: '#0284c7',
    });
  }
}

/** Numero no icone do app = avisos nao lidos (lib/avisos.tsx chama a cada mudanca). Nunca lanca. */
export function atualizarBadge(n: number) {
  if (Platform.OS === 'web') return;
  Notifications.setBadgeCountAsync(Math.max(0, n)).catch(() => {});
}

// No iPhone, getExpoPushTokenAsync dispara o addPushTokenListener; se o listener chamasse
// registrarPush de novo, virava um laco infinito (15/11: ~20 mil chamadas em 3 min).
// Uma chamada por vez e o listener so reage a token do aparelho DIFERENTE do ultimo visto.
let emAndamento: Promise<void> | null = null;
let ultimoTokenAparelho: string | null = null;

/** Pede permissao (se ainda nao respondeu) e grava o token desta conta. */
export function registrarPush(): Promise<void> {
  if (!emAndamento) emAndamento = registrar().finally(() => { emAndamento = null; });
  return emAndamento;
}

async function registrar(): Promise<void> {
  // emulador/Expo Go nao recebem push de verdade
  if (!Device.isDevice) return;
  try {
    await prepararCanais();
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pid = projectId();
    if (!pid) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    if (!token) return;
    // versao do app no token (migracao 118): o servidor so usa os canais novos/badge em quem os tem
    const { error } = await supabase.rpc('registrar_push_token', { p_token: token, p_plataforma: Platform.OS, p_versao: Constants.expoConfig?.version ?? null });
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
  const para = destinoDoAviso({ tipo: d.tipo, dados: d }, papelAtual);
  if (para) router.push(para as any);
}

/** No layout raiz: registra ao entrar e abre a tela do aviso tocado (conforme o papel de quem entrou). */
export function usePush(userId: string | null | undefined, papel: Papel | null | undefined) {
  const tratada = useRef<string | null>(null);
  useEffect(() => { papelAtual = papel || 'cliente'; }, [papel]);
  useEffect(() => {
    if (!userId) return;
    registrarPush();
    // o sistema trocou o token do aparelho: grava o novo (o mesmo token de novo nao conta)
    const subToken = Notifications.addPushTokenListener((t) => {
      const novo = typeof t?.data === 'string' ? t.data : JSON.stringify(t?.data ?? '');
      if (novo === ultimoTokenAparelho) return;
      const primeiro = ultimoTokenAparelho === null;
      ultimoTokenAparelho = novo;
      // o 1o aviso vem do proprio registrarPush acima (mesmo token): nao registra de novo
      if (primeiro) return;
      registrarPush();
    });
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
