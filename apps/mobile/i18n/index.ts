import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import pt from './locales/pt.json';
import en from './locales/en.json';
import et from './locales/et.json';
import it from './locales/it.json';

const SUPPORTED = ['pt', 'en', 'et', 'it'] as const;
export type SupportedLocale = (typeof SUPPORTED)[number];

function detectDeviceLocale(): SupportedLocale {
  const deviceLocale = Localization.getLocales()[0]?.languageCode;
  return (SUPPORTED as readonly string[]).includes(deviceLocale || '') ? (deviceLocale as SupportedLocale) : 'pt';
}

i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
    et: { translation: et },
    it: { translation: it },
  },
  lng: detectDeviceLocale(),
  fallbackLng: 'pt',
  // i18next por padrao interpola com chave DUPLA ({{variavel}}), mas todos
  // os textos em locales/*.json foram escritos com chave SIMPLES
  // ({variavel} - mesma convencao usada no site e no lib/notif-i18n.ts) -
  // sem isso, toda string com variavel (ex: "Ola, {nome}") aparecia
  // literal na tela, sem nunca substituir pelo valor de verdade. Achado
  // testando o app de verdade (nao so tsc), corrigido configurando o
  // interpolador pra chave simples em vez de reescrever ~50 chaves de
  // traducao.
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
});

export default i18n;
