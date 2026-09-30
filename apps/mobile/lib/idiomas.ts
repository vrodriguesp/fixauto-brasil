import AsyncStorage from '@react-native-async-storage/async-storage';
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

/** Troca o idioma e guarda a escolha (vale tambem antes de entrar na conta). */
export async function escolherIdioma(codigo: string) {
  await i18n.changeLanguage(codigo);
  try { await AsyncStorage.setItem(CHAVE, codigo); } catch { /* sem armazenamento: vale so nesta sessao */ }
}

/** Na abertura: a escolha salva vale sobre o idioma do aparelho. */
export async function restaurarIdioma() {
  try {
    const salvo = await AsyncStorage.getItem(CHAVE);
    if (salvo && IDIOMAS.some((i) => i.code === salvo) && i18n.language !== salvo) await i18n.changeLanguage(salvo);
  } catch { /* segue com o idioma do aparelho */ }
}

/** Idioma escolhido explicitamente no app (null = segue aparelho/conta). */
export async function idiomaEscolhido(): Promise<string | null> {
  try { return await AsyncStorage.getItem(CHAVE); } catch { return null; }
}
