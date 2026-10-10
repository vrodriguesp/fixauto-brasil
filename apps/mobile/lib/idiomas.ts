import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import i18n from '../i18n';

// Os 6 idiomas do app (mesmos do site), com o nome na propria lingua.
export const IDIOMAS = [
  { code: 'pt', label: 'Português (Brasil)', curto: 'PT' },
  { code: 'pt-PT', label: 'Português (Portugal)', curto: 'PT' },
  { code: 'en', label: 'English', curto: 'EN' },
  { code: 'et', label: 'Eesti', curto: 'ET' },
  { code: 'it', label: 'Italiano', curto: 'IT' },
  { code: 'ru', label: 'Русский', curto: 'RU' },
] as const;

const CHAVE = 'bipfix_idioma';

// Regra da Apple (decisao do dono 10/10): o app segue o idioma do iPhone,
// inclusive o idioma escolhido so para o BipFix em Ajustes > BipFix > Idioma
// (declarado em app.json, expo-localization supportedLocales). No app
// instalado no iPhone nao ha seletor proprio: o botao leva aos Ajustes.
// No Expo Go (os Ajustes seriam do Expo Go), no Android e na web o seletor
// do app continua.
export const idiomaPeloSistema = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Abre os Ajustes do app (iPhone: Ajustes > BipFix > Idioma). */
export function abrirAjustesDeIdioma() {
  Linking.openSettings().catch(() => {});
}

/** Troca o idioma e guarda a escolha (vale tambem antes de entrar na conta). */
export async function escolherIdioma(codigo: string) {
  if (idiomaPeloSistema) { abrirAjustesDeIdioma(); return; }
  await i18n.changeLanguage(codigo);
  try { await AsyncStorage.setItem(CHAVE, codigo); } catch { /* sem armazenamento: vale so nesta sessao */ }
}

/** Na abertura: a escolha salva no app vale sobre o idioma do aparelho (fora do iPhone). */
export async function restaurarIdioma() {
  try {
    if (idiomaPeloSistema) { await AsyncStorage.removeItem(CHAVE); return; } // vale o do iPhone
    const salvo = await AsyncStorage.getItem(CHAVE);
    if (salvo && IDIOMAS.some((i) => i.code === salvo) && i18n.language !== salvo) await i18n.changeLanguage(salvo);
  } catch { /* segue com o idioma do aparelho */ }
}

/** Idioma escolhido explicitamente no app (null = segue o aparelho). */
export async function idiomaEscolhido(): Promise<string | null> {
  if (idiomaPeloSistema) return null;
  try { return await AsyncStorage.getItem(CHAVE); } catch { return null; }
}
